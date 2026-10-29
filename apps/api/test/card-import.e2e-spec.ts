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
import {
  CONSENT_DOCUMENT_VERSIONS,
  currentConsentVersion,
} from './../src/common/auth/consent-catalog.js';
import { PrismaConsentChecker } from './../src/common/auth/consent-checker.js';
import { PrismaMembershipLookup } from './../src/common/auth/membership-lookup.js';
import { FeatureFlags } from './../src/common/features.js';
import { createLogger } from './../src/common/logging/logger.js';
import { PINO_LOGGER } from './../src/common/logging/logging.module.js';
import type { PrismaClient } from './../src/generated/prisma/client.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';
import { createTestAuth } from './auth-helpers.js';

/** 지금 받는 카드 내역 조회 동의 버전(정식 0.1 — 약관 0.2 판 게시일부터, 그 전에는 초안) */
const cardImportVersion = () =>
  currentConsentVersion('CARD_IMPORT', CONSENT_DOCUMENT_VERSIONS).version;
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
/** 현대·하나: Luhn이 맞는 테스트 카드번호(실제 카드 아님) · 카드 비밀번호 암호문(256바이트) */
const CARD_NUMBER = '5555555555554444';
const CARD_PASSWORD_CIPHERTEXT = randomBytes(256).toString('base64');
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
              CARD_NUMBER_LOGIN: 'true',
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
            {
              consentId: 'CARD_IMPORT',
              version: cardImportVersion(),
              agreed: true,
            },
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
      // 9곳(화면 순서). 현대·하나는 카드번호·카드 비밀번호(현대 4자리·하나 앞 2자리)가 더 필요하다(S8c)
      expect(
        body.organizations.map((o) => [
          o.code,
          o.requiresCardNo,
          o.cardPasswordDigits,
        ]),
      ).toEqual([
        ['0301', false, null],
        ['0302', true, 4],
        ['0303', false, null],
        ['0304', false, null],
        ['0305', false, null],
        ['0306', false, null],
        ['0309', false, null],
        ['0311', false, null],
        ['0313', true, 2],
      ]);

      const denied = await fetchAs(seed, '준용').expect(403);
      expect(denied.body.code).toBe('CONSENT_REQUIRED');
      expect(http.calls).toHaveLength(0);

      await consent(seed, '준용').expect(201);
      // 현대·하나에 카드 필드가 없거나, 다른 카드사에 카드 필드를 보내면 400(CODEF 호출 없음)
      for (const organization of ['0302', '0313']) {
        await fetchAs(seed, '준용', { organization }).expect(400);
      }
      await fetchAs(seed, '준용', {
        loginCardNo: CARD_NUMBER,
        encryptedCardPassword: CARD_PASSWORD_CIPHERTEXT,
      }).expect(400);
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
        status: 'NEW',
        cancelState: 'NONE',
        inTripId: seed.tripId,
        selectable: true,
        defaultSelected: true,
        alreadyImported: false,
      });
      expect(result.items[0]).not.toHaveProperty('cardLast4');
      expect(result.items[0]).not.toHaveProperty('cardName');
      expect(result.items[0]).not.toHaveProperty('estimatedKrwAmount');
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

    it('logs in to Hyundai·Hana with the card number and encrypted card password, leaving them nowhere but the CODEF request (S8c)', async () => {
      const seed = await seedOngoing(['준용']);
      const userId = seed.members['준용'].userId;
      await consent(seed, '준용').expect(201);
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
          codefResult('CF-00000', approvals()),
      };
      logOutput = '';
      const callsBefore = http.calls.length;
      const responses: unknown[] = [];
      for (const organization of ['0302', '0313']) {
        const res = await fetchAs(seed, '준용', {
          organization,
          loginCardNo: CARD_NUMBER,
          encryptedCardPassword: CARD_PASSWORD_CIPHERTEXT,
        }).expect(200);
        expect(res.body.status).toBe('OK');
        responses.push(res.body);
      }
      // CODEF로만 원문 카드번호·카드 비밀번호 암호문이 갔다(KR_CD_P_002 loginCardNo·cardPassword)
      const sent = http.calls.slice(callsBefore);
      expect(sent.map((c) => c.body.organization)).toEqual(['0302', '0313']);
      for (const call of sent) {
        expect(call.body).toMatchObject({
          loginType: '1',
          id: LOGIN_ID,
          password: PASSWORD_CIPHERTEXT,
          loginCardNo: CARD_NUMBER,
          cardPassword: CARD_PASSWORD_CIPHERTEXT,
        });
      }
      // 응답·로그·DB(접근 기록·실패 카운터·잠금·이어가기·지갑) 어디에도 없다
      const db = JSON.stringify(
        await Promise.all([
          prisma.accessLog.findMany({ where: { userId } }),
          prisma.cardImportLoginFailure.findMany({ where: { userId } }),
          prisma.cardImportLock.findMany({ where: { userId } }),
          prisma.cardImportTwoWaySession.findMany({ where: { userId } }),
          prisma.transaction.findMany({ where: { userId } }),
          prisma.codefPendingDeletion.findMany(),
        ]),
      );
      const everything = JSON.stringify(responses) + logOutput + db;
      for (const secret of [
        CARD_NUMBER,
        CARD_NUMBER.slice(0, 8),
        CARD_PASSWORD_CIPHERTEXT,
        LOGIN_ID,
      ]) {
        expect(everything).not.toContain(secret);
      }
      expect(logOutput).toContain('/api/card-import/fetch');
    });

    it('rejects malformed card numbers without echoing them and maps CODEF card errors (S8c)', async () => {
      const seed = await seedOngoing(['준용']);
      await consent(seed, '준용').expect(201);
      logOutput = '';
      const callsBefore = http.calls.length;
      // 형식 오류(Luhn·자리수·구분자·문자)는 CODEF에 가지 않는다
      const malformed = [
        '5555555555554445',
        '4242424242426',
        '5555-5555-5555-4444',
        `${CARD_NUMBER}x`,
      ];
      const bodies: unknown[] = [];
      for (const loginCardNo of malformed) {
        const res = await fetchAs(seed, '준용', {
          organization: '0302',
          loginCardNo,
          encryptedCardPassword: CARD_PASSWORD_CIPHERTEXT,
        }).expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        bodies.push(res.body);
      }
      expect(http.calls.length).toBe(callsBefore);

      // CODEF 카드번호 오류 → CARD_NUMBER_INVALID(잠김 위험 1회)
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-13103', {}),
      };
      const cardNo = await fetchAs(seed, '준용', {
        organization: '0313',
        loginCardNo: CARD_NUMBER,
        encryptedCardPassword: CARD_PASSWORD_CIPHERTEXT,
      }).expect(400);
      expect(cardNo.body).toMatchObject({
        code: 'CARD_NUMBER_INVALID',
        message: '카드번호를 다시 확인해 주세요',
        details: { failedAttempts: 1 },
      });
      // CODEF 카드 비밀번호 횟수 초과 → 카드사에서 풀어야 함(다른 카드사라 잠김 위험 확인 없음)
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-13122', {}),
      };
      const exceeded = await fetchAs(seed, '준용', {
        organization: '0302',
        loginCardNo: CARD_NUMBER,
        encryptedCardPassword: CARD_PASSWORD_CIPHERTEXT,
      }).expect(409);
      expect(exceeded.body.code).toBe('CARD_ACCOUNT_ACTION_REQUIRED');

      const everything =
        JSON.stringify([bodies, cardNo.body, exceeded.body]) + logOutput;
      for (const secret of [
        ...malformed,
        CARD_NUMBER,
        CARD_PASSWORD_CIPHERTEXT,
        LOGIN_ID,
      ]) {
        expect(everything).not.toContain(secret);
      }
    });

    it('guards Hyundai·Hana against account lock: confirm at 1, lock at 2 until success, released only by success or the 7-day purge (S8c review 1·N1·N2)', async () => {
      const seed = await seedOngoing(['민지', '서연', '하늘']);
      const minji = seed.members['민지'].userId;
      const seoyeon = seed.members['서연'].userId;
      const haneul = seed.members['하늘'].userId;
      for (const name of ['민지', '서연', '하늘']) {
        await consent(seed, name).expect(201);
      }
      const hyundai = (over: object = {}) => ({
        organization: '0302',
        loginCardNo: CARD_NUMBER,
        encryptedCardPassword: CARD_PASSWORD_CIPHERTEXT,
        ...over,
      });
      const lockRow = (userId: string) =>
        prisma.cardImportLoginFailure.findUnique({
          where: { userId_organization: { userId, organization: '0302' } },
        });
      const shiftLastFailure = (userId: string, minutes: number) =>
        prisma.cardImportLoginFailure.update({
          where: { userId_organization: { userId, organization: '0302' } },
          data: {
            lockRiskLastFailedAt: new Date(Date.now() - minutes * 60_000),
            lastFailedAt: new Date(Date.now() - minutes * 60_000),
          },
        });
      const ok = () => ({
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
          codefResult('CF-00000', approvals()),
      });

      // 1회 실패(카드 비밀번호) → 다음 시도는 확인이 있어야 한다(없으면 409, CODEF 호출 없음)
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-13121', {}),
      };
      const first = await fetchAs(seed, '민지', hyundai()).expect(400);
      expect(first.body).toMatchObject({
        code: 'CARD_PASSWORD_INVALID',
        message: '카드 비밀번호를 다시 확인해 주세요',
        details: { failedAttempts: 1 },
      });
      let calls = http.calls.length;
      const confirm = await fetchAs(seed, '민지', hyundai()).expect(409);
      expect(confirm.body).toMatchObject({
        code: 'CARD_LOCK_RISK_CONFIRM_REQUIRED',
        details: { failedAttempts: 1 },
      });
      expect(http.calls.length).toBe(calls);
      // 확인하고 보냈는데 또 틀림 → 2회째부터 성공할 때까지 잠금(시간 제한·retryAfter 없음)
      const second = await fetchAs(
        seed,
        '민지',
        hyundai({ acknowledgeLockRisk: true }),
      ).expect(429);
      expect(second.body).toMatchObject({
        code: 'CARD_IMPORT_LOGIN_LOCKED',
        details: { failedAttempts: 2, action: 'CHECK_CARD_COMPANY_SITE' },
      });
      expect(second.body.details).not.toHaveProperty('retryAfter');
      // "확인했어요"(lockout/ack)는 마지막 실패 30분 뒤부터 받는다
      expect(
        Date.parse(second.body.details.ackAvailableAt) - Date.now(),
      ).toBeGreaterThan(29 * 60_000);
      const early = await request(server())
        .post('/api/card-import/lockout/ack')
        .set(as(seed, '민지'))
        .send({ organization: '0302' })
        .expect(429);
      expect(early.body.code).toBe('CARD_LOCKOUT_ACK_TOO_EARLY');
      expect(Date.parse(early.body.details.retryAfter)).toBe(
        Date.parse(second.body.details.ackAvailableAt),
      );
      expect(early.body.details.retryAfterSec).toBeGreaterThan(1700);
      expect(second.headers['retry-after']).toBeUndefined();
      expect(await lockRow(minji)).toMatchObject({
        lockRiskFailures: 2,
        failures: 0,
      });
      // 확인 값·시간(30분·25시간 뒤)과 무관하게 계속 잠겨 있고 CODEF를 부르지 않는다
      routes = ok();
      calls = http.calls.length;
      for (const minutes of [0, 31, 25 * 60]) {
        if (minutes > 0) await shiftLastFailure(minji, minutes);
        for (const over of [{}, { acknowledgeLockRisk: true }]) {
          const locked = await fetchAs(seed, '민지', hyundai(over)).expect(429);
          expect(locked.body.code).toBe('CARD_IMPORT_LOGIN_LOCKED');
        }
      }
      expect(http.calls.length).toBe(calls);
      // 마지막 실패 뒤 7일이 지나면 파기 배치가 행을 지운다 = 풀린다(그 사이 카드사에서 직접 확인했다고 본다)
      await shiftLastFailure(minji, 7 * 24 * 60 + 1);
      await app.get(PurgeService).run();
      expect(await lockRow(minji)).toBeNull();
      await fetchAs(seed, '민지', hyundai()).expect(200);

      // 일반 로그인 실패(CF-12803)도 센다. 1회 뒤 확인하고 성공하면 카운터가 0이 된다(시간으로는 리셋하지 않는다)
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-12803', {}),
      };
      const login = await fetchAs(seed, '서연', hyundai()).expect(400);
      expect(login.body).toMatchObject({
        code: 'CARD_LOGIN_FAILED',
        details: { failedAttempts: 1 },
      });
      await shiftLastFailure(seoyeon, 25 * 60);
      expect(
        (await fetchAs(seed, '서연', hyundai()).expect(409)).body.code,
      ).toBe('CARD_LOCK_RISK_CONFIRM_REQUIRED');
      routes = ok();
      await fetchAs(
        seed,
        '서연',
        hyundai({ acknowledgeLockRisk: true }),
      ).expect(200);
      expect(await lockRow(seoyeon)).toBeNull();
      await fetchAs(seed, '서연', hyundai()).expect(200);

      // 미입력 계열(CF-13100)은 세지 않는다. 매핑 밖 코드(502)는 현대·하나에 한해 센다
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-13100', {}),
      };
      const missing = await fetchAs(seed, '하늘', hyundai()).expect(502);
      expect(missing.body.code).toBe('CARD_IMPORT_FAILED');
      expect(await lockRow(haneul)).toBeNull();
      routes = {
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-12999', {}),
      };
      const unknown = await fetchAs(seed, '하늘', hyundai()).expect(502);
      expect(unknown.body).toMatchObject({
        code: 'CARD_IMPORT_FAILED',
        details: { failedAttempts: 1 },
      });
      expect(await lockRow(haneul)).toMatchObject({ lockRiskFailures: 1 });
      expect(
        (await fetchAs(seed, '하늘', hyundai()).expect(409)).body.code,
      ).toBe('CARD_LOCK_RISK_CONFIRM_REQUIRED');
    });

    it('releases a Hyundai·Hana lock when the user confirms on the card company site: 30 min after, 2 per KST day, access log only (S8c lockout ack)', async () => {
      const seed = await seedOngoing(['지우', '도윤']);
      const jiwoo = seed.members['지우'].userId;
      await consent(seed, '지우').expect(201);
      const ack = (
        name: string,
        organization = '0302',
        headers?: Record<string, string>,
      ) =>
        request(server())
          .post('/api/card-import/lockout/ack')
          .set(headers ?? as(seed, name))
          .send({ organization });
      const lockAgo = (minutes: number) =>
        prisma.cardImportLoginFailure.upsert({
          where: {
            userId_organization: { userId: jiwoo, organization: '0302' },
          },
          create: {
            userId: jiwoo,
            organization: '0302',
            failures: 0,
            lastFailedAt: new Date(Date.now() - minutes * 60_000),
            lockRiskFailures: 2,
            lockRiskLastFailedAt: new Date(Date.now() - minutes * 60_000),
          },
          update: {
            lockRiskFailures: 2,
            lockRiskLastFailedAt: new Date(Date.now() - minutes * 60_000),
          },
        });
      const counter = async () =>
        (
          await prisma.cardImportLoginFailure.findUnique({
            where: {
              userId_organization: { userId: jiwoo, organization: '0302' },
            },
          })
        )?.lockRiskFailures;

      // 가드: CSRF · 동의 · 현대·하나만
      const { Origin: _origin, ...noOrigin } = as(seed, '지우');
      expect((await ack('지우', '0302', noOrigin).expect(403)).body.code).toBe(
        'CSRF_REJECTED',
      );
      expect((await ack('도윤').expect(403)).body.code).toBe(
        'CONSENT_REQUIRED',
      );
      expect((await ack('지우', '0306').expect(400)).body.code).toBe(
        'VALIDATION_FAILED',
      );
      // 잠겨 있지 않으면 필요 없음(409)
      expect((await ack('지우').expect(409)).body.code).toBe(
        'CARD_LOCKOUT_ACK_NOT_NEEDED',
      );

      // 잠김(2회) + 30분 지남 → 204, 카운터 0, 접근 기록은 기관 코드만
      await lockAgo(31);
      const locked = await fetchAs(seed, '지우', {
        organization: '0302',
        loginCardNo: CARD_NUMBER,
        encryptedCardPassword: CARD_PASSWORD_CIPHERTEXT,
      }).expect(429);
      expect(locked.body.code).toBe('CARD_IMPORT_LOGIN_LOCKED');
      expect(Date.parse(locked.body.details.ackAvailableAt)).toBeLessThan(
        Date.now(),
      );
      await ack('지우').expect(204);
      expect(await counter()).toBe(0);
      const logs = await prisma.accessLog.findMany({
        where: { userId: jiwoo, action: 'CARD_LOCKOUT_ACK' },
        select: { details: true, resourceType: true, resourceId: true },
      });
      expect(logs).toEqual([
        {
          details: { organization: '0302' },
          resourceType: 'USER',
          resourceId: jiwoo,
        },
      ]);
      expect((await ack('지우').expect(409)).body.code).toBe(
        'CARD_LOCKOUT_ACK_NOT_NEEDED',
      );

      // 하루(KST) 2회까지: 두 번째는 되고 세 번째는 429(다음 KST 자정까지)
      await lockAgo(40);
      await ack('지우').expect(204);
      await lockAgo(50);
      const limited = await ack('지우').expect(429);
      expect(limited.body.code).toBe('CARD_LOCKOUT_ACK_DAILY_LIMIT');
      expect(limited.body.details.retryAfter).toMatch(/T15:00:00\.000Z$/);
      expect(Number(limited.headers['retry-after'])).toBe(
        limited.body.details.retryAfterSec,
      );
      expect(await counter()).toBe(2);
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
      // 일반 카드사는 잠김 위험 카운터를 쓰지 않는다. 행에는 카운터·시각뿐(로그인 정보 없음)
      expect(failureRow).toMatchObject({
        organization: '0306',
        failures: 3,
        lockRiskFailures: 0,
        lockRiskLastFailedAt: null,
      });
      expect(Object.keys(failureRow ?? {}).sort()).toEqual(
        [
          'failures',
          'lastFailedAt',
          'lockRiskFailures',
          'lockRiskLastFailedAt',
          'organization',
          'userId',
        ].sort(),
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

    it('refunds the remaining reservation when purging abandoned 2-way rows (review Low 1)', async () => {
      const seed = await seedOngoing(['준용']);
      const userId = seed.members['준용'].userId;
      const day = todayDate();
      const before =
        (await prisma.codefDailyUsage.findUnique({ where: { day } }))?.calls ??
        0;
      await prisma.codefDailyUsage.upsert({
        where: { day },
        create: { day, calls: 10 },
        update: { calls: 10 },
      });
      const expired = new Date(Date.now() - 1000);
      await prisma.cardImportTwoWaySession.createMany({
        data: [
          {
            nonceHash: 'a'.repeat(64),
            userId,
            callsLeft: 3,
            budgetDay: day,
            expiresAt: expired,
          },
          {
            nonceHash: 'b'.repeat(64),
            userId,
            callsLeft: 3,
            budgetDay: day,
            expiresAt: expired,
          },
        ],
      });
      await app.get(PurgeService).run();
      expect(
        await prisma.cardImportTwoWaySession.count({ where: { userId } }),
      ).toBe(0);
      // 남은 예약 3 + 3을 그날 예산에 돌려줬다
      expect(
        (await prisma.codefDailyUsage.findUnique({ where: { day } }))?.calls,
      ).toBe(4);
      // 0 아래로는 내려가지 않는다
      await prisma.codefDailyUsage.update({
        where: { day },
        data: { calls: 1 },
      });
      await prisma.cardImportTwoWaySession.create({
        data: {
          nonceHash: 'c'.repeat(64),
          userId,
          callsLeft: 3,
          budgetDay: day,
          expiresAt: expired,
        },
      });
      await app.get(PurgeService).run();
      expect(
        (await prisma.codefDailyUsage.findUnique({ where: { day } }))?.calls,
      ).toBe(0);
      await prisma.codefDailyUsage.update({
        where: { day },
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
          version: cardImportVersion(),
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
            {
              consentId: 'CARD_IMPORT',
              version: cardImportVersion(),
              agreed: true,
            },
          ],
        })
        .expect(400);
    });
  },
);
