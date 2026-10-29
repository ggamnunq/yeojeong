import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  CardApprovalItem,
  CardImportConfig,
  ConsentId,
  ConsentRequirement,
  FetchCardApprovalsResponse,
  ImportWalletEntriesResponse,
  RevocableConsent,
  WalletEntryListResponse,
} from '@yeojeong/shared';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PurgeService } from './../src/retention/purge.service.js';
import { CODEF_FETCH } from './../src/card-import/codef/codef.client.js';
import { CodefConfig } from './../src/card-import/codef/codef.config.js';
import { CODEF_PATHS } from './../src/card-import/codef/codef.constants.js';
import {
  ConsentCatalog,
  ConsentChecker,
  MembershipLookup,
  SessionResolver,
} from './../src/common/auth/index.js';
import { PrismaConsentChecker } from './../src/common/auth/consent-checker.js';
import { PrismaMembershipLookup } from './../src/common/auth/membership-lookup.js';
import { FeatureFlags } from './../src/common/features.js';
import { createLogger } from './../src/common/logging/logger.js';
import { PINO_LOGGER } from './../src/common/logging/logging.module.js';
import type { PrismaClient } from './../src/generated/prisma/client.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';
import { createTestAuth } from './auth-helpers.js';
import {
  createFixturePrisma,
  ExpenseFixtures,
  reachableDatabaseUrl,
  type SeedTrip,
} from './expenses-fixtures.js';
import {
  codefHttpMock,
  codefResult,
  type CodefRoute,
} from './fakes/codef-http.js';

// 카드 승인내역 불러오기(S8) 실제 DB e2e. CODEF는 HTTP 목(실제 네트워크 호출 없음).
// 증명: 로그인 정보가 어떤 로그에도 없다 · 조회 결과가 DB에 남지 않는다 · 플래그(off/allowlist)면 404 ·
//       동의 없으면 403 · 고른 것만 저장·중복 방지 · 동의 철회(HF-58).
const databaseUrl = await reachableDatabaseUrl();

const DAY_MS = 86_400_000;
const kstDay = (offsetDays: number) =>
  new Date(Date.now() + 9 * 3_600_000 + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
const LOGIN_ID = 'e2e-card-login-id-7f3a';
/** 실제 RSA 2048 공개키(암호문은 256바이트여야 받는다). 개인키는 쓰지 않는다 */
const PUBLIC_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'spki', format: 'der' })
  .toString('base64');
const PASSWORD_CIPHERTEXT = randomBytes(256).toString('base64');
const TWO_WAY_CODE = '987654';

/** CARD_IMPORT만 실제 동의 기록으로 판정하고, 가입 동의는 통과시킨다(픽스처 사용자는 가입 동의 행이 없다) */
class CardImportOnlyChecker extends ConsentChecker {
  constructor(private readonly real: PrismaConsentChecker) {
    super();
  }
  findMissing(
    userId: string,
    ids: readonly ConsentId[],
  ): Promise<ConsentRequirement[]> {
    return this.real.findMissing(
      userId,
      ids.filter((id) => id === 'CARD_IMPORT'),
    );
  }
}

describe.skipIf(!databaseUrl)(
  'Card import (S8 e2e, real DB, CODEF HTTP mock)',
  () => {
    let prisma: PrismaClient;
    let fx: ExpenseFixtures;
    let app: NestExpressApplication;
    let auth: ReturnType<typeof createTestAuth>;
    let logOutput = '';
    let routes: Record<string, CodefRoute> = {};
    const flags = {
      accountLink: false,
      cardImportMode: 'on' as 'off' | 'allowlist' | 'on',
      allowed: new Set<string>(),
      cardImportFor(userId?: string | null) {
        if (this.cardImportMode === 'on') return true;
        return (
          this.cardImportMode === 'allowlist' &&
          !!userId &&
          this.allowed.has(userId)
        );
      },
      view(userId?: string | null) {
        return { accountLink: false, cardImport: this.cardImportFor(userId) };
      },
    };
    const http = codefHttpMock(
      new Proxy({} as Record<string, CodefRoute>, {
        get: (_t, path: string) => routes[path],
      }),
    );

    beforeAll(async () => {
      prisma = createFixturePrisma(databaseUrl as string);
      fx = new ExpenseFixtures(prisma);
      auth = createTestAuth();
      const service = prisma as unknown as PrismaService;
      const logger = createLogger(
        new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'debug' }),
        { write: (line: string) => (logOutput += line) },
      );
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(SessionResolver)
        .useValue(auth.sessions)
        .overrideProvider(ConsentChecker)
        .useValue(
          new CardImportOnlyChecker(
            new PrismaConsentChecker(service, new ConsentCatalog(service)),
          ),
        )
        .overrideProvider(MembershipLookup)
        .useValue(new PrismaMembershipLookup(service))
        .overrideProvider(FeatureFlags)
        .useValue(flags)
        .overrideProvider(CodefConfig)
        .useValue(
          new CodefConfig(
            new ConfigService({
              CODEF_ENV: 'sandbox',
              CODEF_CLIENT_ID: 'e2e-client-id',
              CODEF_CLIENT_SECRET: 'e2e-client-secret',
              CODEF_PUBLIC_KEY: PUBLIC_KEY,
            }),
          ),
        )
        .overrideProvider(CODEF_FETCH)
        .useValue(http.fetch)
        .overrideProvider(PINO_LOGGER)
        .useValue(logger)
        .compile();
      app =
        moduleFixture.createNestApplication<NestExpressApplication>(
          APP_OPTIONS,
        );
      setupApp(app);
      await app.init();
      // 서비스 일일 CODEF 예산 카운터를 오늘 0으로(같은 날 여러 번 돌려도 예산에 걸리지 않게)
      await prisma.codefDailyUsage.deleteMany({ where: { day: todayDate() } });
    });

    afterAll(async () => {
      await prisma?.codefDailyUsage.deleteMany({ where: { day: todayDate() } });
      await prisma?.userConsent.deleteMany({
        where: { userId: { in: fx?.userIds ?? [] } },
      });
      await fx?.cleanup();
      await app?.close();
      await prisma?.$disconnect();
    });

    beforeEach(() => {
      flags.cardImportMode = 'on';
      flags.allowed.clear();
    });

    const todayDate = () => new Date(`${kstDay(0)}T00:00:00Z`);
    const server = () => app.getHttpServer();
    const as = (seed: SeedTrip, name: string) =>
      auth.headers({
        id: seed.members[name].userId,
        nickname: name,
        profileImageUrl: null,
      });
    const seedOngoing = (names = ['준용', '민지']) =>
      fx.seedTrip(names, {
        period: { start: kstDay(-2), end: kstDay(2) },
        currency: 'KRW',
        withPaymentMethod: false,
      });
    const consent = (seed: SeedTrip, name: string) =>
      request(server())
        .post('/api/consents')
        .set(as(seed, name))
        .send({
          stage: 'CARD_IMPORT',
          screen: 'HF-51',
          method: 'INDIVIDUAL',
          agreements: [
            { consentId: 'CARD_IMPORT', version: '0.1-draft', agreed: true },
          ],
        });
    const fetchBody = (over: object = {}) => ({
      organization: '0306',
      loginId: LOGIN_ID,
      encryptedPassword: PASSWORD_CIPHERTEXT,
      from: kstDay(-2),
      to: kstDay(0),
      ...over,
    });
    const fetchAs = (seed: SeedTrip, name: string, over: object = {}) =>
      request(server())
        .post('/api/card-import/fetch')
        .set(as(seed, name))
        .send(fetchBody(over));
    const yyyymmdd = (day: string) => day.replaceAll('-', '');
    const approvals = () => [
      {
        resUsedDate: yyyymmdd(kstDay(-1)),
        resUsedTime: '121500',
        resUsedAmount: '18000',
        resAccountCurrency: 'KRW',
        resHomeForeignType: '1',
        resCancelYN: '0',
        resCardNo: '9410********1934',
        resApprovalNo: 'E2E-APPROVAL-0001',
        resMemberStoreName: '이치란 라멘',
        resMemberStoreAddr: '서울 어딘가 비밀주소 1',
      },
      {
        resUsedDate: yyyymmdd(kstDay(-1)),
        resUsedTime: '090000',
        resUsedAmount: '4500',
        resAccountCurrency: 'KRW',
        resHomeForeignType: '1',
        resCancelYN: '1',
        resCardNo: '9410********1934',
        resApprovalNo: 'E2E-APPROVAL-0002',
        resMemberStoreName: '편의점',
      },
    ];
    type Item = CardApprovalItem;
    const toImport = (pick: Item, over: object = {}) => ({
      importKey: pick.importKey,
      itemToken: pick.itemToken,
      occurredAt: pick.approvedAt,
      amount: pick.amount,
      currency: pick.currency,
      merchantName: pick.merchantName,
      krwAmount: pick.krwAmount,
      ...over,
    });

    it('hides every card-import route with 404 while off, and only for non-allowlisted users', async () => {
      const seed = await seedOngoing(['준용', '민지']);
      flags.cardImportMode = 'off';
      for (const name of ['준용', '민지']) {
        await request(server())
          .get('/api/card-import/config')
          .set(as(seed, name))
          .expect(404);
        await fetchAs(seed, name).expect(404);
        await request(server())
          .post('/api/wallet/entries/import')
          .set(as(seed, name))
          .send({ items: [] })
          .expect(404);
        // 동의 저장·상태도 이 사용자에게 꺼져 있으면 404(동의 ID별 게이트)
        await consent(seed, name).expect(404);
        await request(server())
          .get('/api/consents/status?stage=CARD_IMPORT')
          .set(as(seed, name))
          .expect(404);
      }
      const session = await request(server())
        .get('/api/auth/session')
        .set(as(seed, '준용'));
      expect(session.body.features).toEqual({
        accountLink: false,
        cardImport: false,
      });

      flags.cardImportMode = 'allowlist';
      flags.allowed.add(seed.members['준용'].userId);
      await request(server())
        .get('/api/card-import/config')
        .set(as(seed, '준용'))
        .expect(200);
      await request(server())
        .get('/api/card-import/config')
        .set(as(seed, '민지'))
        .expect(404);
      // accountLink=false여도 CARD_IMPORT 동의 상태는 허용 사용자에게 열린다(FIN_LINK는 계속 404)
      await request(server())
        .get('/api/consents/status?stage=CARD_IMPORT')
        .set(as(seed, '준용'))
        .expect(200);
      await request(server())
        .get('/api/consents/status?stage=FIN_LINK')
        .set(as(seed, '준용'))
        .expect(404);
      await consent(seed, '민지').expect(404);
      const mine = await request(server())
        .get('/api/auth/session')
        .set(as(seed, '준용'));
      expect(mine.body.features.cardImport).toBe(true);
      const theirs = await request(server())
        .get('/api/auth/session')
        .set(as(seed, '민지'));
      expect(theirs.body.features.cardImport).toBe(false);
      expect(http.calls).toHaveLength(0);
    });

    it('applies CSRF to card-import routes', async () => {
      const seed = await seedOngoing(['준용']);
      const { Origin: _origin, ...noOrigin } = as(seed, '준용');
      const res = await request(server())
        .post('/api/card-import/fetch')
        .set(noOrigin)
        .send(fetchBody())
        .expect(403);
      expect(res.body.code).toBe('CSRF_REJECTED');
      await request(server())
        .post('/api/wallet/entries/import')
        .set(noOrigin)
        .send({ items: [] })
        .expect(403);
    });

    it('requires the CARD_IMPORT consent, then fetches without storing anything or logging credentials', async () => {
      const seed = await seedOngoing(['준용']);
      const userId = seed.members['준용'].userId;
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
          codefResult('CF-00000', approvals()),
      };

      const config = await request(server())
        .get('/api/card-import/config')
        .set(as(seed, '준용'))
        .expect(200);
      const body = config.body as CardImportConfig;
      expect(body).toMatchObject({
        enabled: true,
        publicKey: PUBLIC_KEY,
        publicKeyFingerprint: createHash('sha256')
          .update(Buffer.from(PUBLIC_KEY, 'base64'))
          .digest('hex'),
        maxRangeDays: 92,
        maxLookbackDays: 365,
        remainingToday: 10,
        defaultRange: {
          from: kstDay(-2),
          to: kstDay(0),
          basis: 'ONGOING_TRIP',
          tripId: seed.tripId,
        },
        consent: { valid: false, missing: ['CARD_IMPORT'] },
      });
      // 현대·하나(카드번호 전체 필요)는 1차에서 뺐다
      expect(body.organizations.map((o) => o.code)).toEqual([
        '0301',
        '0303',
        '0304',
        '0305',
        '0306',
        '0309',
        '0311',
      ]);
      expect(body.organizations.every((o) => !o.requiresCardNo)).toBe(true);

      const denied = await fetchAs(seed, '준용').expect(403);
      expect(denied.body.code).toBe('CONSENT_REQUIRED');
      expect(http.calls).toHaveLength(0);

      await consent(seed, '준용').expect(201);
      // 현대·하나는 거절(400, CODEF 호출 없음)
      for (const organization of ['0302', '0313']) {
        await fetchAs(seed, '준용', {
          organization,
          loginCardNo: '9410123412341934',
          encryptedCardPassword: PASSWORD_CIPHERTEXT,
        }).expect(400);
      }
      expect(http.calls).toHaveLength(0);
      const txBefore = await prisma.transaction.count({ where: { userId } });
      const callsBefore = http.calls.length;
      logOutput = '';
      const res = await fetchAs(seed, '준용').expect(200);
      const result = res.body as FetchCardApprovalsResponse;
      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        amount: '18000',
        currency: 'KRW',
        krwAmount: 18000,
        merchantName: '이치란 라멘',
        cardLast4: '1934',
        status: 'NEW',
        cancelState: 'NONE',
        inTripId: seed.tripId,
        selectable: true,
        defaultSelected: true,
        alreadyImported: false,
      });
      expect(result.items[1]).toMatchObject({
        status: 'CANCELLED',
        selectable: false,
        itemToken: null,
      });
      // 승인번호·카드번호·주소는 응답에 없다
      expect(JSON.stringify(res.body)).not.toMatch(
        /E2E-APPROVAL|9410|비밀주소/,
      );

      // CODEF로는 로그인 정보가 그대로 갔다(direct: 계정을 만들지 않는다)
      expect(http.calls.slice(callsBefore).map((c) => c.path)).toEqual([
        CODEF_PATHS.CARD_APPROVAL_LIST,
      ]);
      expect(http.calls.at(-1)?.body).toMatchObject({
        id: LOGIN_ID,
        password: PASSWORD_CIPHERTEXT,
      });

      // 조회 결과는 DB에 남지 않는다
      expect(await prisma.transaction.count({ where: { userId } })).toBe(
        txBefore,
      );
      expect(
        await prisma.transaction.count({
          where: { userId, source: 'CARD_IMPORT' },
        }),
      ).toBe(0);
      expect(await prisma.codefPendingDeletion.count()).toBe(0);
      // 잠금은 풀렸고, 서비스 일일 호출 수만 늘었다
      expect(await prisma.cardImportLock.count({ where: { userId } })).toBe(0);
      expect(
        (
          await prisma.codefDailyUsage.findUnique({
            where: { day: todayDate() },
          })
        )?.calls,
      ).toBeGreaterThanOrEqual(1);

      // 접근 기록: 기관 코드·건수·결과 코드만
      const logs = await prisma.accessLog.findMany({
        where: { userId, action: 'FETCH_CARD_APPROVALS' },
        select: { details: true, resourceType: true },
      });
      expect(logs).toEqual([
        {
          details: {
            organization: '0306',
            count: 2,
            result: 'OK',
            step: 'START',
          },
          resourceType: 'USER',
        },
      ]);

      // 어떤 로그(요청 로그·서비스 로그·접근 기록 로그)에도 로그인 정보·결과 내용이 없다
      expect(logOutput).toContain('/api/card-import/fetch');
      for (const secret of [
        LOGIN_ID,
        PASSWORD_CIPHERTEXT,
        '이치란',
        'E2E-APPROVAL',
        '18000',
      ]) {
        expect(logOutput).not.toContain(secret);
      }
    });

    it('never echoes login values in validation errors, malformed bodies or logs', async () => {
      const seed = await seedOngoing(['준용']);
      await consent(seed, '준용').expect(201);
      logOutput = '';
      const longId = `${LOGIN_ID}-${'x'.repeat(120)}`;
      const invalid = await fetchAs(seed, '준용', {
        loginId: longId,
        encryptedPassword: `${PASSWORD_CIPHERTEXT} not base64 !!`,
        twoWay: { token: 'tw1.e2e-token-value', code: 'abc-e2e-code' },
        unknownField: 'e2e-extra-value',
      }).expect(400);
      expect(invalid.body.code).toBe('VALIDATION_FAILED');
      const malformed = await request(server())
        .post('/api/card-import/fetch')
        .set({ ...as(seed, '준용'), 'Content-Type': 'application/json' })
        .send(
          `{"loginId":"${LOGIN_ID}","encryptedPassword":"${PASSWORD_CIPHERTEXT}",`,
        );
      expect(malformed.status).toBe(400);
      const everything =
        JSON.stringify([invalid.body, malformed.body]) + logOutput;
      for (const secret of [
        LOGIN_ID,
        PASSWORD_CIPHERTEXT,
        'not base64',
        'e2e-token-value',
        'abc-e2e-code',
        'e2e-extra-value',
      ]) {
        expect(everything).not.toContain(secret);
      }
      expect(http.calls.filter((c) => c.body.id === longId)).toHaveLength(0);
    });

    it('keeps login values out of logs on CODEF failures, counts failures and cools down after 3', async () => {
      const seed = await seedOngoing(['준용']);
      await consent(seed, '준용').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-12803', {}),
      };
      logOutput = '';
      const first = await fetchAs(seed, '준용').expect(400);
      expect(first.body).toMatchObject({
        code: 'CARD_LOGIN_FAILED',
        details: { failedAttempts: 1 },
      });
      // 카드사 메시지는 넘기지 않는다
      expect(first.body.message).toBe(
        '카드사 아이디나 비밀번호를 다시 확인해 주세요',
      );
      const second = await fetchAs(seed, '준용').expect(400);
      expect(second.body.details).toEqual({ failedAttempts: 2 });
      // 3회째 실패 응답부터 30분 쿨다운
      const third = await fetchAs(seed, '준용').expect(429);
      expect(third.body.code).toBe('CARD_IMPORT_LOGIN_COOLDOWN');
      expect(third.body.details.retryAfter).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(Number(third.headers['retry-after'])).toBe(
        third.body.details.retryAfterSec,
      );
      expect(third.body.details.retryAfterSec).toBeGreaterThan(1700);
      expect(logOutput).not.toContain(LOGIN_ID);
      expect(logOutput).not.toContain(PASSWORD_CIPHERTEXT);
      const failureRow = await prisma.cardImportLoginFailure.findFirst({
        where: { userId: seed.members['준용'].userId },
      });
      expect(failureRow).toMatchObject({ organization: '0306', failures: 3 });
      expect(Object.keys(failureRow ?? {}).sort()).toEqual(
        ['failures', 'lastFailedAt', 'organization', 'userId'].sort(),
      );
    });

    it('turns network failures into CARD_IMPORT_FAILED without leaking the cause', async () => {
      const seed = await seedOngoing(['준용']);
      await consent(seed, '준용').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
          new TypeError(`boom ${LOGIN_ID}`),
      };
      logOutput = '';
      const broken = await fetchAs(seed, '준용').expect(502);
      expect(broken.body.code).toBe('CARD_IMPORT_FAILED');
      expect(JSON.stringify(broken.body) + logOutput).not.toContain(LOGIN_ID);
    });

    it('continues a 2-way flow only for the same user', async () => {
      const seed = await seedOngoing(['준용', '민지']);
      await consent(seed, '준용').expect(201);
      await consent(seed, '민지').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: (body) =>
          body.is2Way
            ? codefResult('CF-00000', approvals())
            : codefResult('CF-03002', {
                continue2Way: true,
                method: 'smsAuthNo',
                jobIndex: 0,
                threadIndex: 0,
                jti: 'e2e-jti',
                twoWayTimestamp: 1793260000000,
              }),
      };
      logOutput = '';
      const first = await fetchAs(seed, '준용', {
        organization: '0311',
      }).expect(200);
      expect(first.body).toMatchObject({
        status: 'TWO_WAY_REQUIRED',
        method: 'SMS',
      });
      const twoWay = {
        token: first.body.twoWayToken as string,
        code: TWO_WAY_CODE,
      };
      await fetchAs(seed, '민지', { organization: '0311', twoWay }).expect(410);
      const done = await fetchAs(seed, '준용', {
        organization: '0311',
        twoWay,
      }).expect(200);
      expect(done.body.status).toBe('OK');
      expect(http.calls.at(-1)?.body).toMatchObject({
        is2Way: true,
        smsAuthNo: TWO_WAY_CODE,
        twoWayInfo: { jti: 'e2e-jti' },
      });
      expect(logOutput).not.toContain(TWO_WAY_CODE);
      expect(logOutput).not.toContain(twoWay.token);
      // 이어가기는 새 조회로 세지 않는다
      const config = await request(server())
        .get('/api/card-import/config')
        .set(as(seed, '준용'))
        .expect(200);
      expect(config.body.remainingToday).toBe(9);
      // 결과를 받은 토큰은 바로 무효(재사용 410). 이어가기 행도 지워졌다
      await fetchAs(seed, '준용', { organization: '0311', twoWay }).expect(410);
      expect(
        await prisma.cardImportTwoWaySession.count({
          where: { userId: seed.members['준용'].userId },
        }),
      ).toBe(0);
    });

    it('allows at most 3 attempts per 2-way token and returns unused budget (M1)', async () => {
      const seed = await seedOngoing(['준용']);
      const userId = seed.members['준용'].userId;
      await consent(seed, '준용').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: (body) =>
          body.is2Way
            ? codefResult('CF-12872', {})
            : codefResult('CF-03002', {
                method: 'smsAuthNo',
                jobIndex: 0,
                threadIndex: 0,
                jti: 'e2e-jti-2',
                twoWayTimestamp: 1793260000001,
              }),
      };
      const callsBefore =
        (
          await prisma.codefDailyUsage.findUnique({
            where: { day: todayDate() },
          })
        )?.calls ?? 0;
      const first = await fetchAs(seed, '준용', {
        organization: '0311',
      }).expect(200);
      const twoWay = {
        token: first.body.twoWayToken as string,
        code: '000000',
      };
      const row = await prisma.cardImportTwoWaySession.findFirstOrThrow({
        where: { userId },
      });
      // 예약 4 중 1 사용, 3을 이어가기가 들고 간다. 행에 토큰·인증번호는 없다(해시만)
      expect(row).toMatchObject({ attempts: 0, callsLeft: 3 });
      expect(JSON.stringify(row)).not.toContain(twoWay.token.slice(4, 20));
      for (let i = 0; i < 3; i += 1) {
        const res = await fetchAs(seed, '준용', {
          organization: '0311',
          twoWay,
        }).expect(400);
        expect(res.body.code).toBe('CARD_TWO_WAY_INVALID');
      }
      // 4번째는 같은 토큰이라도 410(행이 닫혔다)
      await fetchAs(seed, '준용', { organization: '0311', twoWay }).expect(410);
      expect(
        await prisma.cardImportTwoWaySession.count({ where: { userId } }),
      ).toBe(0);
      // 실제로 쓴 호출(처음 1 + 이어가기 3)만 남았다
      const callsAfter =
        (
          await prisma.codefDailyUsage.findUnique({
            where: { day: todayDate() },
          })
        )?.calls ?? 0;
      expect(callsAfter - callsBefore).toBe(4);
    });

    it('reserves the daily budget atomically under concurrency (M1)', async () => {
      const seed = await seedOngoing(['준용', '민지']);
      await consent(seed, '준용').expect(201);
      await consent(seed, '민지').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []),
      };
      const before =
        (
          await prisma.codefDailyUsage.findUnique({
            where: { day: todayDate() },
          })
        )?.calls ?? 0;
      // 남은 예산 4: 한 번만 예약된다
      await prisma.codefDailyUsage.upsert({
        where: { day: todayDate() },
        create: { day: todayDate(), calls: 96 },
        update: { calls: 96 },
      });
      const results = await Promise.all([
        fetchAs(seed, '준용'),
        fetchAs(seed, '민지'),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 503,
      ]);
      await prisma.codefDailyUsage.update({
        where: { day: todayDate() },
        data: { calls: before },
      });
    });

    it('drops pending deletions after 30 days and alerts daily (L5)', async () => {
      const purge = app.get(PurgeService);
      const id = randomUUID();
      await prisma.codefPendingDeletion.create({
        data: {
          id,
          connectedIdEnc: new Uint8Array([1, 2, 3]),
          organization: '0306',
          createdAt: new Date(Date.now() - 31 * 86_400_000),
        },
      });
      logOutput = '';
      const result = await purge.run();
      expect(
        result.steps.find((s) => s.step === 'CODEF_PENDING_DELETIONS'),
      ).toMatchObject({ count: 1 });
      expect(await prisma.codefPendingDeletion.count({ where: { id } })).toBe(
        0,
      );
      expect(logOutput).toContain('CODEF 계정 삭제 대기가 30일을 넘겨 버렸다');
    });

    it('saves only signed items, links them like manual entries and never duplicates', async () => {
      const seed = await seedOngoing(['준용']);
      const userId = seed.members['준용'].userId;
      await consent(seed, '준용').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
          codefResult('CF-00000', approvals()),
      };
      const fetched = await fetchAs(seed, '준용').expect(200);
      const [pick] = fetched.body.items as Item[];
      const item = toImport(pick);

      // 값을 바꾸거나 서명 없이 만든 항목은 거절(아무것도 저장하지 않음)
      for (const forged of [
        toImport(pick, { amount: '1' }),
        toImport(pick, { merchantName: '다른 가맹점' }),
        toImport(pick, { krwAmount: 1 }),
        toImport(pick, { itemToken: '9999999999.' + 'A'.repeat(43) }),
        toImport(pick, { importKey: 'f'.repeat(64) }),
      ]) {
        const res = await request(server())
          .post('/api/wallet/entries/import')
          .set(as(seed, '준용'))
          .send({ items: [item, forged] })
          .expect(410);
        expect(res.body).toMatchObject({
          code: 'CARD_IMPORT_RESULT_EXPIRED',
          details: { invalidIndexes: [1] },
        });
      }
      // 다른 사용자가 같은 값을 보내도 거절
      const other = await seedOngoing(['민지']);
      await consent(other, '민지').expect(201);
      await request(server())
        .post('/api/wallet/entries/import')
        .set(as(other, '민지'))
        .send({ items: [item] })
        .expect(410);
      expect(
        await prisma.transaction.count({
          where: { userId, source: 'CARD_IMPORT' },
        }),
      ).toBe(0);

      const saved = await request(server())
        .post('/api/wallet/entries/import')
        .set(as(seed, '준용'))
        .send({ items: [item] })
        .expect(201);
      const first = saved.body as ImportWalletEntriesResponse;
      expect(first).toMatchObject({ created: 1, skipped: 0, linked: 1 });
      expect(first.items[0]).toMatchObject({
        importKey: pick.importKey,
        created: true,
        entry: {
          source: 'CARD_IMPORT',
          amount: '18000',
          currency: 'KRW',
          merchantName: '이치란 라멘',
          canDelete: true,
          linkedTrip: { tripId: seed.tripId, expenseStatus: 'PENDING' },
        },
      });

      // 다시 보내도 새로 만들지 않는다(같은 항목을 돌려준다)
      const again = await request(server())
        .post('/api/wallet/entries/import')
        .set(as(seed, '준용'))
        .send({ items: [item] })
        .expect(201);
      expect(again.body).toMatchObject({ created: 0, skipped: 1, linked: 0 });
      expect(again.body.items[0]).toMatchObject({
        created: false,
        entry: { id: first.items[0].entry.id },
      });
      // 같은 요청 안의 중복은 400
      await request(server())
        .post('/api/wallet/entries/import')
        .set(as(seed, '준용'))
        .send({ items: [item, item] })
        .expect(400);
      // 동시에 보내도 한 건만 남는다
      await prisma.expense.deleteMany({ where: { tripId: seed.tripId } });
      await prisma.transaction.deleteMany({
        where: { userId, source: 'CARD_IMPORT' },
      });
      await Promise.all(
        [1, 2, 3].map(() =>
          request(server())
            .post('/api/wallet/entries/import')
            .set(as(seed, '준용'))
            .send({ items: [item] }),
        ),
      );
      expect(
        await prisma.transaction.count({
          where: { userId, source: 'CARD_IMPORT' },
        }),
      ).toBe(1);
      // 저장한 것: 순액·통화·가맹점·카드사 원화·importKey. 카드사·부분 취소액·승인번호는 없다
      const stored = await prisma.transaction.findFirstOrThrow({
        where: { userId, source: 'CARD_IMPORT' },
      });
      expect(stored).toMatchObject({
        externalRef: pick.importKey,
        providerKrwAmount: 18000,
        paymentMethodId: null,
        rawPayloadEnc: null,
        providerApprovalRef: null,
        merchantNameRaw: '이치란 라멘',
      });
      expect(JSON.stringify(stored)).not.toMatch(/E2E-APPROVAL|0306|1934/);

      // 다시 조회하면 ALREADY_IMPORTED
      const refetch = await fetchAs(seed, '준용').expect(200);
      expect(refetch.body.items[0]).toMatchObject({
        importKey: pick.importKey,
        status: 'ALREADY_IMPORTED',
        alreadyImported: true,
        selectable: false,
        itemToken: null,
      });

      // 지갑 목록에 CARD_IMPORT로 보이고, 직접 입력처럼 지울 수 있다
      const list = await request(server())
        .get('/api/wallet/entries')
        .set(as(seed, '준용'))
        .expect(200);
      const entry = (list.body as WalletEntryListResponse).items.find(
        (e) => e.source === 'CARD_IMPORT',
      );
      expect(entry).toBeDefined();
      await request(server())
        .delete(`/api/wallet/entries/${entry!.id}`)
        .set(as(seed, '준용'))
        .expect(204);
      expect(
        await prisma.transaction.count({
          where: { userId, source: 'CARD_IMPORT' },
        }),
      ).toBe(0);
    });

    it('limits new fetches to 3 per 10 minutes and 10 per KST day', async () => {
      const seed = await seedOngoing(['준용', '민지']);
      await consent(seed, '준용').expect(201);
      await consent(seed, '민지').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []),
      };
      for (let i = 0; i < 3; i += 1) {
        await fetchAs(seed, '준용').expect(200);
      }
      const limited = await fetchAs(seed, '준용').expect(429);
      expect(limited.body.code).toBe('CARD_IMPORT_RATE_LIMITED');
      expect(limited.body.details.retryAfter).toMatch(/Z$/);
      expect(Number(limited.headers['retry-after'])).toBe(
        limited.body.details.retryAfterSec,
      );
      expect(limited.body.details.retryAfterSec).toBeGreaterThan(500);

      // 하루 10회: 오늘 앞서 시작한 조회 10건(11분 전)이 있으면 다음 KST 자정까지
      const userId = seed.members['민지'].userId;
      await prisma.accessLog.createMany({
        data: Array.from({ length: 10 }, () => ({
          userId,
          action: 'FETCH_CARD_APPROVALS',
          resourceType: 'USER',
          resourceId: userId,
          details: {
            organization: '0306',
            count: 0,
            result: 'OK',
            step: 'START',
          },
          at: new Date(
            Math.max(
              Date.now() - 11 * 60_000,
              Date.parse(`${kstDay(0)}T00:00:00+09:00`),
            ),
          ),
        })),
      });
      const config = await request(server())
        .get('/api/card-import/config')
        .set(as(seed, '민지'))
        .expect(200);
      expect(config.body.remainingToday).toBe(0);
      const daily = await fetchAs(seed, '민지').expect(429);
      // 다음 KST 자정(UTC로)
      expect(daily.body.details.retryAfter).toBe(
        new Date(`${kstDay(1)}T00:00:00+09:00`).toISOString(),
      );
    });

    it('allows one fetch at a time per user', async () => {
      const seed = await seedOngoing(['준용']);
      const userId = seed.members['준용'].userId;
      await consent(seed, '준용').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []),
      };
      await prisma.cardImportLock.create({
        data: { userId, expiresAt: new Date(Date.now() + 60_000) },
      });
      const busy = await fetchAs(seed, '준용').expect(409);
      expect(busy.body.code).toBe('CARD_IMPORT_IN_PROGRESS');
      // 만료된 잠금은 다음 요청이 가져간다
      await prisma.cardImportLock.update({
        where: { userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await fetchAs(seed, '준용').expect(200);
      expect(await prisma.cardImportLock.count({ where: { userId } })).toBe(0);
    });

    it('stops new fetches when the daily CODEF budget runs low', async () => {
      const seed = await seedOngoing(['준용']);
      await consent(seed, '준용').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []),
      };
      const before =
        (
          await prisma.codefDailyUsage.findUnique({
            where: { day: todayDate() },
          })
        )?.calls ?? 0;
      await prisma.codefDailyUsage.upsert({
        where: { day: todayDate() },
        create: { day: todayDate(), calls: 97 },
        update: { calls: 97 },
      });
      const res = await fetchAs(seed, '준용').expect(503);
      expect(res.body.code).toBe('CARD_IMPORT_DAILY_LIMIT');
      await prisma.codefDailyUsage.update({
        where: { day: todayDate() },
        data: { calls: before },
      });
    });

    it('lists and withdraws the revocable consent (HF-58), keeping saved entries', async () => {
      const seed = await seedOngoing(['준용']);
      const userId = seed.members['준용'].userId;
      const empty = await request(server())
        .get('/api/consents/revocable')
        .set(as(seed, '준용'))
        .expect(200);
      expect(empty.body).toEqual([]);
      await consent(seed, '준용').expect(201);
      const listed = await request(server())
        .get('/api/consents/revocable')
        .set(as(seed, '준용'))
        .expect(200);
      expect(listed.body as RevocableConsent[]).toEqual([
        expect.objectContaining({
          consentId: 'CARD_IMPORT',
          title: '카드 승인내역 불러오기',
          version: '0.1-draft',
        }),
      ]);
      const stored = await prisma.userConsent.findFirstOrThrow({
        where: { userId, consentId: 'CARD_IMPORT' },
        select: { screen: true, method: true },
      });
      expect(stored).toEqual({ screen: 'HF-51', method: 'INDIVIDUAL' });
      const entry = await prisma.transaction.create({
        data: {
          userId,
          source: 'CARD_IMPORT',
          externalRef: 'f'.repeat(64),
          kind: 'APPROVAL',
          occurredAt: new Date(),
          merchantNameRaw: '저장된 결제',
          merchantKey: '저장된결제',
          originalAmount: 1000,
          originalCurrency: 'KRW',
        },
      });

      // 기능이 꺼져 있어도 철회는 된다
      flags.cardImportMode = 'off';
      await request(server())
        .post('/api/consents/CARD_IMPORT/withdraw')
        .set(as(seed, '준용'))
        .expect(204);
      await request(server())
        .post('/api/consents/CARD_IMPORT/withdraw')
        .set(as(seed, '준용'))
        .expect(204);
      await request(server())
        .post('/api/consents/TOS/withdraw')
        .set(as(seed, '준용'))
        .expect(404);
      const after = await request(server())
        .get('/api/consents/revocable')
        .set(as(seed, '준용'))
        .expect(200);
      expect(after.body).toEqual([]);
      const rows = await prisma.userConsent.findMany({
        where: { userId, consentId: 'CARD_IMPORT' },
        select: { withdrawnAt: true, withdrawChannel: true },
      });
      expect(rows).toEqual([
        { withdrawnAt: expect.any(Date), withdrawChannel: 'HF-58' },
      ]);
      expect(await prisma.transaction.count({ where: { id: entry.id } })).toBe(
        1,
      );

      // 다시 켜면 동의를 다시 받아야 조회할 수 있다
      flags.cardImportMode = 'on';
      await fetchAs(seed, '준용').expect(403);
      await consent(seed, '준용').expect(201);
      expect(
        await prisma.userConsent.count({
          where: { userId, consentId: 'CARD_IMPORT' },
        }),
      ).toBe(2);
    });

    it('rejects a stage/screen mismatch for consent submission', async () => {
      const seed = await seedOngoing(['준용']);
      await request(server())
        .post('/api/consents')
        .set(as(seed, '준용'))
        .send({
          stage: 'CARD_IMPORT',
          screen: 'WF-05',
          method: 'ALL',
          agreements: [
            { consentId: 'CARD_IMPORT', version: '0.1-draft', agreed: true },
          ],
        })
        .expect(400);
    });
  },
);
