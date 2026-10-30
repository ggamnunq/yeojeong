import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminFeatureGrantList,
  AdminFeatureGrantRow,
  AdminUserDetail,
  AdminUserListResponse,
  FeatureKey,
  FileImportProvider,
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

// 관리자 회원별 기능 권한(ADMIN3) e2e. 실제 DB(권한 행·관리자 세션·접근 기록) + 실제 기능 플래그
// (카드 불러오기 allowlist + CODEF 키 · 파일 가져오기 allowlist + WECHAT·ALIPAY) + 사용자 세션 스텁.
// 증명: 부여 즉시 세션 features·기능 API 허용 · 회수 즉시 404 · 파일 가져오기는 공급자별(위챗 권한으로 알리페이 404) ·
//       권한 없는 회원은 확인·저장 API 모두 404 · env 항목 회수 불가 · 409·404·400 · 검색 · 탈퇴하면 권한 행 삭제 ·
//       회수하면 옛 card_import_grants 행도 지운다 · 접근 기록(기능 키·결과, 메모·검색어 원문 없음, client_ip) · 일반 세션 401 · CSRF
const databaseUrl = await reachableDatabaseUrl();

const USERNAME = 'ops-admin-features-e2e';
const PASSWORD = 'e2e-Admin-Features-Pw-8c2d4-staple';
const COOKIE = '__Host-yj_admin';
const TOTP_SECRET = generateTotpSecret();
const TOTP_KEY = base32Decode(TOTP_SECRET)!;
const ACTOR_ID = actorIdOf(USERNAME);
const ENV_USER_ID = randomUUID();
const PUBLIC_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'spki', format: 'der' })
  .toString('base64');
const DIGEST = 'a'.repeat(64);

let ipSeq = 10;
/** 요청마다 다른 클라이언트 IP(TRUST_PROXY_HOPS=1) — rate limit이 섞이지 않게 */
const nextIp = () => `203.0.113.${ipSeq++}`;

describe.skipIf(!databaseUrl)('Admin feature grants (e2e, real DB)', () => {
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
  const grant = (userId: string, feature: FeatureKey, note?: string) =>
    adminPost('/api/admin/feature-grants').send({
      userId,
      feature,
      ...(note !== undefined && { note }),
    });
  const revoke = (userId: string, feature: string) =>
    adminDelete(`/api/admin/feature-grants/${userId}/${feature}`);
  const list = async (q?: string) =>
    (
      await adminGet(
        `/api/admin/feature-grants${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      ).expect(200)
    ).body as AdminFeatureGrantList;
  const cellOf = (row: AdminFeatureGrantRow | undefined, feature: FeatureKey) =>
    row?.cells.find((c) => c.feature === feature);

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

  /** 사용자 세션으로: 세션 features · 카드 불러오기 설정 API · 파일 가져오기 확인 API(공급자별) 상태 */
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
    const check = async (provider: FileImportProvider) =>
      (
        await request(server())
          .post('/api/wallet/entries/file-import/check')
          .set('X-Forwarded-For', nextIp())
          .set(auth.headers(user))
          .send({ provider, txnDigests: [DIGEST] })
      ).status;
    const features = (
      session.body as {
        features: {
          cardImport: boolean;
          fileImport: boolean;
          fileImportProviders: FileImportProvider[];
        };
      }
    ).features;
    return {
      cardImport: features.cardImport,
      fileImportProviders: features.fileImportProviders,
      fileImport: features.fileImport,
      configStatus: config.status,
      wechatCheck: await check('WECHAT'),
      alipayCheck: await check('ALIPAY'),
    };
  }

  const NOTHING = {
    cardImport: false,
    fileImport: false,
    fileImportProviders: [],
    configStatus: 404,
    wechatCheck: 404,
    alipayCheck: 404,
  };

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
    vi.stubEnv('FEATURE_FILE_IMPORT', 'allowlist');
    vi.stubEnv('FILE_IMPORT_PROVIDERS', 'WECHAT,ALIPAY');
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
    await prisma.featureGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
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

  it('CARD_IMPORT: grant turns card import on immediately, revoke turns it off (404) and also clears the legacy card_import_grants row', async () => {
    const user = await createUser('카드권한');
    expect(await userView(user)).toEqual(NOTHING);

    const created = await grant(
      user.id,
      'CARD_IMPORT',
      '  운영자 실테스트  ',
    ).expect(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const row = created.body as AdminFeatureGrantRow;
    expect(row).toMatchObject({
      userId: user.id,
      nickname: '카드권한',
      cardImport: { consent: true, todayFetchCount: 0 },
    });
    expect(row.cells.map((c) => c.feature)).toEqual([
      'CARD_IMPORT',
      'FILE_IMPORT_WECHAT',
      'FILE_IMPORT_ALIPAY',
    ]);
    expect(cellOf(row, 'CARD_IMPORT')).toEqual({
      feature: 'CARD_IMPORT',
      sources: ['ADMIN'],
      grantedAt: expect.stringMatching(/\+09:00$/),
      grantedBy: ACTOR_ID,
      note: '운영자 실테스트',
      enabled: true,
    });
    expect(cellOf(row, 'FILE_IMPORT_WECHAT')).toMatchObject({
      sources: [],
      enabled: false,
    });
    expect(await userView(user)).toEqual({
      ...NOTHING,
      cardImport: true,
      configStatus: 200,
    });

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
    const dup = await grant(user.id, 'CARD_IMPORT').expect(409);
    expect(dup.body.code).toBe('ADMIN_FEATURE_GRANT_EXISTS');

    // 옛 리비전이 남긴 행(마이그레이션 직전 부여)도 회수 때 함께 지운다 — 되돌려도 되살아나지 않게
    await prisma.cardImportGrant.create({
      data: { userId: user.id, grantedBy: ACTOR_ID },
    });
    await revoke(user.id, 'CARD_IMPORT').expect(204);
    expect(
      await prisma.featureGrant.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(
      await prisma.cardImportGrant.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(await userView(user)).toEqual(NOTHING);
    // 다시 회수하면 404
    await revoke(user.id, 'CARD_IMPORT').expect(404);
  });

  it('FILE_IMPORT_*: per-provider grants drive session features and both file-import routes; others get 404', async () => {
    const user = await createUser('파일권한');
    const other = await createUser('권한없음');
    expect(await userView(user)).toEqual(NOTHING);

    await grant(user.id, 'FILE_IMPORT_WECHAT').expect(201);
    expect(await userView(user)).toEqual({
      ...NOTHING,
      fileImport: true,
      fileImportProviders: ['WECHAT'],
      wechatCheck: 200,
    });
    // 권한 없는 회원은 확인·저장 API 모두 404(화면 숨김만이 아니다)
    expect(await userView(other)).toEqual(NOTHING);
    await request(server())
      .post('/api/wallet/entries/file-import')
      .set('X-Forwarded-For', nextIp())
      .set(auth.headers(other))
      .send({ provider: 'WECHAT', items: [] })
      .expect(404);
    // 위챗 권한만 있으면 알리페이 저장도 404(검증보다 먼저 막힌다 — 본문이 맞아도)
    await request(server())
      .post('/api/wallet/entries/file-import')
      .set('X-Forwarded-For', nextIp())
      .set(auth.headers(user))
      .send({
        provider: 'ALIPAY',
        items: [
          {
            txnDigest: DIGEST,
            occurredAt: '2026-10-01T12:34:56+08:00',
            amount: '10.00',
            currency: 'CNY',
            merchantName: 'e2e 가맹점',
          },
        ],
      })
      .expect(404);

    await grant(user.id, 'FILE_IMPORT_ALIPAY').expect(201);
    expect(await userView(user)).toMatchObject({
      fileImportProviders: ['WECHAT', 'ALIPAY'],
      wechatCheck: 200,
      alipayCheck: 200,
    });
    const row = (await list(user.id)).items[0];
    expect(cellOf(row, 'FILE_IMPORT_ALIPAY')).toMatchObject({
      sources: ['ADMIN'],
      enabled: true,
    });

    await revoke(user.id, 'FILE_IMPORT_WECHAT').expect(204);
    expect(await userView(user)).toEqual({
      ...NOTHING,
      fileImport: true,
      fileImportProviders: ['ALIPAY'],
      alipayCheck: 200,
    });
    await revoke(user.id, 'FILE_IMPORT_ALIPAY').expect(204);
    expect(await userView(user)).toEqual(NOTHING);
  });

  it('lists features (configured/effective mode, env count), granted users by default, and any user by search', async () => {
    const granted = await createUser('표목록가');
    const plain = await createUser('표목록나');
    await grant(granted.id, 'FILE_IMPORT_WECHAT').expect(201);

    const body = await list();
    expect(body.features).toEqual([
      {
        feature: 'CARD_IMPORT',
        configuredMode: 'allowlist',
        effectiveMode: 'allowlist',
        offReason: null,
        envUserCount: 1,
      },
      {
        feature: 'FILE_IMPORT_WECHAT',
        configuredMode: 'allowlist',
        effectiveMode: 'allowlist',
        offReason: null,
        envUserCount: 0,
      },
      {
        feature: 'FILE_IMPORT_ALIPAY',
        configuredMode: 'allowlist',
        effectiveMode: 'allowlist',
        offReason: null,
        envUserCount: 0,
      },
    ]);
    expect(body.cardImportDailyLimit).toBeGreaterThan(0);
    expect(body.truncated).toBe(false);
    // 기본 목록: 권한이 있는 회원(최근 순 맨 앞) + env 항목, 권한 없는 회원은 없다
    expect(body.items[0].userId).toBe(granted.id);
    expect(body.items.some((i) => i.userId === ENV_USER_ID)).toBe(true);
    expect(body.items.some((i) => i.userId === plain.id)).toBe(false);

    // 검색: 닉네임 부분 일치(권한 없어도 보인다) · 사용자 ID 정확 일치
    const found = await list('표목록');
    expect(found.items.map((i) => i.userId).sort()).toEqual(
      [granted.id, plain.id].sort(),
    );
    expect(
      found.items
        .find((i) => i.userId === plain.id)
        ?.cells.every((c) => c.sources.length === 0 && !c.enabled),
    ).toBe(true);
    expect((await list(plain.id)).items.map((i) => i.userId)).toEqual([
      plain.id,
    ]);
    const viewed = await lastLog('ADMIN_VIEW_FEATURE_GRANTS');
    expect(viewed?.details).toEqual({
      count: 1,
      query: 'USER_ID',
      userIds: [plain.id],
    });
    await list('표목록');
    const searched = await lastLog('ADMIN_VIEW_FEATURE_GRANTS');
    expect(searched?.details).toMatchObject({ query: 'NICKNAME', count: 2 });
    // 검색어 원문은 남기지 않는다
    expect(JSON.stringify(searched?.details)).not.toContain('표목록');

    const bad = await adminGet(
      `/api/admin/feature-grants?q=${'x'.repeat(37)}`,
    ).expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
  });

  it('shows env allowlist entries as ENV on CARD_IMPORT only and refuses to revoke them (409)', async () => {
    const envUser = await createUser('환경목록', ENV_USER_ID);
    expect(await userView(envUser)).toEqual({
      ...NOTHING,
      cardImport: true,
      configStatus: 200,
    });
    const row = (await list()).items.find((i) => i.userId === ENV_USER_ID);
    expect(row?.nickname).toBe('환경목록');
    expect(cellOf(row, 'CARD_IMPORT')).toEqual({
      feature: 'CARD_IMPORT',
      sources: ['ENV'],
      grantedAt: null,
      grantedBy: null,
      note: null,
      enabled: true,
    });
    // 카드 env 목록은 파일 가져오기와 무관하다
    expect(cellOf(row, 'FILE_IMPORT_WECHAT')).toMatchObject({
      sources: [],
      enabled: false,
    });

    const refused = await revoke(ENV_USER_ID, 'CARD_IMPORT').expect(409);
    expect(refused.body.code).toBe('ADMIN_FEATURE_GRANT_ENV_ONLY');
    expect((await lastLog('ADMIN_REVOKE_FEATURE'))?.details).toEqual({
      feature: 'CARD_IMPORT',
      result: 'ADMIN_FEATURE_GRANT_ENV_ONLY',
    });
    // 파일 권한은 env가 없으니 404
    await revoke(ENV_USER_ID, 'FILE_IMPORT_WECHAT').expect(404);

    // env에도 있는 회원에게 관리자 권한을 더하면 한 칸에 ADMIN·ENV, 회수하면 관리자 권한만 지워진다
    await grant(ENV_USER_ID, 'CARD_IMPORT').expect(201);
    const both = (await list(ENV_USER_ID)).items[0];
    expect(cellOf(both, 'CARD_IMPORT')?.sources).toEqual(['ADMIN', 'ENV']);
    await revoke(ENV_USER_ID, 'CARD_IMPORT').expect(204);
    expect((await userView(envUser)).cardImport).toBe(true);
  });

  it('404 for a missing user / unknown path, 400 for bad bodies, and deletes grants when the user withdraws', async () => {
    const missing = randomUUID();
    await grant(missing, 'FILE_IMPORT_WECHAT').expect(404);
    expect((await lastLog('ADMIN_GRANT_FEATURE'))?.details).toEqual({
      feature: 'FILE_IMPORT_WECHAT',
      noteGiven: 'NO',
      result: 'NOT_FOUND',
    });
    for (const body of [
      { userId: 'not-a-uuid', feature: 'CARD_IMPORT' },
      { userId: missing, feature: 'NOPE' },
      { userId: missing },
      { userId: missing, feature: 'CARD_IMPORT', note: 'x'.repeat(101) },
    ]) {
      const bad = await adminPost('/api/admin/feature-grants')
        .send(body)
        .expect(400);
      expect(bad.body.code).toBe('VALIDATION_FAILED');
    }
    await revoke('not-a-uuid', 'CARD_IMPORT').expect(404);
    await revoke(missing, 'NOPE').expect(404);

    const leaver = await createUser('탈퇴예정');
    await grant(leaver.id, 'CARD_IMPORT').expect(201);
    await grant(leaver.id, 'FILE_IMPORT_ALIPAY').expect(201);
    const result = await app
      .get(AccountDeletionService)
      .deleteAccount(leaver.id, { channel: 'IN_APP' });
    expect(result).toMatchObject({
      status: 'DELETED',
      counts: { featureGrants: 2, cardImportGrants: 0 },
    });
    expect(
      await prisma.featureGrant.count({ where: { userId: leaver.id } }),
    ).toBe(0);
    expect((await list()).items.some((i) => i.userId === leaver.id)).toBe(
      false,
    );
    // 탈퇴한 회원에게는 다시 줄 수 없다
    await grant(leaver.id, 'CARD_IMPORT').expect(404);
  });

  it('CARD_IMPORT revoke also clears a grant that exists only in the legacy card_import_grants table (204), 404 only when neither has it', async () => {
    const user = await createUser('옛표만');
    const legacyAt = new Date('2026-10-30T01:02:03.000Z');
    await prisma.cardImportGrant.create({
      data: { userId: user.id, grantedBy: ACTOR_ID, grantedAt: legacyAt },
    });
    await revoke(user.id, 'CARD_IMPORT').expect(204);
    expect(
      await prisma.cardImportGrant.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect((await lastLog('ADMIN_REVOKE_FEATURE'))?.details).toEqual({
      feature: 'CARD_IMPORT',
      result: 'REVOKED',
      grantedAt: legacyAt.toISOString(),
    });
    // 둘 다 없으면 404
    await revoke(user.id, 'CARD_IMPORT').expect(404);
    // 파일 권한 회수는 옛 표를 보지 않는다
    await prisma.cardImportGrant.create({
      data: { userId: user.id, grantedBy: ACTOR_ID },
    });
    await revoke(user.id, 'FILE_IMPORT_WECHAT').expect(404);
    expect(
      await prisma.cardImportGrant.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it('rejects control characters in the note (400) and stores nothing', async () => {
    const user = await createUser('메모검사');
    for (const note of ['줄\n바꿈', '탭\t문자', 'nul\u0000', '구분 자']) {
      const bad = await grant(user.id, 'FILE_IMPORT_WECHAT', note).expect(400);
      expect(bad.body.code).toBe('VALIDATION_FAILED');
    }
    expect(
      await prisma.featureGrant.count({ where: { userId: user.id } }),
    ).toBe(0);
    await grant(user.id, 'FILE_IMPORT_WECHAT', ' 앞뒤 공백은 괜찮다 ').expect(
      201,
    );
  });

  it('records every view/grant/revoke in access_logs with the feature key and target user — never the note text', async () => {
    const user = await createUser('기록확인');
    await grant(user.id, 'FILE_IMPORT_ALIPAY', '베타 테스트 메모').expect(201);
    const granted = await lastLog('ADMIN_GRANT_FEATURE');
    expect(granted).toMatchObject({
      resourceType: 'USER',
      resourceId: user.id,
      details: {
        feature: 'FILE_IMPORT_ALIPAY',
        noteGiven: 'YES',
        result: 'GRANTED',
      },
    });
    expect(JSON.stringify(granted?.details)).not.toContain('베타');
    expect(isIP(granted?.clientIp ?? '')).not.toBe(0);
    expect(granted?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    // 메모는 권한 행에만 있다
    expect(
      await prisma.featureGrant.findUnique({
        where: {
          userId_feature: { userId: user.id, feature: 'FILE_IMPORT_ALIPAY' },
        },
        select: { note: true },
      }),
    ).toEqual({ note: '베타 테스트 메모' });

    await list();
    const viewed = await lastLog('ADMIN_VIEW_FEATURE_GRANTS');
    expect(viewed).toMatchObject({
      resourceType: 'FEATURE_GRANT',
      resourceId: null,
    });
    const details = viewed?.details as { count: number; userIds: string[] };
    expect(details.userIds).toContain(user.id);
    expect(details.count).toBe(details.userIds.length);

    await revoke(user.id, 'FILE_IMPORT_ALIPAY').expect(204);
    const revoked = await lastLog('ADMIN_REVOKE_FEATURE');
    expect(revoked).toMatchObject({
      resourceType: 'USER',
      resourceId: user.id,
      details: {
        feature: 'FILE_IMPORT_ALIPAY',
        result: 'REVOKED',
        grantedAt: expect.any(String),
      },
    });
    expect(isIP(revoked?.clientIp ?? '')).not.toBe(0);
  });

  it('is admin-only: a user session gets 401 ADMIN_UNAUTHENTICATED, and writes need the Origin (CSRF)', async () => {
    const user = await createUser('일반회원');
    for (const send of [
      () => request(server()).get('/api/admin/feature-grants'),
      () =>
        request(server())
          .post('/api/admin/feature-grants')
          .send({ userId: user.id, feature: 'FILE_IMPORT_WECHAT' }),
      () =>
        request(server()).delete(
          `/api/admin/feature-grants/${user.id}/FILE_IMPORT_WECHAT`,
        ),
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
      .post('/api/admin/feature-grants')
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', adminCookie)
      .send({ userId: user.id, feature: 'FILE_IMPORT_WECHAT' })
      .expect(403);
    await request(server())
      .delete(`/api/admin/feature-grants/${user.id}/FILE_IMPORT_WECHAT`)
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', adminCookie)
      .expect(403);
    expect(
      await prisma.featureGrant.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(await userView(user)).toEqual(NOTHING);
  });
});
