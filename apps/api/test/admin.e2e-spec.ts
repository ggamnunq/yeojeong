import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminCodefUsage,
  AdminUserDetail,
  AdminUserListResponse,
  AdminWithdrawUserResponse,
} from '@yeojeong/shared';
import request from 'supertest';
import { AdminAuditLog } from './../src/admin/admin-audit.js';
import { AdminConfig, actorIdOf } from './../src/admin/admin-config.js';
import { hashPassword } from './../src/admin/password-hash.js';
import { createLogger } from './../src/common/logging/logger.js';
import { PurgeService } from './../src/retention/purge.service.js';
import type { PrismaClient } from './../src/generated/prisma/client.js';
import { createTestAuth, TEST_ORIGIN } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import {
  createFixturePrisma,
  ExpenseFixtures,
  reachableDatabaseUrl,
} from './expenses-fixtures.js';

// 관리자 페이지(ADMIN) e2e. 실제 DB(관리자 세션·시도 제한·접근 기록) + 사용자 세션은 스텁.
// 증명: 미설정 404 · 일반 메시지 · 시도 제한 429 · 세션 분리 · 만료(유휴·절대·자격 증명 교체·로그아웃) · CSRF ·
//       접근 기록 · 로그에 아이디·비밀번호 없음 · 상세에 결제 내용 없음 · 탈퇴 파이프라인 재사용 · CODEF 집계
const databaseUrl = await reachableDatabaseUrl();

const USERNAME = 'ops-admin-e2e';
const PASSWORD = 'e2e-Admin-Pw-9f3k2-correct-horse';
const WRONG_PASSWORD = 'e2e-wrong-pw-7c1d0-battery-staple';
const COOKIE = '__Host-yj_admin';
const ACTOR_ID = actorIdOf(USERNAME);
const MERCHANT = 'E2E-SECRET-MERCHANT-4411';
const AMOUNT = '98765';
const REASON = '고객센터 요청 처리 e2e-reason-55aa';
const DAY_MS = 86_400_000;
const kstDayString = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3_600_000 + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);

let ipSeq = 10;
/** 테스트마다 다른 클라이언트 IP(TRUST_PROXY_HOPS=1 + X-Forwarded-For) — rate limit·시도 제한이 섞이지 않게 */
const nextIp = () => `198.51.100.${ipSeq++}`;

function adminCookieOf(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${COOKIE}=`));
  if (!line) throw new Error('관리자 쿠키가 없다');
  return line.split(';')[0];
}

describe('Admin disabled (no ADMIN_* env)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('answers every /api/admin/* exactly like an unknown route (404, no admin headers, no CSRF 403)', async () => {
    const unknown = await request(app.getHttpServer())
      .get('/api/definitely-not-a-route')
      .expect(404);
    for (const [method, path] of [
      ['get', '/api/admin/users'],
      ['get', '/api/admin/session'],
      ['get', '/api/admin/codef-usage'],
      ['post', '/api/admin/login'],
      ['post', '/api/admin/logout'],
      ['get', '/api/admin'],
      ['get', '/api/admin/'],
      ['post', '/api/Admin/login'],
      ['get', '/api/ADMIN/users'],
      [
        'post',
        '/api/admin/users/00000000-0000-4000-8000-000000000000/withdraw',
      ],
    ] as const) {
      const res = await request(app.getHttpServer())
        [method](path)
        .send({ username: 'x', password: 'y' })
        .expect(404);
      expect(res.body).toEqual({
        ...unknown.body,
        requestId: expect.any(String),
      });
      expect(res.headers['x-robots-tag']).toBeUndefined();
      expect(res.headers['cache-control']).toBe(
        unknown.headers['cache-control'],
      );
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });
});

describe.skipIf(!databaseUrl)('Admin console (e2e, real DB)', () => {
  let prisma: PrismaClient;
  let fx: ExpenseFixtures;
  let app: NestExpressApplication;
  let auth: ReturnType<typeof createTestAuth>;
  let adminConfig: AdminConfig;
  let raw = '';

  const server = () => app.getHttpServer();
  const post = (path: string, ip = nextIp()) =>
    request(server())
      .post(path)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip);
  const get = (path: string, ip = nextIp()) =>
    request(server()).get(path).set('X-Forwarded-For', ip);

  async function login(ip = nextIp()) {
    const res = await post('/api/admin/login', ip)
      .send({ username: USERNAME, password: PASSWORD })
      .expect(200);
    return adminCookieOf(res);
  }

  beforeAll(async () => {
    prisma = createFixturePrisma(databaseUrl as string);
    fx = new ExpenseFixtures(prisma);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'info');
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    vi.stubEnv('CODEF_DAILY_CALL_BUDGET', '40');
    vi.stubEnv('FEATURE_CARD_IMPORT', 'allowlist');
    adminConfig = new AdminConfig({
      username: USERNAME,
      // 테스트는 가벼운 비용(N = 2^14)
      passwordHash: await hashPassword(PASSWORD, { N: 16_384, r: 8, p: 1 }),
    });
    auth = createTestAuth();
    const logger = createLogger(new ConfigService(), {
      write: (line: string) => {
        raw += line;
      },
    });
    app = await createTestApp([], {
      auth,
      prisma: 'real',
      logger,
      overrides: [[AdminConfig, adminConfig]],
    });
  });

  beforeEach(async () => {
    await prisma.adminLoginThrottle.deleteMany();
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    await prisma.accessLog.deleteMany({ where: { userId: ACTOR_ID } });
    await prisma.adminSession.deleteMany();
    await prisma.adminLoginThrottle.deleteMany();
    await fx.cleanup();
    await prisma.$disconnect();
  });

  describe('login', () => {
    it('rejects wrong password and wrong username with the same generic message, and records the failure', async () => {
      const before = await prisma.accessLog.count({
        where: { userId: ACTOR_ID, action: 'ADMIN_LOGIN_FAILED' },
      });
      const badPw = await post('/api/admin/login')
        .send({ username: USERNAME, password: WRONG_PASSWORD })
        .expect(401);
      const badUser = await post('/api/admin/login')
        .send({ username: 'someone-else', password: PASSWORD })
        .expect(401);
      for (const res of [badPw, badUser]) {
        expect(res.body).toMatchObject({
          code: 'ADMIN_LOGIN_FAILED',
          message: '아이디 또는 비밀번호가 맞지 않아요',
        });
        expect(res.body.details).toBeUndefined();
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.headers['cache-control']).toBe('no-store');
      }
      const rows = await prisma.accessLog.findMany({
        where: { userId: ACTOR_ID, action: 'ADMIN_LOGIN_FAILED' },
        orderBy: { at: 'desc' },
        take: 2,
      });
      expect(rows.length + before).toBeGreaterThanOrEqual(2);
      expect(rows[0]).toMatchObject({
        resourceType: 'ADMIN',
        details: { reason: 'BAD_CREDENTIALS' },
      });
      expect(rows[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('validates input without echoing values', async () => {
      const res = await post('/api/admin/login')
        .send({ username: USERNAME })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body)).not.toContain(USERNAME);
    });

    it('requires an allowed Origin (CSRF) — even before checking credentials', async () => {
      await request(server())
        .post('/api/admin/login')
        .set('X-Forwarded-For', nextIp())
        .send({ username: USERNAME, password: PASSWORD })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('CSRF_REJECTED'));
      await request(server())
        .post('/api/admin/login')
        .set('Origin', 'https://evil.example')
        .set('X-Forwarded-For', nextIp())
        .send({ username: USERNAME, password: PASSWORD })
        .expect(403);
    });

    it('limits attempts per IP (5 per 15 min → 429 with Retry-After, even with the right password)', async () => {
      const ip = nextIp();
      for (let i = 0; i < 5; i += 1) {
        await post('/api/admin/login', ip)
          .send({ username: USERNAME, password: WRONG_PASSWORD })
          .expect(401);
      }
      const blocked = await post('/api/admin/login', ip)
        .send({ username: USERNAME, password: PASSWORD })
        .expect(429);
      expect(blocked.body.code).toBe('ADMIN_LOGIN_RATE_LIMITED');
      expect(blocked.body.details.retryAfterSec).toBeGreaterThan(0);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.headers['set-cookie']).toBeUndefined();
      const limited = await prisma.accessLog.findFirst({
        where: { userId: ACTOR_ID, action: 'ADMIN_LOGIN_FAILED' },
        orderBy: { at: 'desc' },
      });
      expect(limited?.details).toEqual({ reason: 'RATE_LIMITED' });
      // 다른 IP는 영향 없음
      await login();
    });

    it('locks every IP after too many failures overall (distributed guessing), success resets', async () => {
      for (let i = 0; i < 20; i += 1) {
        await post('/api/admin/login')
          .send({ username: USERNAME, password: WRONG_PASSWORD })
          .expect(401);
      }
      const locked = await post('/api/admin/login')
        .send({ username: USERNAME, password: PASSWORD })
        .expect(429);
      expect(locked.body.code).toBe('ADMIN_LOGIN_RATE_LIMITED');
      // 창이 끝나면(DB 카운터 기준) 다시 된다
      await prisma.adminLoginThrottle.updateMany({
        data: { windowStartedAt: new Date(Date.now() - 16 * 60_000) },
      });
      await login();
      expect(
        await prisma.adminLoginThrottle.count({ where: { key: 'global' } }),
      ).toBe(0);
    });

    it('issues a __Host- cookie (HttpOnly, Secure, SameSite=Strict, Path=/, 8h) and records ADMIN_LOGIN', async () => {
      const res = await post('/api/admin/login')
        .send({ username: USERNAME, password: PASSWORD })
        .expect(200);
      expect(res.body).toEqual({
        authenticated: true,
        expiresAt: expect.stringMatching(/\+09:00$/),
        idleExpiresAt: expect.stringMatching(/\+09:00$/),
      });
      const line = (res.headers['set-cookie'] as unknown as string[]).find(
        (c) => c.startsWith(`${COOKIE}=`),
      );
      expect(line).toMatch(/Max-Age=28800/);
      expect(line).toMatch(/Path=\//);
      expect(line).toMatch(/HttpOnly/);
      expect(line).toMatch(/Secure/);
      expect(line).toMatch(/SameSite=Strict/);
      expect(line).not.toMatch(/Domain=/i);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      const token = adminCookieOf(res).split('=')[1];
      // DB에는 토큰 원문이 없다
      expect(
        await prisma.adminSession.count({ where: { tokenHash: token } }),
      ).toBe(0);
      const row = await prisma.accessLog.findFirst({
        where: { userId: ACTOR_ID, action: 'ADMIN_LOGIN' },
        orderBy: { at: 'desc' },
      });
      expect(row).toMatchObject({ resourceType: 'ADMIN', resourceId: null });
    });
  });

  describe('session separation and expiry', () => {
    it('a user (Kakao) session cannot call admin APIs, and an admin session cannot call user APIs', async () => {
      const user = auth.addUser({ nickname: '일반회원' });
      const userHeaders = auth.headers(user);
      const asUser = await get('/api/admin/users').set(userHeaders).expect(401);
      expect(asUser.body.code).toBe('ADMIN_UNAUTHENTICATED');
      await post('/api/admin/logout').set(userHeaders).expect(401);

      const adminCookie = await login();
      const me = await get('/api/users/me')
        .set('Cookie', adminCookie)
        .expect(401);
      expect(me.body.code).toBe('UNAUTHENTICATED');
      await get('/api/auth/session')
        .set('Cookie', adminCookie)
        .expect(200)
        .expect((res) => expect(res.body.status).toBe('ANONYMOUS'));
      // 두 쿠키를 함께 보내도 관리자 라우트는 관리자 쿠키로만 판단한다
      await get('/api/admin/session')
        .set('Cookie', `${userHeaders.Cookie}; ${adminCookie}`)
        .expect(200);
    });

    it('expires after 30 minutes idle and 8 hours absolute, clears the cookie', async () => {
      const idle = await login();
      await get('/api/admin/session').set('Cookie', idle).expect(200);
      await prisma.adminSession.updateMany({
        where: { revokedAt: null },
        data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
      });
      const expired = await get('/api/admin/session')
        .set('Cookie', idle)
        .expect(401);
      expect(expired.body.code).toBe('ADMIN_UNAUTHENTICATED');
      expect((expired.headers['set-cookie'] as unknown as string[])[0]).toMatch(
        new RegExp(`^${COOKIE}=;`),
      );

      const absolute = await login();
      await prisma.adminSession.updateMany({
        where: {
          revokedAt: null,
          lastSeenAt: { gt: new Date(Date.now() - 60_000) },
        },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await get('/api/admin/session').set('Cookie', absolute).expect(401);
    });

    it('logout revokes the session on the server (the old cookie stops working)', async () => {
      const cookie = await login();
      await post('/api/admin/logout').set('Cookie', cookie).expect(204);
      await get('/api/admin/users').set('Cookie', cookie).expect(401);
      const row = await prisma.accessLog.findFirst({
        where: { userId: ACTOR_ID, action: 'ADMIN_LOGOUT' },
      });
      expect(row).not.toBeNull();
    });

    it('logout without Origin is rejected (CSRF)', async () => {
      const cookie = await login();
      await request(server())
        .post('/api/admin/logout')
        .set('X-Forwarded-For', nextIp())
        .set('Cookie', cookie)
        .expect(403);
      await get('/api/admin/session').set('Cookie', cookie).expect(200);
    });

    it('rotating the admin credentials invalidates existing sessions', async () => {
      const cookie = await login();
      const rotated = new AdminConfig({
        username: USERNAME,
        passwordHash: await hashPassword('another-password-123', {
          N: 16_384,
          r: 8,
          p: 1,
        }),
      });
      const original = adminConfig.credentialTag;
      // 같은 인스턴스(앱이 주입받은 것)의 지문만 바꿔 env 교체를 흉내 낸다
      Object.assign(adminConfig, { credentialTag: rotated.credentialTag });
      try {
        await get('/api/admin/session').set('Cookie', cookie).expect(401);
      } finally {
        Object.assign(adminConfig, { credentialTag: original });
      }
    });
  });

  describe('members', () => {
    let cookie: string;
    let alice: string;
    let bob: string;
    let carol: string;

    beforeAll(async () => {
      const tag = randomUUID().slice(0, 4);
      const seed = await fx.seedTrip([`앨리스${tag}`, `밥${tag}`], {
        withPaymentMethod: false,
      });
      alice = seed.members[`앨리스${tag}`].userId;
      bob = seed.members[`밥${tag}`].userId;
      await fx.addExpense(seed, `앨리스${tag}`, {
        status: 'SHARED',
        at: '2026-11-13 12:00',
        merchant: MERCHANT,
        amount: AMOUNT,
        krw: 912_345,
        participants: [`앨리스${tag}`, `밥${tag}`],
        transactionId: null,
      });
      await prisma.transaction.create({
        data: {
          userId: alice,
          source: 'MANUAL',
          kind: 'APPROVAL',
          occurredAt: new Date(),
          merchantNameRaw: MERCHANT,
          merchantKey: 'E2ESECRETMERCHANT4411',
          originalAmount: AMOUNT,
          originalCurrency: 'KRW',
        },
      });
      await prisma.user.update({
        where: { id: alice },
        data: {
          kakaoId: '9876543210',
          lastLoginAt: new Date(Date.now() - 5 * DAY_MS),
        },
      });
      await prisma.userConsent.create({
        data: {
          userId: alice,
          userRefHash: 'a'.repeat(64),
          consentId: 'TOS',
          version: '0.1-draft',
          agreed: true,
          ua: 'e2e',
          screen: 'WF-04',
          method: 'ALL',
          docHash: 'b'.repeat(64),
        },
      });
      const c = await prisma.user.create({
        data: { kakaoId: `test-${randomUUID()}`, nickname: `캐럴${tag}` },
      });
      carol = c.id;
      fx.userIds.push(carol);
      await prisma.accountDeletion.create({
        data: {
          userId: carol,
          userRefHash: 'c'.repeat(64),
          channel: 'SUPPORT',
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      });
      cookie = await login();
    });

    it('lists with search (nickname partial / exact ID), sort, cursor pagination and records ADMIN_VIEW_USERS without the query text', async () => {
      const byNick = await get(
        `/api/admin/users?q=${encodeURIComponent('앨리스')}`,
      )
        .set('Cookie', cookie)
        .expect(200);
      const list = byNick.body as AdminUserListResponse;
      const item = list.items.find((u) => u.id === alice);
      expect(item).toMatchObject({
        tripCount: 1,
        walletEntryCount: 1,
        status: 'ACTIVE',
        cardImport: { allowlisted: false, enabled: false },
        createdAt: expect.stringMatching(/\+09:00$/),
      });
      expect(byNick.headers['cache-control']).toBe('no-store');

      const byId = await get(`/api/admin/users?q=${carol.toUpperCase()}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(
        (byId.body as AdminUserListResponse).items.map((u) => u.id),
      ).toEqual([carol]);
      expect((byId.body as AdminUserListResponse).items[0].status).toBe(
        'DELETION_REQUESTED',
      );

      const first = (
        await get('/api/admin/users?limit=1&sort=lastLoginAt')
          .set('Cookie', cookie)
          .expect(200)
      ).body as AdminUserListResponse;
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = (
        await get(
          `/api/admin/users?limit=1&sort=lastLoginAt&cursor=${first.nextCursor}`,
        )
          .set('Cookie', cookie)
          .expect(200)
      ).body as AdminUserListResponse;
      expect(second.items[0].id).not.toBe(first.items[0].id);
      // 다른 정렬의 커서는 받지 않는다
      await get(`/api/admin/users?sort=createdAt&cursor=${first.nextCursor}`)
        .set('Cookie', cookie)
        .expect(400);
      await get('/api/admin/users?limit=500').set('Cookie', cookie).expect(400);

      const logs = await prisma.accessLog.findMany({
        where: { userId: ACTOR_ID, action: 'ADMIN_VIEW_USERS' },
        orderBy: { at: 'asc' },
      });
      expect(logs.map((l) => l.details)).toEqual(
        expect.arrayContaining([
          {
            count: expect.any(Number),
            query: 'NICKNAME',
            sort: 'createdAt',
            page: 'FIRST',
          },
          { count: 1, query: 'USER_ID', sort: 'createdAt', page: 'FIRST' },
          { count: 1, query: 'NONE', sort: 'lastLoginAt', page: 'NEXT' },
        ]),
      );
      expect(JSON.stringify(logs)).not.toContain('앨리스');
    });

    it('shows detail with counts only — no payment contents, amounts or merchants — and records ADMIN_VIEW_USER', async () => {
      const res = await get(`/api/admin/users/${alice}`)
        .set('Cookie', cookie)
        .expect(200);
      const detail = res.body as AdminUserDetail;
      expect(detail).toMatchObject({
        id: alice,
        kakaoIdLast4: '3210',
        deletionRequest: null,
        counts: {
          expenses: 1,
          walletEntries: 1,
          paymentMethods: 0,
          activeSessions: 0,
        },
        consents: [
          {
            consentId: 'TOS',
            version: '0.1-draft',
            agreed: true,
            withdrawnAt: null,
          },
        ],
        trips: [
          {
            name: '오사카 먹방',
            tripStatus: 'ONGOING',
            startDate: '2026-11-12',
            endDate: '2026-11-15',
            role: 'LEADER',
            leftAt: null,
            deleted: false,
          },
        ],
      });
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(MERCHANT);
      expect(body).not.toContain(AMOUNT);
      expect(body).not.toContain('912345');
      expect(body).not.toContain('9876543210');
      expect(body).not.toMatch(/merchant|amount|krw/i);
      const row = await prisma.accessLog.findFirst({
        where: {
          userId: ACTOR_ID,
          action: 'ADMIN_VIEW_USER',
          resourceId: alice,
        },
      });
      expect(row).not.toBeNull();
      await get(`/api/admin/users/${randomUUID()}`)
        .set('Cookie', cookie)
        .expect(404);
      await get('/api/admin/users/not-a-uuid')
        .set('Cookie', cookie)
        .expect(404);
    });

    it('withdraws via the existing deletion pipeline: nickname must match, reason required, CSRF, access log', async () => {
      const nickname = (
        await prisma.user.findUniqueOrThrow({ where: { id: bob } })
      ).nickname;
      await post(`/api/admin/users/${bob}/withdraw`)
        .set('Cookie', cookie)
        .send({ reason: REASON, confirmNickname: `${nickname}x` })
        .expect(400)
        .expect((res) => expect(res.body.code).toBe('ADMIN_CONFIRM_MISMATCH'));
      await post(`/api/admin/users/${bob}/withdraw`)
        .set('Cookie', cookie)
        .send({ reason: ' ', confirmNickname: nickname })
        .expect(400)
        .expect((res) => expect(res.body.code).toBe('VALIDATION_FAILED'));
      await request(server())
        .post(`/api/admin/users/${bob}/withdraw`)
        .set('X-Forwarded-For', nextIp())
        .set('Cookie', cookie)
        .send({ reason: REASON, confirmNickname: nickname })
        .expect(403);
      expect(await prisma.user.count({ where: { id: bob } })).toBe(1);

      const ok = await post(`/api/admin/users/${bob}/withdraw`)
        .set('Cookie', cookie)
        .send({ reason: REASON, confirmNickname: nickname })
        .expect(200);
      const result = ok.body as AdminWithdrawUserResponse;
      expect(result).toMatchObject({
        status: 'DELETED',
        accountDeletionId: expect.any(String),
      });
      expect(await prisma.user.count({ where: { id: bob } })).toBe(0);
      const deletion = await prisma.accountDeletion.findUniqueOrThrow({
        where: { id: result.accountDeletionId },
      });
      expect(deletion).toMatchObject({
        channel: 'SUPPORT',
        completedAt: expect.any(Date),
      });
      // 멤버십은 "탈퇴한 멤버"로 남는다(기존 파이프라인)
      expect(
        await prisma.membership.count({
          where: { userId: null, leaveReason: 'ACCOUNT_DELETED' },
        }),
      ).toBeGreaterThan(0);
      const log = await prisma.accessLog.findFirst({
        where: {
          userId: ACTOR_ID,
          action: 'ADMIN_WITHDRAW_USER',
          resourceId: bob,
        },
      });
      expect(log?.details).toEqual({
        reason: REASON,
        result: 'DELETED',
        accountDeletionId: result.accountDeletionId,
      });

      await post(`/api/admin/users/${bob}/withdraw`)
        .set('Cookie', cookie)
        .send({ reason: REASON, confirmNickname: nickname })
        .expect(404);
    });

    it('fails closed when the access log cannot be written (no data without a record)', async () => {
      const failing = await createTestApp([], {
        auth,
        prisma: 'real',
        logger: createLogger(new ConfigService(), { write: () => undefined }),
        overrides: [
          [AdminConfig, adminConfig],
          [
            AdminAuditLog,
            {
              ipHash: () => null,
              record: () => Promise.reject(new Error('db down')),
              recordQuietly: () => Promise.resolve(),
              finish: () => Promise.resolve(),
            },
          ],
        ],
      });
      try {
        const res = await request(failing.getHttpServer())
          .get(`/api/admin/users/${alice}`)
          .set('Cookie', cookie)
          .expect(500);
        expect(JSON.stringify(res.body)).not.toContain(alice);
      } finally {
        await failing.close();
      }
    });
  });

  describe('CODEF usage', () => {
    it('aggregates existing S8 counters read-only and records ADMIN_VIEW_CODEF_USAGE', async () => {
      const cookie = await login();
      const tag = randomUUID().slice(0, 4);
      const heavy = await prisma.user.create({
        data: { kakaoId: `test-${randomUUID()}`, nickname: `헤비${tag}` },
      });
      fx.userIds.push(heavy.id);
      const gone = randomUUID();
      const today = new Date(`${kstDayString()}T00:00:00Z`);
      await prisma.codefDailyUsage.deleteMany();
      await prisma.codefDailyUsage.createMany({
        data: [
          { day: today, calls: 12 },
          { day: new Date(`${kstDayString(-3)}T00:00:00Z`), calls: 7 },
        ],
      });
      const fetchLog = (
        userId: string,
        step: string,
        result: string,
        organization = '0306',
        at = new Date(),
      ) => ({
        userId,
        action: 'FETCH_CARD_APPROVALS',
        resourceType: 'USER',
        resourceId: userId,
        details: { organization, count: 0, result, step },
        at,
      });
      await prisma.accessLog.deleteMany({
        where: { action: 'FETCH_CARD_APPROVALS' },
      });
      await prisma.accessLog.createMany({
        data: [
          fetchLog(heavy.id, 'START', 'OK'),
          fetchLog(heavy.id, 'START', 'TWO_WAY_REQUIRED', '0301'),
          fetchLog(heavy.id, 'TWO_WAY', 'OK', '0301'),
          fetchLog(heavy.id, 'START', 'CARD_LOGIN_FAILED'),
          fetchLog(gone, 'START', 'CARD_COMPANY_UNAVAILABLE'),
          fetchLog(
            gone,
            'START',
            'OK',
            '0306',
            new Date(Date.now() - 3 * DAY_MS),
          ),
          fetchLog(
            gone,
            'START',
            'OK',
            '0306',
            new Date(Date.now() - 20 * DAY_MS),
          ),
        ],
      });
      await prisma.cardImportLoginFailure.create({
        data: {
          userId: heavy.id,
          organization: '0306',
          failures: 3,
          lastFailedAt: new Date(),
        },
      });
      await prisma.cardImportTwoWaySession.create({
        data: {
          nonceHash: 'd'.repeat(64),
          userId: heavy.id,
          callsLeft: 2,
          budgetDay: today,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await prisma.codefPendingDeletion.deleteMany();
      await prisma.codefPendingDeletion.create({
        data: {
          id: randomUUID(),
          connectedIdEnc: new Uint8Array([1]),
          organization: '0306',
        },
      });

      const res = await get('/api/admin/codef-usage')
        .set('Cookie', cookie)
        .expect(200);
      const usage = res.body as AdminCodefUsage;
      expect(usage.today).toMatchObject({
        day: kstDayString(),
        calls: 12,
        budget: 40,
        reserved: 2,
        inProgress: 0,
        remaining: 28,
        fetchStarts: 4,
        successes: 2,
        failures: 2,
      });
      expect(usage.today.byResult).toEqual(
        expect.arrayContaining([
          { step: 'START', result: 'OK', count: 1 },
          { step: 'TWO_WAY', result: 'OK', count: 1 },
          { step: 'START', result: 'CARD_LOGIN_FAILED', count: 1 },
        ]),
      );
      expect(usage.today.byOrganization).toEqual([
        { organization: '0306', count: 3 },
        { organization: '0301', count: 1 },
      ]);
      expect(usage.days).toHaveLength(14);
      expect(usage.days.at(-1)).toMatchObject({
        day: kstDayString(),
        codefCalls: 12,
        fetchStarts: 4,
      });
      expect(usage.days.find((d) => d.day === kstDayString(-3))).toMatchObject({
        codefCalls: 7,
        fetchStarts: 1,
      });
      expect(
        usage.days.find((d) => d.day === kstDayString(-10))?.codefCalls,
      ).toBeNull();
      expect(usage.topUsers).toEqual([
        { userId: heavy.id, nickname: `헤비${tag}`, count: 3, limit: 10 },
        { userId: gone, nickname: null, count: 1, limit: 10 },
      ]);
      expect(usage.loginCooldownUsers).toBe(1);
      expect(usage.pendingDeletions).toEqual({
        count: 1,
        oldestCreatedAt: expect.stringMatching(/\+09:00$/),
      });
      expect(usage.flags).toEqual({
        featureCardImport: 'allowlist',
        effectiveMode: 'off',
        codefEnv: 'sandbox',
        codefLoginMode: 'direct',
        allowlistCount: 0,
      });
      expect(
        await prisma.accessLog.count({
          where: { userId: ACTOR_ID, action: 'ADMIN_VIEW_CODEF_USAGE' },
        }),
      ).toBe(1);
      // 읽기 전용: 값이 바뀌지 않았다
      expect(
        (
          await prisma.codefDailyUsage.findUniqueOrThrow({
            where: { day: today },
          })
        ).calls,
      ).toBe(12);

      await prisma.codefPendingDeletion.deleteMany();
      await prisma.cardImportTwoWaySession.deleteMany({
        where: { userId: heavy.id },
      });
      await prisma.cardImportLoginFailure.deleteMany({
        where: { userId: heavy.id },
      });
      await prisma.accessLog.deleteMany({
        where: { action: 'FETCH_CARD_APPROVALS' },
      });
      await prisma.codefDailyUsage.deleteMany();
    });
  });

  describe('retention', () => {
    it('purge deletes finished admin sessions and stale throttle rows, keeps live sessions', async () => {
      const live = await login();
      const ended = await login();
      await post('/api/admin/logout').set('Cookie', ended).expect(204);
      await prisma.adminLoginThrottle.create({
        data: {
          key: 'ip:stale',
          attempts: 3,
          windowStartedAt: new Date(Date.now() - 2 * DAY_MS),
        },
      });
      await prisma.adminLoginThrottle.create({
        data: { key: 'ip:fresh', attempts: 1, windowStartedAt: new Date() },
      });
      const result = await app.get(PurgeService).run();
      const step = result.steps.find((s) => s.step === 'ADMIN_SESSIONS');
      expect(step?.count).toBeGreaterThanOrEqual(2);
      expect(
        await prisma.adminSession.count({
          where: { revokedAt: { not: null } },
        }),
      ).toBe(0);
      expect(
        await prisma.adminLoginThrottle.findMany({ select: { key: true } }),
      ).toEqual([{ key: 'ip:fresh' }]);
      await get('/api/admin/session').set('Cookie', live).expect(200);
    });
  });

  describe('logs', () => {
    it('never contain the admin username, password, session token or withdrawal reason', async () => {
      const cookie = await login();
      const token = cookie.split('=')[1];
      expect(raw).toContain('관리자 접근 기록');
      expect(raw).not.toContain(USERNAME);
      expect(raw).not.toContain(PASSWORD);
      expect(raw).not.toContain(WRONG_PASSWORD);
      expect(raw).not.toContain(token);
      expect(raw).not.toContain('e2e-reason-55aa');
      expect(raw).not.toContain(MERCHANT);
    });
  });
});
