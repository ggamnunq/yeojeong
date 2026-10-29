import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  ExpenseDetailResponse,
  TripFxView,
  TripSummary,
  UpdateFxPolicyResponse,
  WalletEntryMutationResponse,
} from '@yeojeong/shared';
import request from 'supertest';
import { Prisma, type PrismaClient } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { ImportService } from './../src/transactions/import.service.js';
import {
  createDbTestApp,
  createFixturePrisma,
  ExpenseFixtures,
  reachableDatabaseUrl,
  type SeedTrip,
} from './expenses-fixtures.js';

// 여정 통화 외 외화의 원화 환산(S7c, 디자인 결정 C-32) 실제 DB e2e.
// KRW·여정 통화는 여정 정책(고정 환율·카드사 원화) 그대로, 그 밖의 외화는 결제 시점 시장 환율(SPOT_AT_PAYMENT).
// 경로: 지갑 → 여정 자동 연결(MANUAL), 계좌·카드 인입(AUTO), 환율 기준 변경 재계산, 정산 합계.
const databaseUrl = await reachableDatabaseUrl();

const DAY_MS = 86_400_000;
const kstDay = (offsetDays: number) =>
  new Date(Date.now() + 9 * 3_600_000 + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
const RATE_SOURCE = 'S7c e2e 매매기준율';
/** 결제보다 앞선 고시 시각(가장 최근 고시가 되도록 지금 직전) */
const RATE_AT = new Date(Date.now() - 30 * 60_000);
/** 가져온 거래의 결제 시각 */
const PAID_AT = new Date(Date.now() - 5 * 60_000);
/** Date → "YYYY-MM-DD HH:mm"(KST, fixtures kst() 형식) */
const kstMinute = (at: Date) =>
  new Date(at.getTime() + 9 * 3_600_000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');

describe.skipIf(!databaseUrl)('Foreign currency fx (S7c e2e, real DB)', () => {
  let prisma: PrismaClient;
  let fx: ExpenseFixtures;
  let app: NestExpressApplication;
  let auth: Awaited<ReturnType<typeof createDbTestApp>>['auth'];

  beforeAll(async () => {
    prisma = createFixturePrisma(databaseUrl as string);
    fx = new ExpenseFixtures(prisma);
    ({ app, auth } = await createDbTestApp(prisma));
    // 1달러 = 1,380.50원, 100엔 = 919.20원
    await prisma.exchangeRate.createMany({
      data: [
        {
          quoteCurrency: 'USD',
          rate: new Prisma.Decimal('1380.5'),
          displayUnit: 1,
          source: RATE_SOURCE,
          effectiveAt: RATE_AT,
        },
        {
          quoteCurrency: 'JPY',
          rate: new Prisma.Decimal('9.192'),
          displayUnit: 100,
          source: RATE_SOURCE,
          effectiveAt: RATE_AT,
        },
      ],
    });
  });

  afterAll(async () => {
    const tripIds = fx?.tripIds ?? [];
    await prisma?.tripEvent.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma?.settlement.deleteMany({ where: { tripId: { in: tripIds } } });
    await fx?.cleanup();
    await prisma?.exchangeRate.deleteMany({ where: { source: RATE_SOURCE } });
    await app?.close();
    await prisma?.$disconnect();
  });

  const server = () => app.getHttpServer();
  const as = (seed: SeedTrip, name: string) =>
    auth.headers({
      id: seed.members[name].userId,
      nickname: name,
      profileImageUrl: null,
    });
  const mid = (seed: SeedTrip, name: string) => seed.members[name].membershipId;

  /** 진행 중(어제~모레) JPY 여정. policy를 주면 그 환율 기준으로 바꾼다 */
  const seedJpyTrip = async (
    options: {
      policy?: 'FIXED' | 'CARD_BILLED';
      withPaymentMethod?: boolean;
    } = {},
  ) => {
    const seed = await fx.seedTrip(['준용', '민지'], {
      period: { start: kstDay(-1), end: kstDay(2) },
      withPaymentMethod: options.withPaymentMethod ?? false,
    });
    if (options.policy) {
      await prisma.trip.update({
        where: { id: seed.tripId },
        data: {
          fxPolicy: options.policy,
          fxFixedRate: options.policy === 'FIXED' ? '900.00' : null,
          fxPolicyChangedAt: new Date(),
        },
      });
    }
    return seed;
  };

  const snapshot = (id: string) =>
    prisma.expense.findUniqueOrThrow({
      where: { id },
      select: {
        krwAmount: true,
        netKrwAmount: true,
        fxPolicyApplied: true,
        fxRate: true,
        fxRateUnit: true,
        fxRateSource: true,
        fxRateAt: true,
      },
    });

  const addEntry = (seed: SeedTrip, name: string, body: object) =>
    request(server())
      .post('/api/wallet/entries')
      .set(as(seed, name))
      .send(body);

  const fxView = async (seed: SeedTrip) =>
    (
      await request(server())
        .get(`/api/trips/${seed.tripId}/fx-policy`)
        .set(as(seed, '준용'))
        .expect(200)
    ).body as TripFxView;
  const patchFx = async (seed: SeedTrip, body: object) => {
    const { version } = await fxView(seed);
    const res = await request(server())
      .patch(`/api/trips/${seed.tripId}/fx-policy`)
      .set(as(seed, '준용'))
      .send({ ...body, version })
      .expect(200);
    return res.body as UpdateFxPolicyResponse;
  };

  const runImport = (seed: SeedTrip, name: string) =>
    app.get(PrismaService).$transaction((tx) =>
      app.get(ImportService).importIntoTrip(tx, {
        tripId: seed.tripId,
        membershipId: mid(seed, name),
        userId: seed.members[name].userId,
        now: new Date(),
      }),
    );
  const importedOf = async (seed: SeedTrip, transactionId: string) =>
    prisma.expense.findFirst({
      where: { tripId: seed.tripId, transactionId },
      select: { id: true },
    });

  it('links a wallet USD entry to a fixed-rate JPY trip with the market rate, JPY and KRW with the trip rule', async () => {
    const seed = await seedJpyTrip({ policy: 'FIXED' });

    const usd = (
      await addEntry(seed, '준용', {
        amount: '25.5',
        currency: 'USD',
        memo: '공항 면세점',
      }).expect(201)
    ).body as WalletEntryMutationResponse;
    // 25.5 × 1,380.50 = 35,202.75 → 35,200 (고정 환율 900원/100엔을 쓰지 않는다)
    expect(usd.entry).toMatchObject({
      currency: 'USD',
      krwAmount: 35_200,
      linkedTrip: { tripId: seed.tripId, expenseStatus: 'PENDING' },
    });
    expect(usd.linkedExpense).toMatchObject({
      krwAmount: 35_200,
      originalCurrency: 'USD',
      fx: {
        rate: '1380.5',
        displayUnit: 1,
        source: RATE_SOURCE,
        policy: 'SPOT_AT_PAYMENT',
      },
    });
    const usdRow = await snapshot(usd.linkedExpense!.id);
    expect(usdRow).toMatchObject({
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
      fxRateUnit: 1,
      fxRateSource: RATE_SOURCE,
      fxRateAt: RATE_AT,
    });
    expect(usdRow.fxRate?.toFixed(6)).toBe('1380.500000');

    const jpy = (
      await addEntry(seed, '준용', {
        amount: '2860',
        currency: 'JPY',
      }).expect(201)
    ).body as WalletEntryMutationResponse;
    expect(jpy.linkedExpense).toMatchObject({
      krwAmount: 25_740, // 2,860 × 9.00
      fx: { displayUnit: 100, source: '고정 환율', policy: 'FIXED' },
    });

    const krw = (
      await addEntry(seed, '준용', {
        amount: '13200',
        currency: 'KRW',
      }).expect(201)
    ).body as WalletEntryMutationResponse;
    expect(krw.linkedExpense).toMatchObject({ krwAmount: 13_200, fx: null });
    expect(await snapshot(krw.linkedExpense!.id)).toMatchObject({
      fxPolicyApplied: null,
      fxRate: null,
    });
  });

  it('re-converts a USD wallet entry with the market rate when it is edited', async () => {
    const seed = await seedJpyTrip({ policy: 'FIXED' });
    const created = (
      await addEntry(seed, '준용', { amount: '1000', currency: 'JPY' }).expect(
        201,
      )
    ).body as WalletEntryMutationResponse;
    expect(created.linkedExpense?.fx?.policy).toBe('FIXED');
    const edited = (
      await request(server())
        .patch(`/api/wallet/entries/${created.entry.id}`)
        .set(as(seed, '준용'))
        .send({ amount: '10', currency: 'USD', version: created.entry.version })
        .expect(200)
    ).body as WalletEntryMutationResponse;
    expect(edited.entry.krwAmount).toBe(13_810); // 10 × 1,380.50 → 13,810
    expect(await snapshot(created.linkedExpense!.id)).toMatchObject({
      krwAmount: 13_810,
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
      fxRateSource: RATE_SOURCE,
    });
  });

  it('imports a USD card payment into fixed-rate and card-billed JPY trips with the market rate (AUTO)', async () => {
    const fixed = await seedJpyTrip({
      policy: 'FIXED',
      withPaymentMethod: true,
    });
    const me = fixed.members['준용'];
    const usdTx = await fx.addTransaction(me, {
      at: PAID_AT,
      merchant: 'DUTY FREE',
      amount: '25.5',
      currency: 'USD',
      providerKrw: 36_000,
    });
    const jpyTx = await fx.addTransaction(me, {
      at: PAID_AT,
      merchant: '로손',
      amount: '2860',
      currency: 'JPY',
      providerKrw: 26_500,
    });
    expect(await runImport(fixed, '준용')).toBe(2);
    const usdId = (await importedOf(fixed, usdTx.id))!.id;
    const jpyId = (await importedOf(fixed, jpyTx.id))!.id;
    expect(await snapshot(usdId)).toMatchObject({
      krwAmount: 35_200,
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
      fxRateUnit: 1,
      fxRateSource: RATE_SOURCE,
      fxRateAt: RATE_AT,
    });
    expect(await snapshot(jpyId)).toMatchObject({
      krwAmount: 25_740,
      fxPolicyApplied: 'FIXED',
      fxRateSource: '고정 환율',
    });

    // 카드사 원화 여정: 여정 통화(JPY)는 기존대로 제공자 원화, 제3통화(USD)는 시장 환율
    const billed = await seedJpyTrip({
      policy: 'CARD_BILLED',
      withPaymentMethod: true,
    });
    const her = billed.members['민지'];
    const usd2 = await fx.addTransaction(her, {
      at: PAID_AT,
      merchant: 'DUTY FREE',
      amount: '25.5',
      currency: 'USD',
      providerKrw: 36_000,
    });
    const jpy2 = await fx.addTransaction(her, {
      at: PAID_AT,
      merchant: '로손',
      amount: '2860',
      currency: 'JPY',
      providerKrw: 26_500,
    });
    expect(await runImport(billed, '민지')).toBe(2);
    expect(
      await snapshot((await importedOf(billed, usd2.id))!.id),
    ).toMatchObject({
      krwAmount: 35_200,
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
      fxRateSource: RATE_SOURCE,
    });
    expect(
      await snapshot((await importedOf(billed, jpy2.id))!.id),
    ).toMatchObject({
      krwAmount: 26_500,
      fxPolicyApplied: 'CARD_BILLED',
      fxRateSource: '카드사 청구 환율',
    });
  });

  it('defers a third-currency import without any rate (FX_RATE_UNAVAILABLE) instead of using the fixed rate', async () => {
    const seed = await seedJpyTrip({
      policy: 'FIXED',
      withPaymentMethod: true,
    });
    // XTS(ISO 4217 시험용 코드)는 고시가 없다
    const tx = await fx.addTransaction(seed.members['준용'], {
      at: PAID_AT,
      merchant: 'TEST',
      amount: '10',
      currency: 'XTS',
    });
    expect(await runImport(seed, '준용')).toBe(0);
    expect(await importedOf(seed, tx.id)).toBeNull();
  });

  it('keeps third-currency payments on the market rate across fx-policy changes and in the settlement total', async () => {
    const seed = await seedJpyTrip({ policy: 'FIXED' });
    const usd = (
      await addEntry(seed, '준용', { amount: '25.5', currency: 'USD' }).expect(
        201,
      )
    ).body as WalletEntryMutationResponse;
    const jpy = (
      await addEntry(seed, '민지', { amount: '2860', currency: 'JPY' }).expect(
        201,
      )
    ).body as WalletEntryMutationResponse;
    const usdId = usd.linkedExpense!.id;
    const jpyId = jpy.linkedExpense!.id;
    // S7 이전에 고정 환율로 잘못 저장된 제3통화 결제(25.5 × 9.00 = 230)
    const legacy = await fx.addExpense(seed, '준용', {
      status: 'SHARED',
      at: kstMinute(PAID_AT),
      merchant: '옛 USD 결제',
      amount: '25.5',
      currency: 'USD',
      krw: 230,
      participants: ['준용', '민지'],
      transactionId: null,
    });
    await prisma.expense.update({
      where: { id: legacy.id },
      data: {
        fxPolicyApplied: 'FIXED',
        fxRate: '9.000000',
        fxRateUnit: 1,
        fxRateSource: '고정 환율',
      },
    });

    // 둘 다 공동으로 확정(2명 분담)
    for (const [name, id, version] of [
      ['준용', usdId, usd.linkedExpense!.version],
      ['민지', jpyId, jpy.linkedExpense!.version],
    ] as const) {
      await request(server())
        .put(`/api/trips/${seed.tripId}/expenses/${id}/classification`)
        .set(as(seed, name))
        .send({ status: 'SHARED', version })
        .expect(200);
    }

    // 고정 환율을 바꾸면 여정 통화(JPY)만 바뀌고 USD는 시장 환율 그대로, 옛 USD 결제는 시장 환율로 고쳐진다
    const changed = await patchFx(seed, {
      policy: 'FIXED',
      fixedRate: '1000',
    });
    expect(changed.recalculatedCount).toBe(2); // JPY 25,740 → 28,600, 옛 USD 230 → 35,200
    expect(await snapshot(jpyId)).toMatchObject({
      krwAmount: 28_600,
      fxPolicyApplied: 'FIXED',
    });
    expect(await snapshot(usdId)).toMatchObject({
      krwAmount: 35_200,
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
      fxRateSource: RATE_SOURCE,
    });
    const fixedLegacy = await prisma.expense.findUniqueOrThrow({
      where: { id: legacy.id },
      include: { shares: true },
    });
    expect(fixedLegacy).toMatchObject({
      krwAmount: 35_200,
      netKrwAmount: 35_200,
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
      fxRateSource: RATE_SOURCE,
    });
    expect(fixedLegacy.shares.map((s) => s.amountKrw)).toEqual([
      17_600, 17_600,
    ]);

    const detail = (
      await request(server())
        .get(`/api/trips/${seed.tripId}/expenses/${usdId}`)
        .set(as(seed, '민지'))
        .expect(200)
    ).body as ExpenseDetailResponse;
    expect(detail.fx).toMatchObject({
      rate: '1380.5',
      source: RATE_SOURCE,
      policy: 'SPOT_AT_PAYMENT',
    });

    // 정산 합계: 여정 통화는 고정 환율, 제3통화는 시장 환율로 더한다
    const summary = (
      await request(server())
        .get(`/api/trips/${seed.tripId}/summary`)
        .set(as(seed, '준용'))
        .expect(200)
    ).body as TripSummary;
    expect(summary.sharedTotalKrw).toBe(28_600 + 35_200 + 35_200);
    // 준용: 70,400 냄 − 49,500 부담 = +20,900
    expect(summary.me.netKrw).toBe(70_400 - (28_600 + 35_200 + 35_200) / 2);

    // 시장 환율 기준으로 바꿔도 USD 값은 같다(재계산 대상은 JPY만)
    const spot = await patchFx(seed, { policy: 'SPOT_AT_PAYMENT' });
    expect(spot.recalculatedCount).toBe(1); // JPY 28,600 → 26,290
    expect(await snapshot(usdId)).toMatchObject({
      krwAmount: 35_200,
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
    });
  });
});
