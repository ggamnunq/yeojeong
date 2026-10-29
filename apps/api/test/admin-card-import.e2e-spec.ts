import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminCardImportGrant,
  AdminCardImportGrantList,
  AdminUserDetail,
  AdminUserListResponse,
} from '@yeojeong/shared';
import request from 'supertest';
import { AccountDeletionService } from './../src/account/account-deletion.service.js';
import { AdminConfig, actorIdOf } from './../src/admin/admin-config.js';
import { hashPassword } from './../src/admin/password-hash.js';
import {
  base32Decode,
  generateTotpSecret,
  hotp,
  totpCounter,
} from './../src/admin/totp.js';
import type { PrismaClient } from './../src/generated/prisma/client.js';
import type { AuthUser } from './../src/common/auth/auth-context.js';
import { createTestAuth, TEST_ORIGIN } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import {
  createFixturePrisma,
  reachableDatabaseUrl,
} from './expenses-fixtures.js';

// 관리자 카드 불러오기 권한(ADMIN2) e2e. 실제 DB(권한 행·관리자 세션·접근 기록) + 실제 기능 플래그(allowlist + CODEF 키) + 사용자 세션 스텁.
// 증명: 부여 즉시 features.cardImport·카드 불러오기 API 허용 · 회수 즉시 404 · env 항목 회수 불가 · 409·404 ·
//       탈퇴하면 권한 행 삭제 · 접근 기록(client_ip 포함) · 일반 세션으로 관리자 API 불가 · CSRF · no-store
const databaseUrl = await reachableDatabaseUrl();

const USERNAME = 'ops-admin-grants-e2e';
const PASSWORD = 'e2e-Admin-Grants-Pw-4b7e1-staple';
const COOKIE = '__Host-yj_admin';
const TOTP_SECRET = generateTotpSecret();
const TOTP_KEY = base32Decode(TOTP_SECRET)!;
const ACTOR_ID = actorIdOf(USERNAME);
const ENV_USER_ID = randomUUID();
const PUBLIC_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'spki', format: 'der' })
  .toString('base64');

let ipSeq = 10;
/** 요청마다 다른 클라이언트 IP(TRUST_PROXY_HOPS=1) — rate limit이 섞이지 않게 */
const nextIp = () => `203.0.113.${ipSeq++}`;

describe.skipIf(!databaseUrl)('Admin card-import grants (e2e, real DB)', () => {
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let auth: ReturnType<typeof createTestAuth>;
  let adminCookie = '';
  const userIds: string[] = [];

  const server = () => app.getHttpServer();
  const adminGet = (path: string) =>
    request(server())
      .get(path)
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', adminCookie);
  const adminPost = (path: string) =>
    request(server())
      .post(path)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', adminCookie);
  const adminDelete = (path: string) =>
    request(server())
      .delete(path)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', adminCookie);

  async function createUser(nickname: string, id?: string): Promise<AuthUser> {
    const user = await prisma.user.create({
      data: {
        ...(id && { id }),
        kakaoId: `test-${randomUUID()}`,
        nickname,
      },
    });
    userIds.push(user.id);
    return { id: user.id, nickname, profileImageUrl: null };
  }

  /** 사용자 세션으로: 세션 응답의 features.cardImport · 카드 불러오기 설정 API 상태 */
  async function userView(user: AuthUser) {
    const session = await request(server())
      .get('/api/auth/session')
      .set('X-Forwarded-For', nextIp())
      .set(auth.headers(user))
      .expect(200);
    const config = await request(server())
      .get('/api/card-import/config')
      .set('X-Forwarded-For', nextIp())
      .set(auth.headers(user));
    return {
      cardImport: (session.body as { features: { cardImport: boolean } })
        .features.cardImport,
      configStatus: config.status,
    };
  }

  const lastLog = (action: string) =>
    prisma.accessLog.findFirst({
      where: { userId: ACTOR_ID, action },
      orderBy: { at: 'desc' },
    });

  beforeAll(async () => {
    prisma = createFixturePrisma(databaseUrl as string);
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    vi.stubEnv('FEATURE_CARD_IMPORT', 'allowlist');
    vi.stubEnv('CARD_IMPORT_ALLOWED_USER_IDS', ENV_USER_ID);
    vi.stubEnv('CODEF_ENV', 'sandbox');
    vi.stubEnv('CODEF_CLIENT_ID', 'e2e-client-id');
    vi.stubEnv('CODEF_CLIENT_SECRET', 'e2e-client-secret');
    vi.stubEnv('CODEF_PUBLIC_KEY', PUBLIC_KEY);
    auth = createTestAuth();
    const adminConfig = new AdminConfig({
      username: USERNAME,
      passwordHash: await hashPassword(PASSWORD, { N: 16_384, r: 8, p: 1 }),
      totpSecret: TOTP_SECRET,
    });
    app = await createTestApp([], {
      auth,
      prisma: 'real',
      overrides: [[AdminConfig, adminConfig]],
    });
    await prisma.adminTotpCounter.deleteMany({ where: { actorId: ACTOR_ID } });
    const login = await request(server())
      .post('/api/admin/login')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({
        username: USERNAME,
        password: PASSWORD,
        totp: hotp(TOTP_KEY, totpCounter(Date.now())),
      })
      .expect(200);
    const raw = login.headers['set-cookie'] as unknown as string[];
    adminCookie = raw.find((c) => c.startsWith(`${COOKIE}=`))!.split(';')[0];
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    await prisma.cardImportGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.accessLog.deleteMany({ where: { userId: ACTOR_ID } });
    await prisma.adminSession.deleteMany();
    await prisma.adminLoginThrottle.deleteMany();
    await prisma.adminTotpCounter.deleteMany({ where: { actorId: ACTOR_ID } });
    await prisma.$disconnect();
  });

  it('grant turns card import on immediately (session features + API), revoke turns it off immediately (404)', async () => {
    const user = await createUser('권한테스트');
    expect(await userView(user)).toEqual({
      cardImport: false,
      configStatus: 404,
    });

    const created = await adminPost('/api/admin/card-import-grants')
      .send({ userId: user.id, note: '  운영자 실테스트  ' })
      .expect(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body as AdminCardImportGrant).toEqual({
      userId: user.id,
      nickname: '권한테스트',
      sources: ['ADMIN'],
      grantedAt: expect.stringMatching(/\+09:00$/),
      grantedBy: ACTOR_ID,
      note: '운영자 실테스트',
      revocable: true,
      cardImportConsent: true,
      todayFetchCount: 0,
    });
    const row = await prisma.cardImportGrant.findUnique({
      where: { userId: user.id },
    });
    expect(row).toMatchObject({ grantedBy: ACTOR_ID, note: '운영자 실테스트' });
    expect(await userView(user)).toEqual({
      cardImport: true,
      configStatus: 200,
    });
    // 동의 상태(CARD_IMPORT)도 함께 보인다
    auth.consents.missing.set(user.id, new Set(['CARD_IMPORT']));
    const listed = (await adminGet('/api/admin/card-import-grants').expect(200))
      .body as AdminCardImportGrantList;
    expect(listed.items.find((i) => i.userId === user.id)).toMatchObject({
      cardImportConsent: false,
    });
    auth.consents.missing.delete(user.id);

    // 회원 목록·상세에도 반영(granted · enabled)
    const detail = (await adminGet(`/api/admin/users/${user.id}`).expect(200))
      .body as AdminUserDetail;
    expect(detail.cardImport).toEqual({
      allowlisted: false,
      granted: true,
      enabled: true,
    });
    const users = (await adminGet(`/api/admin/users?q=${user.id}`).expect(200))
      .body as AdminUserListResponse;
    expect(users.items[0].cardImport).toEqual({
      allowlisted: false,
      granted: true,
      enabled: true,
    });

    // 이미 있으면 409
    const dup = await adminPost('/api/admin/card-import-grants')
      .send({ userId: user.id })
      .expect(409);
    expect(dup.body.code).toBe('ADMIN_CARD_IMPORT_GRANT_EXISTS');

    await adminDelete(`/api/admin/card-import-grants/${user.id}`).expect(204);
    expect(
      await prisma.cardImportGrant.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(await userView(user)).toEqual({
      cardImport: false,
      configStatus: 404,
    });
    // 다시 회수하면 404
    await adminDelete(`/api/admin/card-import-grants/${user.id}`).expect(404);
  });

  it('lists env allowlist entries as ENV (not revocable) and refuses to revoke them (409)', async () => {
    const envUser = await createUser('환경목록', ENV_USER_ID);
    expect(await userView(envUser)).toEqual({
      cardImport: true,
      configStatus: 200,
    });
    const list = await adminGet('/api/admin/card-import-grants').expect(200);
    expect(list.headers['cache-control']).toBe('no-store');
    const body = list.body as AdminCardImportGrantList;
    expect(body.flags).toEqual({
      featureCardImport: 'allowlist',
      effectiveMode: 'allowlist',
    });
    expect(body.dailyLimit).toBeGreaterThan(0);
    expect(body.items.find((i) => i.userId === ENV_USER_ID)).toEqual({
      userId: ENV_USER_ID,
      nickname: '환경목록',
      sources: ['ENV'],
      grantedAt: null,
      grantedBy: null,
      note: null,
      revocable: false,
      cardImportConsent: true,
      todayFetchCount: 0,
    });

    const refused = await adminDelete(
      `/api/admin/card-import-grants/${ENV_USER_ID}`,
    ).expect(409);
    expect(refused.body.code).toBe('ADMIN_CARD_IMPORT_GRANT_ENV_ONLY');
    expect((await lastLog('ADMIN_REVOKE_CARD_IMPORT'))?.details).toEqual({
      result: 'ADMIN_CARD_IMPORT_GRANT_ENV_ONLY',
    });
    expect(await userView(envUser)).toEqual({
      cardImport: true,
      configStatus: 200,
    });

    // env에도 있는 회원에게 관리자 권한을 더하면 한 줄에 ADMIN·ENV, 회수하면 관리자 권한만 지워진다
    await adminPost('/api/admin/card-import-grants')
      .send({ userId: ENV_USER_ID })
      .expect(201);
    const both = (await adminGet('/api/admin/card-import-grants').expect(200))
      .body as AdminCardImportGrantList;
    expect(
      both.items.filter((i) => i.userId === ENV_USER_ID).map((i) => i.sources),
    ).toEqual([['ADMIN', 'ENV']]);
    await adminDelete(`/api/admin/card-import-grants/${ENV_USER_ID}`).expect(
      204,
    );
    expect(await userView(envUser)).toEqual({
      cardImport: true,
      configStatus: 200,
    });
  });

  it('404 for a withdrawn (missing) user, 400 for a non-UUID, and deletes the grant when the user withdraws', async () => {
    const missing = randomUUID();
    await adminPost('/api/admin/card-import-grants')
      .send({ userId: missing })
      .expect(404);
    expect((await lastLog('ADMIN_GRANT_CARD_IMPORT'))?.details).toEqual({
      result: 'NOT_FOUND',
    });
    const bad = await adminPost('/api/admin/card-import-grants')
      .send({ userId: 'not-a-uuid', note: 'x'.repeat(101) })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    await adminDelete('/api/admin/card-import-grants/not-a-uuid').expect(404);

    const leaver = await createUser('탈퇴예정');
    await adminPost('/api/admin/card-import-grants')
      .send({ userId: leaver.id })
      .expect(201);
    const result = await app
      .get(AccountDeletionService)
      .deleteAccount(leaver.id, { channel: 'IN_APP' });
    expect(result).toMatchObject({
      status: 'DELETED',
      counts: { cardImportGrants: 1 },
    });
    expect(
      await prisma.cardImportGrant.count({ where: { userId: leaver.id } }),
    ).toBe(0);
    const list = (await adminGet('/api/admin/card-import-grants').expect(200))
      .body as AdminCardImportGrantList;
    expect(list.items.some((i) => i.userId === leaver.id)).toBe(false);
    // 탈퇴한 회원에게는 다시 줄 수 없다
    await adminPost('/api/admin/card-import-grants')
      .send({ userId: leaver.id })
      .expect(404);
  });

  it('records every view/grant/revoke in access_logs with the target user and client IP', async () => {
    const user = await createUser('기록확인');
    await adminPost('/api/admin/card-import-grants')
      .send({ userId: user.id, note: '기록 확인' })
      .expect(201);
    const granted = await lastLog('ADMIN_GRANT_CARD_IMPORT');
    expect(granted).toMatchObject({
      resourceType: 'USER',
      resourceId: user.id,
      details: { result: 'GRANTED', note: '기록 확인' },
    });
    expect(isIP(granted?.clientIp ?? '')).not.toBe(0);
    expect(granted?.ipHash).toMatch(/^[0-9a-f]{64}$/);

    await adminGet('/api/admin/card-import-grants').expect(200);
    const viewed = await lastLog('ADMIN_VIEW_CARD_IMPORT_GRANTS');
    expect(viewed).toMatchObject({
      resourceType: 'CARD_IMPORT_GRANT',
      resourceId: null,
    });
    const details = viewed?.details as { count: number; userIds: string[] };
    expect(details.userIds).toContain(user.id);
    expect(details.count).toBe(details.userIds.length);
    expect(isIP(viewed?.clientIp ?? '')).not.toBe(0);

    await adminDelete(`/api/admin/card-import-grants/${user.id}`).expect(204);
    const revoked = await lastLog('ADMIN_REVOKE_CARD_IMPORT');
    expect(revoked).toMatchObject({
      resourceType: 'USER',
      resourceId: user.id,
      details: { result: 'REVOKED', grantedAt: expect.any(String) },
    });
    expect(isIP(revoked?.clientIp ?? '')).not.toBe(0);
  });

  it('is admin-only: a user session gets 401 ADMIN_UNAUTHENTICATED, and writes need the Origin (CSRF)', async () => {
    const user = await createUser('일반회원');
    for (const send of [
      () => request(server()).get('/api/admin/card-import-grants'),
      () =>
        request(server())
          .post('/api/admin/card-import-grants')
          .send({ userId: user.id }),
      () =>
        request(server()).delete(`/api/admin/card-import-grants/${user.id}`),
    ]) {
      const res = await send()
        .set('X-Forwarded-For', nextIp())
        .set(auth.headers(user))
        .expect(401);
      expect(res.body.code).toBe('ADMIN_UNAUTHENTICATED');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    // 관리자 쿠키가 있어도 Origin이 없으면 403
    await request(server())
      .post('/api/admin/card-import-grants')
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', adminCookie)
      .send({ userId: user.id })
      .expect(403);
    await request(server())
      .delete(`/api/admin/card-import-grants/${user.id}`)
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', adminCookie)
      .expect(403);
    expect(
      await prisma.cardImportGrant.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(await userView(user)).toEqual({
      cardImport: false,
      configStatus: 404,
    });
  });
});
