import { isIP } from 'node:net';
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
import {
  base32Decode,
  generateTotpSecret,
  hotp,
  totpCounter,
} from './../src/admin/totp.js';
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
const DEVICE_COOKIE = '__Host-yj_admin_dev';
const TOTP_SECRET = generateTotpSecret();
const TOTP_KEY = base32Decode(TOTP_SECRET)!;
/** 지금 창의 TOTP 코드(offset = 창 이동) */
const totpNow = (offset = 0) =>
  hotp(TOTP_KEY, totpCounter(Date.now()) + offset);
/** 지금 창과 다른, 확실히 틀린 6자리 */
const wrongTotp = () => (totpNow() === '000000' ? '111111' : '000000');
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

function cookieOf(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} 쿠키가 없다`);
  return line.split(';')[0];
}
const adminCookieOf = (res: request.Response) => cookieOf(res, COOKIE);

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

  /**
   * 재사용 금지 카운터를 비우고 지금 TOTP 코드를 준다. 실제 시계로 30초 창마다 한 번만 쓸 수 있어,
   * 여러 번 로그인하는 테스트는 이걸로 카운터를 되돌린다(재사용 금지 자체는 따로 증명한다)
   */
  async function freshTotp() {
    await prisma.adminTotpCounter.deleteMany();
    return totpNow();
  }

  async function loginFull(ip = nextIp(), extraCookie?: string) {
    const req = post('/api/admin/login', ip);
    if (extraCookie) req.set('Cookie', extraCookie);
    const res = await req
      .send({ username: USERNAME, password: PASSWORD, totp: await freshTotp() })
      .expect(200);
    return {
      session: adminCookieOf(res),
      device: cookieOf(res, DEVICE_COOKIE),
    };
  }

  async function login(ip = nextIp()) {
    return (await loginFull(ip)).session;
  }

  const lastLoginFailure = () =>
    prisma.accessLog.findFirst({
      where: { userId: ACTOR_ID, action: 'ADMIN_LOGIN_FAILED' },
      orderBy: { at: 'desc' },
    });

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
      totpSecret: TOTP_SECRET,
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
    await prisma.adminTotpCounter.deleteMany();
    await fx.cleanup();
    await prisma.$disconnect();
  });

  describe('login', () => {
    it('rejects wrong password and wrong username with the same generic message, and records the failure', async () => {
      const before = await prisma.accessLog.count({
        where: { userId: ACTOR_ID, action: 'ADMIN_LOGIN_FAILED' },
      });
      const badPw = await post('/api/admin/login')
        .send({ username: USERNAME, password: WRONG_PASSWORD, totp: totpNow() })
        .expect(401);
      const badUser = await post('/api/admin/login')
        .send({ username: 'someone-else', password: PASSWORD, totp: totpNow() })
        .expect(401);
      const badTotp = await post('/api/admin/login')
        .send({ username: USERNAME, password: PASSWORD, totp: wrongTotp() })
        .expect(401);
      expect((await lastLoginFailure())?.details).toEqual({
        reason: 'BAD_TOTP',
      });
      for (const res of [badPw, badUser, badTotp]) {
        expect(res.body).toMatchObject({
          code: 'ADMIN_LOGIN_FAILED',
          message: '아이디, 비밀번호 또는 인증 코드가 맞지 않아요',
        });
        expect(res.body.details).toBeUndefined();
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.headers['cache-control']).toBe('no-store');
      }
      const rows = await prisma.accessLog.findMany({
        where: { userId: ACTOR_ID, action: 'ADMIN_LOGIN_FAILED' },
        orderBy: { at: 'desc' },
        take: 3,
      });
      expect(rows.length + before).toBeGreaterThanOrEqual(3);
      expect(rows[1]).toMatchObject({
        resourceType: 'ADMIN',
        details: { reason: 'BAD_CREDENTIALS' },
      });
      expect(rows[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
      // 접속지 정보: 관리자 기록은 원 IP도 남긴다(로그인 실패 포함 — 공격 추적)
      expect(isIP(rows[0].clientIp ?? '')).not.toBe(0);
    });

    it('requires a TOTP code (2FA) and never accepts the same code twice (replay)', async () => {
      await post('/api/admin/login')
        .send({ username: USERNAME, password: PASSWORD })
        .expect(400);
      const code = await freshTotp();
      await post('/api/admin/login')
        .send({ username: USERNAME, password: PASSWORD, totp: code })
        .expect(200);
      const replay = await post('/api/admin/login')
        .send({ username: USERNAME, password: PASSWORD, totp: code })
        .expect(401);
      expect(replay.body.code).toBe('ADMIN_LOGIN_FAILED');
      expect((await lastLoginFailure())?.details).toEqual({
        reason: 'TOTP_REPLAY',
      });
      // 이미 쓴 창보다 이른 창(앞 1창)도 받지 않는다
      await post('/api/admin/login')
        .send({ username: USERNAME, password: PASSWORD, totp: totpNow(-1) })
        .expect(401);
      // 동시에 같은 코드로 두 번 보내도 한 번만 성공한다
      const next = await freshTotp();
      const results = await Promise.all(
        [nextIp(), nextIp()].map((ip) =>
          post('/api/admin/login', ip).send({
            username: USERNAME,
            password: PASSWORD,
            totp: next,
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('a new login ends every existing admin session (other browsers too)', async () => {
      const first = await login();
      await get('/api/admin/session').set('Cookie', first).expect(200);
      const second = await login();
      await get('/api/admin/session').set('Cookie', first).expect(401);
      await get('/api/admin/session').set('Cookie', second).expect(200);
    });

    it('validates input without echoing values', async () => {
      const res = await post('/api/admin/login')
        .send({ username: USERNAME, totp: '12' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body)).not.toContain(USERNAME);
    });

    it('requires an allowed Origin (CSRF) — even before checking credentials', async () => {
      await request(server())
        .post('/api/admin/login')
        .set('X-Forwarded-For', nextIp())
        .send({ username: USERNAME, password: PASSWORD, totp: totpNow() })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('CSRF_REJECTED'));
      await request(server())
        .post('/api/admin/login')
        .set('Origin', 'https://evil.example')
        .set('X-Forwarded-For', nextIp())
        .send({ username: USERNAME, password: PASSWORD, totp: totpNow() })
        .expect(403);
    });

    it('limits attempts per IP (5 per 15 min → 429 with Retry-After, even with the right password)', async () => {
      const ip = nextIp();
      for (let i = 0; i < 5; i += 1) {
        await post('/api/admin/login', ip)
          .send({
            username: USERNAME,
            password: WRONG_PASSWORD,
            totp: wrongTotp(),
          })
          .expect(401);
      }
      const blocked = await post('/api/admin/login', ip)
        .send({
          username: USERNAME,
          password: PASSWORD,
          totp: await freshTotp(),
        })
        .expect(429);
      expect(blocked.body.code).toBe('ADMIN_LOGIN_RATE_LIMITED');
      expect(blocked.body.details.retryAfterSec).toBeGreaterThan(0);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.headers['set-cookie']).toBeUndefined();
      const limited = await prisma.accessLog.findFirst({
        where: { userId: ACTOR_ID, action: 'ADMIN_LOGIN_FAILED' },
        orderBy: { at: 'desc' },
      });
      expect(limited?.details).toEqual({ reason: 'RATE_LIMITED', scope: 'IP' });
      // 시도 제한에 걸린 기록도 요청한 원 IP를 남긴다
      expect(limited?.clientIp).toBe(ip);
      // 계속 막혀도 접근 기록은 키·창마다 한 번만 쓰고 나머지는 카운터로만 센다
      const rateLimitedRows = () =>
        prisma.accessLog.count({
          where: {
            userId: ACTOR_ID,
            action: 'ADMIN_LOGIN_FAILED',
            details: { path: ['reason'], equals: 'RATE_LIMITED' },
          },
        });
      const logged = await rateLimitedRows();
      for (let i = 0; i < 3; i += 1) {
        await post('/api/admin/login', ip)
          .send({
            username: USERNAME,
            password: WRONG_PASSWORD,
            totp: wrongTotp(),
          })
          .expect(429);
      }
      expect(await rateLimitedRows()).toBe(logged);
      expect(
        (
          await prisma.adminLoginThrottle.findFirst({
            where: { key: { startsWith: 'ip:' } },
          })
        )?.attempts,
      ).toBe(9);
      // 다른 IP는 영향 없음
      await login();
    });

    it('limits IPv6 clients per /64 prefix (rotating addresses inside one /64 does not help)', async () => {
      for (let i = 0; i < 5; i += 1) {
        await post('/api/admin/login', `2001:db8:77:1::${(i + 1).toString(16)}`)
          .send({
            username: USERNAME,
            password: WRONG_PASSWORD,
            totp: wrongTotp(),
          })
          .expect(401);
      }
      await post('/api/admin/login', '2001:db8:77:1:ffff:ffff:ffff:fff0')
        .send({
          username: USERNAME,
          password: PASSWORD,
          totp: await freshTotp(),
        })
        .expect(429);
      await login('2001:db8:77:2::1');
    });

    it('locks every IP after too many failures overall (distributed guessing), success resets', async () => {
      for (let i = 0; i < 20; i += 1) {
        await post('/api/admin/login')
          .send({
            username: USERNAME,
            password: WRONG_PASSWORD,
            totp: wrongTotp(),
          })
          .expect(401);
      }
      const locked = await post('/api/admin/login')
        .send({
          username: USERNAME,
          password: PASSWORD,
          totp: await freshTotp(),
        })
        .expect(429);
      expect(locked.body.code).toBe('ADMIN_LOGIN_RATE_LIMITED');
      expect((await lastLoginFailure())?.details).toEqual({
        reason: 'RATE_LIMITED',
        scope: 'GLOBAL',
      });
      // 창이 끝나면(DB 카운터 기준) 다시 된다
      await prisma.adminLoginThrottle.updateMany({
        data: { windowStartedAt: new Date(Date.now() - 16 * 60_000) },
      });
      await login();
      expect(
        await prisma.adminLoginThrottle.count({ where: { key: 'global' } }),
      ).toBe(0);
    });

    it('a browser that logged in before (device cookie) is exempt from the global lock, with its own 5-attempt limit', async () => {
      const { device } = await loginFull();
      // 공격자가 장치 쿠키 없이 전체 잠금을 건다
      for (let i = 0; i < 20; i += 1) {
        await post('/api/admin/login')
          .send({
            username: USERNAME,
            password: WRONG_PASSWORD,
            totp: wrongTotp(),
          })
          .expect(401);
      }
      await post('/api/admin/login')
        .send({
          username: USERNAME,
          password: PASSWORD,
          totp: await freshTotp(),
        })
        .expect(429);
      // 운영자 브라우저(장치 쿠키)는 그대로 로그인된다 — 같은 IP를 써도
      await loginFull(nextIp(), device);
      // 위조·변조한 장치 쿠키는 장치로 보지 않는다(전체 잠금이 그대로 걸린다)
      const tampered = `${device.slice(0, -2)}xx`;
      await post('/api/admin/login')
        .set('Cookie', tampered)
        .send({
          username: USERNAME,
          password: PASSWORD,
          totp: await freshTotp(),
        })
        .expect(429);
      // 장치 자체도 15분 5번(맞는 자격 증명이어도 6번째는 429)
      await prisma.adminLoginThrottle.deleteMany();
      for (let i = 0; i < 5; i += 1) {
        await post('/api/admin/login')
          .set('Cookie', device)
          .send({
            username: USERNAME,
            password: WRONG_PASSWORD,
            totp: wrongTotp(),
          })
          .expect(401);
      }
      expect((await lastLoginFailure())?.details).toEqual({
        reason: 'BAD_CREDENTIALS',
        device: 'TRUSTED',
      });
      const deviceBlocked = await post('/api/admin/login')
        .set('Cookie', device)
        .send({
          username: USERNAME,
          password: PASSWORD,
          totp: await freshTotp(),
        })
        .expect(429);
      expect(deviceBlocked.body.code).toBe('ADMIN_LOGIN_RATE_LIMITED');
      expect((await lastLoginFailure())?.details).toEqual({
        reason: 'RATE_LIMITED',
        scope: 'DEVICE',
      });
      // 장치 쿠키 없는 다른 IP는 장치 카운터와 무관
      await login();
    });

    it('device cookies are signed (90 days, __Host-, HttpOnly, Strict) and die when credentials rotate', async () => {
      const res = await post('/api/admin/login')
        .send({
          username: USERNAME,
          password: PASSWORD,
          totp: await freshTotp(),
        })
        .expect(200);
      const line = (res.headers['set-cookie'] as unknown as string[]).find(
        (c) => c.startsWith(`${DEVICE_COOKIE}=`),
      );
      expect(line).toMatch(/Max-Age=7776000/);
      expect(line).toMatch(/HttpOnly/);
      expect(line).toMatch(/Secure/);
      expect(line).toMatch(/SameSite=Strict/);
      expect(line).toMatch(/Path=\//);
      const device = cookieOf(res, DEVICE_COOKIE);
      const original = adminConfig.credentialTag;
      Object.assign(adminConfig, { credentialTag: 'f'.repeat(64) });
      try {
        for (let i = 0; i < 20; i += 1) {
          await post('/api/admin/login')
            .send({
              username: USERNAME,
              password: WRONG_PASSWORD,
              totp: wrongTotp(),
            })
            .expect(401);
        }
        // 지문이 바뀌면 예전 장치 쿠키는 무효라 전체 잠금에 걸린다
        await post('/api/admin/login')
          .set('Cookie', device)
          .send({
            username: USERNAME,
            password: PASSWORD,
            totp: await freshTotp(),
          })
          .expect(429);
      } finally {
        Object.assign(adminConfig, { credentialTag: original });
      }
    });

    it('issues a __Host- cookie (HttpOnly, Secure, SameSite=Strict, Path=/, 8h) and records ADMIN_LOGIN', async () => {
      const res = await post('/api/admin/login')
        .send({
          username: USERNAME,
          password: PASSWORD,
          totp: await freshTotp(),
        })
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
        totpSecret: TOTP_SECRET,
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
            userIds: expect.arrayContaining([alice]),
          },
          {
            count: 1,
            query: 'USER_ID',
            sort: 'createdAt',
            page: 'FIRST',
            userIds: [carol],
          },
          {
            count: 1,
            query: 'NONE',
            sort: 'lastLoginAt',
            page: 'NEXT',
            userIds: [expect.any(String)],
          },
        ]),
      );
      expect(JSON.stringify(logs)).not.toContain('앨리스');
      // 어떤 회원을 봤는지(반환한 ID 목록)
      expect(logs.map((l) => l.details)).toContainEqual(
        expect.objectContaining({ query: 'USER_ID', userIds: [carol] }),
      );
    });

    it('shows detail with counts only — no payment contents, amounts or merchants — and records ADMIN_VIEW_USER', async () => {
      const viewerIp = nextIp();
      const res = await get(`/api/admin/users/${alice}`, viewerIp)
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
      // 열람 기록의 접속지 정보 = 원 IP(+ 해시)
      expect(row).toMatchObject({
        clientIp: viewerIp,
        ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      const missing = randomUUID();
      await get(`/api/admin/users/${missing}`)
        .set('Cookie', cookie)
        .expect(404);
      await get('/api/admin/users/not-a-uuid')
        .set('Cookie', cookie)
        .expect(404);
      // 없는 회원 조회도 기록한다
      expect(
        await prisma.accessLog.findFirst({
          where: {
            userId: ACTOR_ID,
            action: 'ADMIN_VIEW_USER',
            resourceId: missing,
          },
        }),
      ).toMatchObject({ details: { result: 'NOT_FOUND' } });
      expect(
        await prisma.accessLog.count({
          where: {
            userId: ACTOR_ID,
            action: 'ADMIN_VIEW_USER',
            resourceId: null,
            details: { path: ['result'], equals: 'NOT_FOUND' },
          },
        }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('withdraws via the existing deletion pipeline: nickname, reason, step-up (password + fresh TOTP), CSRF, access log for every attempt', async () => {
      const nickname = (
        await prisma.user.findUniqueOrThrow({ where: { id: bob } })
      ).nickname;
      const withdraw = (body: Record<string, unknown>, ip = nextIp()) =>
        post(`/api/admin/users/${bob}/withdraw`, ip)
          .set('Cookie', cookie)
          .send(body);
      const full = async (extra: Record<string, unknown> = {}) => ({
        reason: REASON,
        confirmNickname: nickname,
        password: PASSWORD,
        totp: await freshTotp(),
        ...extra,
      });
      const lastWithdrawResult = async () =>
        (
          (
            await prisma.accessLog.findFirst({
              where: { userId: ACTOR_ID, action: 'ADMIN_WITHDRAW_USER' },
              orderBy: { at: 'desc' },
            })
          )?.details as { result?: string } | undefined
        )?.result;

      await withdraw(await full({ confirmNickname: `${nickname}x` }))
        .expect(400)
        .expect((res) => expect(res.body.code).toBe('ADMIN_CONFIRM_MISMATCH'));
      expect(await lastWithdrawResult()).toBe('ADMIN_CONFIRM_MISMATCH');
      await withdraw(await full({ reason: ' ' }))
        .expect(400)
        .expect((res) => expect(res.body.code).toBe('VALIDATION_FAILED'));
      // 재인증 필드 없으면 400
      await withdraw({ reason: REASON, confirmNickname: nickname }).expect(400);
      // 비밀번호가 틀리거나 인증 코드가 틀리면 403(같은 문구), 기록에는 이유
      const badPw = await withdraw(
        await full({ password: WRONG_PASSWORD }),
      ).expect(403);
      expect(badPw.body).toMatchObject({
        code: 'ADMIN_STEP_UP_FAILED',
        message: '비밀번호 또는 인증 코드가 맞지 않아요',
      });
      expect(await lastWithdrawResult()).toBe(
        'ADMIN_STEP_UP_FAILED:BAD_CREDENTIALS',
      );
      await withdraw(await full({ totp: wrongTotp() })).expect(403);
      expect(await lastWithdrawResult()).toBe('ADMIN_STEP_UP_FAILED:BAD_TOTP');
      await request(server())
        .post(`/api/admin/users/${bob}/withdraw`)
        .set('X-Forwarded-For', nextIp())
        .set('Cookie', cookie)
        .send(await full())
        .expect(403);
      expect(await prisma.user.count({ where: { id: bob } })).toBe(1);

      const ok = await withdraw(await full()).expect(200);
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
          details: { path: ['result'], equals: 'DELETED' },
        },
      });
      expect(log?.details).toEqual({
        reason: REASON,
        result: 'DELETED',
        accountDeletionId: result.accountDeletionId,
      });

      await withdraw(await full()).expect(404);
      expect(await lastWithdrawResult()).toBe('NOT_FOUND');
    });

    it('step-up never accepts a TOTP code that was already used (e.g. at login)', async () => {
      const victim = await prisma.user.create({
        data: { kakaoId: `test-${randomUUID()}`, nickname: '재사용확인' },
      });
      fx.userIds.push(victim.id);
      const code = await freshTotp();
      const session = (
        await post('/api/admin/login')
          .send({ username: USERNAME, password: PASSWORD, totp: code })
          .expect(200)
      ).headers['set-cookie'] as unknown as string[];
      const sessionCookie = session
        .find((c) => c.startsWith(`${COOKIE}=`))!
        .split(';')[0];
      await post(`/api/admin/users/${victim.id}/withdraw`)
        .set('Cookie', sessionCookie)
        .send({
          reason: REASON,
          confirmNickname: '재사용확인',
          password: PASSWORD,
          totp: code,
        })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('ADMIN_STEP_UP_FAILED'));
      const row = await prisma.accessLog.findFirst({
        where: {
          userId: ACTOR_ID,
          action: 'ADMIN_WITHDRAW_USER',
          resourceId: victim.id,
        },
        orderBy: { at: 'desc' },
      });
      expect((row?.details as { result: string }).result).toBe(
        'ADMIN_STEP_UP_FAILED:TOTP_REPLAY',
      );
      expect(await prisma.user.count({ where: { id: victim.id } })).toBe(1);
      // 이 세션은 members 테스트의 cookie를 폐기했으므로 이후 테스트를 위해 다시 쓴다
      cookie = sessionCookie;
    });

    it('limits step-up attempts per admin session (5 per 15 min → 429)', async () => {
      const victim = await prisma.user.create({
        data: { kakaoId: `test-${randomUUID()}`, nickname: '한도확인' },
      });
      fx.userIds.push(victim.id);
      for (let i = 0; i < 5; i += 1) {
        await post(`/api/admin/users/${victim.id}/withdraw`)
          .set('Cookie', cookie)
          .send({
            reason: REASON,
            confirmNickname: '한도확인',
            password: WRONG_PASSWORD,
            totp: totpNow(),
          })
          .expect(403);
      }
      const blocked = await post(`/api/admin/users/${victim.id}/withdraw`)
        .set('Cookie', cookie)
        .send({
          reason: REASON,
          confirmNickname: '한도확인',
          password: PASSWORD,
          totp: await freshTotp(),
        })
        .expect(429);
      expect(blocked.body.code).toBe('ADMIN_STEP_UP_RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(await prisma.user.count({ where: { id: victim.id } })).toBe(1);
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
      const ended = await login();
      await post('/api/admin/logout').set('Cookie', ended).expect(204);
      const live = await login();
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
