import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  FILE_IMPORT_DAILY_MAX,
  type FileImportCheckResponse,
  type FileImportItem,
  type FileImportProvider,
  type FileImportResponse,
  type WalletEntryListResponse,
} from '@yeojeong/shared';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import {
  ConsentChecker,
  MembershipLookup,
  SessionResolver,
} from './../src/common/auth/index.js';
import { PrismaMembershipLookup } from './../src/common/auth/membership-lookup.js';
import { FeatureFlags } from './../src/common/features.js';
import { createLogger } from './../src/common/logging/logger.js';
import { PINO_LOGGER } from './../src/common/logging/logging.module.js';
import { Prisma, type PrismaClient } from './../src/generated/prisma/client.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';
import { createTestAuth } from './auth-helpers.js';
import {
  createFixturePrisma,
  ExpenseFixtures,
  reachableDatabaseUrl,
  type SeedTrip,
} from './expenses-fixtures.js';

// 거래 내역 파일 가져오기(W10 위챗페이 · W11 알리페이) 실제 DB e2e.
// 증명: 플래그 off면 404 · 고른 결제 저장 + 여정 자동 연결 · 다시 보내면 건너뜀(행 1개) · DB에 거래 다이제스트가 없다(importKey = HMAC) ·
//       응답·로그에 다이제스트·가맹점·금액이 없다 · 계약 밖 필드 400 · S7 입력 규칙 400(값을 되돌리지 않음) · 확인 API(추가됨·여정) ·
//       사용자당 호출 제한(1분 5회) · 사용자당 하루 2,000건 · 한 요청은 전부 저장되거나 하나도 저장되지 않는다.
// 날짜는 오늘(KST) 기준 상대값(여정 ±3일, 결제 −1일)이라 어느 날 돌려도 같다.
const databaseUrl = await reachableDatabaseUrl();

const DAY_MS = 86_400_000;
const kstDay = (offsetDays: number) =>
  new Date(Date.now() + 9 * 3_600_000 + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
const RATE_SOURCE = 'W10 e2e 매매기준율';
/** 브라우저와 같은 다이제스트: SHA-256("WECHAT:{거래 번호}") */
const digestOf = (txnNo: string, provider: FileImportProvider = 'WECHAT') =>
  createHash('sha256').update(`${provider}:${txnNo}`, 'utf8').digest('hex');
const TXN_A = '4200009988202610290000000001';
const TXN_B = '4200009988202610290000000002';
const MERCHANT = 'e2e瑞幸咖啡zq7';
const AMOUNT = '6173.29';

describe.skipIf(!databaseUrl)('File import (W10 e2e, real DB)', () => {
  let prisma: PrismaClient;
  let fx: ExpenseFixtures;
  let app: NestExpressApplication;
  let auth: ReturnType<typeof createTestAuth>;
  let logOutput = '';
  // FeatureFlags 가짜(FeatureAccess는 진짜 — allowlist면 실제 feature_grants 행을 읽는다)
  const flags = {
    accountLink: false,
    cardImportMode: 'off' as const,
    fileImportMode: 'on' as 'off' | 'allowlist' | 'on',
    /** FILE_IMPORT_PROVIDERS(W11). fileImportMode가 off면 실제 FeatureFlags처럼 빈 목록으로 본다 */
    providers: ['WECHAT'] as FileImportProvider[],
    cardImportFor: () => false,
    get fileImportProviders(): FileImportProvider[] {
      return this.fileImportMode === 'off' ? [] : this.providers;
    },
  };

  beforeAll(async () => {
    prisma = createFixturePrisma(databaseUrl as string);
    fx = new ExpenseFixtures(prisma);
    auth = createTestAuth();
    // 운영처럼(요청 로그 포함) 모든 로그를 모은다
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
      .useValue(auth.consents)
      .overrideProvider(MembershipLookup)
      .useValue(new PrismaMembershipLookup(prisma as unknown as PrismaService))
      .overrideProvider(FeatureFlags)
      .useValue(flags)
      .overrideProvider(PINO_LOGGER)
      .useValue(logger)
      .compile();
    app =
      moduleFixture.createNestApplication<NestExpressApplication>(APP_OPTIONS);
    setupApp(app);
    await app.init();
    // 1위안 = 190.50원. 가장 최근 고시가 되도록 지금 직전 시각으로 둔다
    await prisma.exchangeRate.create({
      data: {
        quoteCurrency: 'CNY',
        rate: new Prisma.Decimal('190.5'),
        displayUnit: 1,
        source: RATE_SOURCE,
        effectiveAt: new Date(Date.now() - 400 * DAY_MS),
      },
    });
  });

  afterAll(async () => {
    await fx?.cleanup();
    await prisma?.exchangeRate.deleteMany({ where: { source: RATE_SOURCE } });
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(() => {
    flags.fileImportMode = 'on';
    flags.providers = ['WECHAT'];
  });

  const server = () => app.getHttpServer();
  const as = (seed: SeedTrip, name: string) =>
    auth.headers({
      id: seed.members[name].userId,
      nickname: name,
      profileImageUrl: null,
    });
  /** 진행 중(3일 전 ~ 3일 뒤) 위안 여정 */
  const seedOngoing = (names = ['준용', '민지']) =>
    fx.seedTrip(names, {
      period: { start: kstDay(-3), end: kstDay(3) },
      currency: 'CNY',
      withPaymentMethod: false,
    });
  /** 위챗 파일 시각(중국 표준시) → +08:00 */
  const cst = (day: string, time = '12:34:56') => `${day}T${time}+08:00`;
  const item = (over: Partial<FileImportItem> = {}): FileImportItem => ({
    txnDigest: digestOf(TXN_A),
    occurredAt: cst(kstDay(-1)),
    amount: AMOUNT,
    currency: 'CNY',
    merchantName: MERCHANT,
    ...over,
  });
  const importAs = (seed: SeedTrip, name: string, body: object) =>
    request(server())
      .post('/api/wallet/entries/file-import')
      .set(as(seed, name))
      .send(body);
  const checkAs = (seed: SeedTrip, name: string, body: object) =>
    request(server())
      .post('/api/wallet/entries/file-import/check')
      .set(as(seed, name))
      .send(body);
  const fileRows = (userId: string) =>
    prisma.$queryRaw<{ id: string; row: string }[]>`
      SELECT t.id, row_to_json(t)::text AS row FROM transactions t
      WHERE t.user_id = ${userId}::uuid AND t.source = 'FILE_IMPORT'`;

  it('hides both routes with 404 while the flag is off, and reports the flag in the session', async () => {
    const seed = await seedOngoing();
    flags.fileImportMode = 'off';
    await importAs(seed, '준용', {
      provider: 'WECHAT',
      items: [item()],
    }).expect(404);
    await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A)],
    }).expect(404);
    expect(await fileRows(seed.members['준용'].userId)).toHaveLength(0);
    const session = await request(server())
      .get('/api/auth/session')
      .set(as(seed, '준용'))
      .expect(200);
    expect(session.body.features).toMatchObject({ fileImport: false });
    flags.fileImportMode = 'on';
    const on = await request(server())
      .get('/api/auth/session')
      .set(as(seed, '준용'))
      .expect(200);
    expect(on.body.features).toMatchObject({ fileImport: true });
  });

  it('saves picked payments, auto-links in-period ones, skips resends, and never stores or logs the digest', async () => {
    const seed = await seedOngoing();
    const userId = seed.members['준용'].userId;
    logOutput = '';

    const before = await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A), digestOf(TXN_B)],
    }).expect(200);
    expect(before.body as FileImportCheckResponse).toEqual({
      imported: [false, false],
    });

    const body = {
      provider: 'WECHAT',
      items: [
        item(),
        item({
          txnDigest: digestOf(TXN_B),
          occurredAt: cst(kstDay(-30), '09:00:00'),
          amount: '12.5',
          merchantName: '  美团  外卖 ',
        }),
      ],
    };
    const res = await importAs(seed, '준용', body).expect(201);
    const saved = res.body as FileImportResponse;
    expect(saved).toMatchObject({ created: 2, skipped: 0, linked: 1 });
    expect(Object.keys(saved).sort()).toEqual(
      ['created', 'items', 'linked', 'skipped'].sort(),
    );
    expect(saved.items.every((i) => Object.keys(i).length === 2)).toBe(true);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(digestOf(TXN_A));
    expect(text).not.toContain(TXN_A);

    // DB: source FILE_IMPORT, externalRef = HMAC(≠ 다이제스트), 행 어디에도 다이제스트·거래 번호가 없다
    const rows = await fileRows(userId);
    expect(rows).toHaveLength(2);
    for (const { row } of rows) {
      expect(row).not.toContain(digestOf(TXN_A));
      expect(row).not.toContain(digestOf(TXN_B));
      expect(row).not.toContain(TXN_A);
      expect(row).not.toContain(TXN_B);
    }
    const first = await prisma.transaction.findUniqueOrThrow({
      where: { id: saved.items[0].entryId },
    });
    expect(first).toMatchObject({
      source: 'FILE_IMPORT',
      importProvider: 'WECHAT',
      kind: 'APPROVAL',
      paymentMethodId: null,
      rawPayloadEnc: null,
      originalCurrency: 'CNY',
      merchantNameRaw: MERCHANT,
      clientRequestId: null,
    });
    expect(first.externalRef).toMatch(/^[0-9a-f]{64}$/);
    expect(first.externalRef).not.toBe(digestOf(TXN_A));
    expect(first.originalAmount.toString()).toBe(AMOUNT);
    // 위챗 시각(+08:00) 12:34:56 = KST 13:34:56
    expect(first.occurredAt.toISOString()).toBe(
      new Date(cst(kstDay(-1))).toISOString(),
    );
    const second = await prisma.transaction.findUniqueOrThrow({
      where: { id: saved.items[1].entryId },
    });
    expect(second.merchantNameRaw).toBe('美团 外卖');

    // 여정 연결: 기간 안 결제만 미확정으로
    const links = await prisma.expense.findMany({
      where: { transactionId: { in: saved.items.map((i) => i.entryId) } },
      select: { transactionId: true, tripId: true, status: true },
    });
    expect(links).toEqual([
      {
        transactionId: saved.items[0].entryId,
        tripId: seed.tripId,
        status: 'PENDING',
      },
    ]);

    // 지갑 목록: 직접 입력처럼 고치고 지울 수 있다(source FILE_IMPORT)
    const list = (
      await request(server())
        .get('/api/wallet/entries')
        .set(as(seed, '준용'))
        .expect(200)
    ).body as WalletEntryListResponse;
    const entry = list.items.find((e) => e.id === saved.items[0].entryId);
    expect(entry).toMatchObject({
      source: 'FILE_IMPORT',
      merchantName: MERCHANT,
      currency: 'CNY',
      canDelete: true,
      paymentMethodLabel: null,
    });
    expect(entry?.linkedTrip?.tripId).toBe(seed.tripId);

    // 다시 보내도 새로 만들지 않는다
    const again = await importAs(seed, '준용', body).expect(201);
    expect(again.body).toMatchObject({ created: 0, skipped: 2, linked: 0 });
    expect(
      (again.body as FileImportResponse).items.map((i) => i.entryId),
    ).toEqual(saved.items.map((i) => i.entryId));
    expect(await fileRows(userId)).toHaveLength(2);

    // 확인: 저장한 것은 "추가됨"
    const accessBefore = await prisma.accessLog.count({ where: { userId } });
    const after = await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A), digestOf('4200009988202610290000000003')],
    }).expect(200);
    // 확인은 대조만 한다: 접근 기록·행이 늘지 않는다
    expect(await prisma.accessLog.count({ where: { userId } })).toBe(
      accessBefore,
    );
    expect(after.body).toEqual({
      imported: [true, false],
    });
    // 같은 거래도 다른 사용자에게는 새 거래(사용자 범위 importKey)
    // 대조는 요청한 회원 본인의 FILE_IMPORT 항목과만(importKey에 사용자 ID가 들어간다 — 처리방침 0.3):
    // 민지에게 준용이 저장한 거래는 "추가됨"이 아니고, 민지가 같은 거래를 저장해도 준용의 답은 바뀌지 않는다
    const other = await checkAs(seed, '민지', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A)],
    }).expect(200);
    expect(other.body.imported).toEqual([false]);
    const TXN_C = '4200009988202610290000000003';
    await importAs(seed, '민지', {
      provider: 'WECHAT',
      items: [item({ txnDigest: digestOf(TXN_C) })],
    }).expect(201);
    const minji = await checkAs(seed, '민지', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A), digestOf(TXN_C)],
    }).expect(200);
    expect(minji.body.imported).toEqual([false, true]);
    const mine = await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A), digestOf(TXN_C)],
    }).expect(200);
    expect(mine.body.imported).toEqual([true, false]);
    // 같은 거래라도 사용자마다 저장값(importKey)이 다르다
    const [mineRow] = await prisma.transaction.findMany({
      where: { userId, source: 'FILE_IMPORT', externalRef: { not: null } },
      select: { externalRef: true },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });
    const minjiRows = await prisma.transaction.findMany({
      where: { userId: seed.members['민지'].userId, source: 'FILE_IMPORT' },
      select: { externalRef: true },
    });
    expect(minjiRows.map((r) => r.externalRef)).not.toContain(
      mineRow.externalRef,
    );

    // 접근 기록: 공급자·건수만
    const logs = await prisma.accessLog.findMany({
      where: { userId, action: 'IMPORT_FILE_ENTRIES' },
      select: { details: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.details)).toEqual([
      {
        provider: 'WECHAT',
        requested: 2,
        created: 2,
        linked: 1,
        outcome: 'OK',
      },
      {
        provider: 'WECHAT',
        requested: 2,
        created: 0,
        linked: 0,
        outcome: 'OK',
      },
    ]);

    // 로그: 요청은 남지만 다이제스트·거래 번호·가맹점·금액은 없다
    expect(logOutput).toContain('/api/wallet/entries/file-import');
    for (const secret of [
      digestOf(TXN_A),
      digestOf(TXN_B),
      TXN_A,
      MERCHANT,
      '美团',
      AMOUNT,
    ]) {
      expect(logOutput).not.toContain(secret);
    }
  });

  it('rejects fields outside the contract (product, payment method, raw txn number …) with 400 and stores nothing', async () => {
    const seed = await seedOngoing();
    const userId = seed.members['준용'].userId;
    for (const extra of [
      { product: '拿铁' },
      { txnNo: TXN_A },
      { paymentMethod: '零钱' },
      { merchantOrderNo: 'M123' },
      { note: '/' },
    ]) {
      const res = await importAs(seed, '준용', {
        provider: 'WECHAT',
        items: [{ ...item(), ...extra }],
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body)).not.toContain(TXN_A);
    }
    // 사용자당 1분 5회라 여섯 번째 요청은 다른 멤버로 보낸다
    await importAs(seed, '민지', {
      provider: 'WECHAT',
      items: [item()],
      clientRequestId: '0b8a6b4e-5d7c-4f2e-9a3b-111111111111',
    }).expect(400);
    // 확인은 대조값 배열만: 일시·금액·가맹점(예전 items 모양)을 실으면 400
    for (const extra of [
      { items: [{ txnDigest: digestOf(TXN_A), occurredAt: cst(kstDay(-1)) }] },
      { occurredAt: [cst(kstDay(-1))] },
      { merchantNames: [MERCHANT] },
    ]) {
      const res = await checkAs(seed, '준용', {
        provider: 'WECHAT',
        txnDigests: [digestOf(TXN_A)],
        ...extra,
      }).expect(400);
      expect(JSON.stringify(res.body)).not.toContain(MERCHANT);
    }
    await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [TXN_A],
    }).expect(400);
    expect(await fileRows(userId)).toHaveLength(0);
  });

  it('validates with the S7 rules and limits without echoing values', async () => {
    const seed = await seedOngoing();
    const userId = seed.members['준용'].userId;
    const longName = '很长的商户名称'.repeat(6); // 42자
    const res = await importAs(seed, '준용', {
      provider: 'WECHAT',
      items: [
        item({ amount: '1.234' }),
        item({ txnDigest: digestOf('x1'), merchantName: longName }),
        item({ txnDigest: digestOf('x2'), occurredAt: cst(kstDay(30)) }),
        item({ txnDigest: digestOf('x3'), occurredAt: cst(kstDay(-400)) }),
        item({ txnDigest: digestOf('x4'), amount: '0' }),
        item({ txnDigest: digestOf('x5') }),
        item({ txnDigest: digestOf('x5') }),
      ],
    }).expect(400);
    const fields = (res.body.details.fields as { path: string; code: string }[])
      .map((f) => f.path)
      .sort();
    expect(fields).toEqual(
      [
        'items.0.amount',
        'items.1.merchantName',
        'items.2.occurredAt',
        'items.3.occurredAt',
        'items.4.amount',
        'items.6.txnDigest',
      ].sort(),
    );
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(longName);
    expect(text).not.toContain(digestOf('x5'));

    // DTO 단계: 다이제스트 형식 · 오프셋 없는 시각 · 통화 · 공급자 · 건수
    const dto = await importAs(seed, '준용', {
      provider: 'WECHAT',
      items: [
        item({ txnDigest: TXN_A }),
        item({
          txnDigest: digestOf('y1'),
          occurredAt: `${kstDay(-1)}T12:00:00`,
        }),
        item({ txnDigest: digestOf('y2'), currency: 'KRW', amount: '1000' }),
      ],
    }).expect(400);
    expect(
      (dto.body.details.fields as { path: string }[]).map((f) => f.path),
    ).toEqual(
      expect.arrayContaining([
        'items.0.txnDigest',
        'items.1.occurredAt',
        'items.2.currency',
      ]),
    );
    expect(JSON.stringify(dto.body)).not.toContain(TXN_A);
    // 모르는 공급자는 400(켜지지 않은 알리페이는 404 — W11 테스트)
    await importAs(seed, '준용', {
      provider: 'PAYPAL',
      items: [item()],
    }).expect(400);
    await importAs(seed, '준용', { provider: 'WECHAT', items: [] }).expect(400);
    const many = Array.from({ length: 201 }, (_, i) =>
      item({ txnDigest: digestOf(`m${i}`) }),
    );
    const tooMany = await importAs(seed, '준용', {
      provider: 'WECHAT',
      items: many,
    }).expect(400);
    expect(tooMany.body.details.fields).toEqual([
      expect.objectContaining({ path: 'items', code: 'arrayMaxSize' }),
    ]);
    const checkMany = Array.from({ length: 501 }, (_, i) => digestOf(`c${i}`));
    await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: checkMany,
    }).expect(400);
    expect(await fileRows(userId)).toHaveLength(0);
  });

  it('rate-limits saving per user: 5 per minute → 429 FILE_IMPORT_RATE_LIMITED + Retry-After, other users unaffected', async () => {
    const seed = await seedOngoing(['하늘', '바다']);
    for (let i = 0; i < 5; i++) {
      // 검증에 걸리는 요청도 센다(가드가 본문 검사보다 먼저)
      await importAs(seed, '하늘', { provider: 'WECHAT', items: [] }).expect(
        400,
      );
    }
    const limited = await importAs(seed, '하늘', {
      provider: 'WECHAT',
      items: [item()],
    }).expect(429);
    expect(limited.body.code).toBe('FILE_IMPORT_RATE_LIMITED');
    expect(limited.body.details.retryAfterSec).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(await fileRows(seed.members['하늘'].userId)).toHaveLength(0);
    // 다른 사용자(같은 IP)는 그대로
    await importAs(seed, '바다', {
      provider: 'WECHAT',
      items: [item({ occurredAt: cst(kstDay(-30)) })],
    }).expect(201);
  });

  it('caps new FILE_IMPORT rows per user per KST day (2,000): whole request refused with retryAfter, resends of saved ones still pass', async () => {
    const seed = await seedOngoing(['구름']);
    const userId = seed.members['구름'].userId;
    await prisma.transaction.createMany({
      data: Array.from({ length: FILE_IMPORT_DAILY_MAX - 1 }, (_, i) => ({
        userId,
        source: 'FILE_IMPORT' as const,
        importProvider: 'WECHAT' as const,
        externalRef: `seed-${String(i).padStart(6, '0')}`,
        kind: 'APPROVAL' as const,
        occurredAt: new Date(Date.now() - 40 * DAY_MS),
        merchantNameRaw: 'seed',
        merchantKey: 'SEED',
        originalAmount: new Prisma.Decimal('1'),
        originalCurrency: 'CNY',
      })),
    });
    const old = cst(kstDay(-30));
    const two = await importAs(seed, '구름', {
      provider: 'WECHAT',
      items: [
        item({ occurredAt: old }),
        item({ txnDigest: digestOf(TXN_B), occurredAt: old }),
      ],
    }).expect(429);
    expect(two.body.code).toBe('FILE_IMPORT_DAILY_LIMIT');
    // 다음 KST 자정
    const midnight = Date.parse(`${kstDay(1)}T00:00:00+09:00`);
    expect(Date.parse(two.body.details.retryAfter)).toBe(midnight);
    expect(Number(two.headers['retry-after'])).toBeGreaterThan(0);
    expect(await fileRows(userId)).toHaveLength(FILE_IMPORT_DAILY_MAX - 1);
    // 한 건은 들어가고(2,000건째), 같은 건을 다시 보내면 새로 만들지 않아 상한에 걸리지 않는다
    await importAs(seed, '구름', {
      provider: 'WECHAT',
      items: [item({ occurredAt: old })],
    }).expect(201);
    const again = await importAs(seed, '구름', {
      provider: 'WECHAT',
      items: [item({ occurredAt: old })],
    }).expect(201);
    expect(again.body).toMatchObject({ created: 0, skipped: 1 });
    expect(await fileRows(userId)).toHaveLength(FILE_IMPORT_DAILY_MAX);
  });

  it('saves all-or-nothing: a later item over the ₩100,000,000 cap (spot estimate) rolls back the earlier ones; trip and wallet-only items keep request order', async () => {
    const seed = await seedOngoing();
    const userId = seed.members['준용'].userId;
    const old = cst(kstDay(-30));
    // 600,000위안 × 190.5 = ₩114,300,000 > 1억(지갑에만 들어가는 건 — 매매기준율 추정)
    const res = await importAs(seed, '준용', {
      provider: 'WECHAT',
      items: [
        item({ occurredAt: old }),
        item({
          txnDigest: digestOf(TXN_B),
          occurredAt: old,
          amount: '600000.00',
        }),
      ],
    }).expect(400);
    expect(res.body.details.fields).toEqual([
      expect.objectContaining({ path: 'items.1.amount', code: 'max' }),
    ]);
    expect(await fileRows(userId)).toHaveLength(0);

    // 여정 건·지갑 건이 섞여도 응답은 요청 순서
    const mixed = await importAs(seed, '준용', {
      provider: 'WECHAT',
      items: [
        item({ occurredAt: old }),
        item({ txnDigest: digestOf(TXN_B) }),
        item({ txnDigest: digestOf('c1'), occurredAt: cst(kstDay(-2)) }),
      ],
    }).expect(201);
    expect(mixed.body).toMatchObject({ created: 3, linked: 2 });
    const rows = await prisma.transaction.findMany({
      where: {
        id: { in: mixed.body.items.map((i: { entryId: string }) => i.entryId) },
      },
      select: {
        id: true,
        occurredAt: true,
        expenses: { select: { tripId: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = mixed.body.items.map((i: { entryId: string }) =>
      byId.get(i.entryId),
    );
    expect(
      ordered.map((r: (typeof rows)[number] | undefined) => r?.expenses.length),
    ).toEqual([0, 1, 1]);
  });
  it('ALIPAY (W11): 404 until listed in FILE_IMPORT_PROVIDERS; then saves with import_provider ALIPAY, keys separate from WECHAT, +08:00 kept', async () => {
    const seed = await seedOngoing();
    const userId = seed.members['준용'].userId;
    const ALI_TXN = '2026102922001400000000000001';
    const aliItem = item({
      txnDigest: digestOf(ALI_TXN, 'ALIPAY'),
      occurredAt: cst(kstDay(-1), '23:30:00'),
      amount: '88.80',
      merchantName: 'e2e盒马鲜生',
    });

    // 위챗만 켜져 있으면 알리페이 두 경로 모두 404, 세션 목록에도 없다
    await importAs(seed, '준용', {
      provider: 'ALIPAY',
      items: [aliItem],
    }).expect(404);
    await checkAs(seed, '준용', {
      provider: 'ALIPAY',
      txnDigests: [aliItem.txnDigest],
    }).expect(404);
    const off = await request(server())
      .get('/api/auth/session')
      .set(as(seed, '준용'))
      .expect(200);
    expect(off.body.features).toMatchObject({
      fileImport: true,
      fileImportProviders: ['WECHAT'],
    });
    expect(await fileRows(userId)).toHaveLength(0);

    flags.providers = ['WECHAT', 'ALIPAY'];
    const on = await request(server())
      .get('/api/auth/session')
      .set(as(seed, '준용'))
      .expect(200);
    expect(on.body.features.fileImportProviders).toEqual(['WECHAT', 'ALIPAY']);

    const saved = (
      await importAs(seed, '준용', {
        provider: 'ALIPAY',
        items: [aliItem],
      }).expect(201)
    ).body as FileImportResponse;
    expect(saved).toMatchObject({ created: 1, skipped: 0 });
    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: saved.items[0].entryId },
    });
    expect(row).toMatchObject({
      source: 'FILE_IMPORT',
      importProvider: 'ALIPAY',
      originalCurrency: 'CNY',
      merchantNameRaw: 'e2e盒马鲜生',
    });
    // 중국 23:30(+08:00) = KST 다음 날 00:30
    expect(row.occurredAt.toISOString()).toBe(
      new Date(cst(kstDay(-1), '23:30:00')).toISOString(),
    );
    expect(row.externalRef).not.toBe(aliItem.txnDigest);

    // 확인: 같은 다이제스트라도 공급자가 다르면 다른 거래(WECHAT으로 물으면 false)
    const ali = await checkAs(seed, '준용', {
      provider: 'ALIPAY',
      txnDigests: [aliItem.txnDigest],
    }).expect(200);
    expect(ali.body).toEqual({ imported: [true] });
    const wechat = await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [aliItem.txnDigest],
    }).expect(200);
    expect(wechat.body).toEqual({ imported: [false] });

    // 다시 보내면 건너뛴다. 통화는 CNY만
    await importAs(seed, '준용', { provider: 'ALIPAY', items: [aliItem] })
      .expect(201)
      .expect((res) =>
        expect(res.body).toMatchObject({ created: 0, skipped: 1 }),
      );
    await importAs(seed, '준용', {
      provider: 'ALIPAY',
      items: [item({ txnDigest: digestOf('X-2', 'ALIPAY'), currency: 'JPY' })],
    }).expect(400);
    expect(await fileRows(userId)).toHaveLength(1);
  });

  it('allowlist (ADMIN3): only members with the provider grant can check and save; revoking turns it off on the next request', async () => {
    const seed = await seedOngoing();
    const granted = seed.members['준용'].userId;
    const other = seed.members['민지'].userId;
    flags.fileImportMode = 'allowlist';
    flags.providers = ['WECHAT', 'ALIPAY'];
    const session = async (name: string) =>
      (
        await request(server())
          .get('/api/auth/session')
          .set(as(seed, name))
          .expect(200)
      ).body.features as { fileImport: boolean; fileImportProviders: string[] };

    // 권한이 없으면 세션에서 숨기고, 확인·저장 모두 404(본문이 맞아도)
    expect(await session('준용')).toMatchObject({
      fileImport: false,
      fileImportProviders: [],
    });
    await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A)],
    }).expect(404);
    await importAs(seed, '준용', {
      provider: 'WECHAT',
      items: [item()],
    }).expect(404);

    await prisma.featureGrant.create({
      data: {
        userId: granted,
        feature: 'FILE_IMPORT_WECHAT',
        grantedBy: granted,
      },
    });
    expect(await session('준용')).toMatchObject({
      fileImport: true,
      fileImportProviders: ['WECHAT'],
    });
    await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A)],
    }).expect(200);
    await importAs(seed, '준용', {
      provider: 'WECHAT',
      items: [item()],
    })
      .expect(201)
      .expect((res) => expect(res.body).toMatchObject({ created: 1 }));
    // 위챗 권한으로 알리페이는 404
    await importAs(seed, '준용', {
      provider: 'ALIPAY',
      items: [item({ txnDigest: digestOf(TXN_B, 'ALIPAY') })],
    }).expect(404);
    // 같은 여정의 다른 회원은 여전히 404
    expect(await session('민지')).toMatchObject({ fileImport: false });
    await checkAs(seed, '민지', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A)],
    }).expect(404);
    expect(await fileRows(other)).toHaveLength(0);

    // 회수하면 다음 요청부터 404
    await prisma.featureGrant.deleteMany({ where: { userId: granted } });
    await checkAs(seed, '준용', {
      provider: 'WECHAT',
      txnDigests: [digestOf(TXN_A)],
    }).expect(404);
    expect(await fileRows(granted)).toHaveLength(1);
  });
});
