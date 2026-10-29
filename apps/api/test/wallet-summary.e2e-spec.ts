import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Me, WalletEntryListResponse } from '@yeojeong/shared';
import request from 'supertest';
import { Prisma, type PrismaClient } from './../src/generated/prisma/client.js';
import {
  createDbTestApp,
  createFixturePrisma,
  ExpenseFixtures,
  reachableDatabaseUrl,
  type SeedMember,
  type SeedTrip,
} from './expenses-fixtures.js';

// 지갑 요약(S7b, Q-51) 실제 DB e2e: GET /api/wallet/entries의 monthTotalKrw·monthTotalEstimated, GET /api/users/me의 walletEntryCount.
// 로컬: pnpm db:up + db:migrate:deploy. DB가 없으면 건너뛴다.
const databaseUrl = await reachableDatabaseUrl();

const KST_MS = 9 * 3_600_000;
const RATE_SOURCE = 'S7b e2e 매매기준율';

/** 지금이 속한 KST 달의 1일 00:00 KST와 다음 달 1일 00:00 KST */
function kstMonth() {
  const k = new Date(Date.now() + KST_MS);
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1) - KST_MS),
    next: new Date(Date.UTC(y, m + 1, 1) - KST_MS),
  };
}

describe.skipIf(!databaseUrl)('Wallet summary (S7b e2e, real DB)', () => {
  let prisma: PrismaClient;
  let fx: ExpenseFixtures;
  let app: NestExpressApplication;
  let auth: Awaited<ReturnType<typeof createDbTestApp>>['auth'];
  let seed: SeedTrip;
  const { start, next } = kstMonth();
  /** 이번 달 안의 시각(1일 00:00 KST + n분) */
  const inMonth = (minutes: number) =>
    new Date(start.getTime() + minutes * 60_000);

  beforeAll(async () => {
    prisma = createFixturePrisma(databaseUrl as string);
    fx = new ExpenseFixtures(prisma);
    ({ app, auth } = await createDbTestApp(prisma));
    seed = await fx.seedTrip(['준용', '민지']);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await prisma?.exchangeRate.deleteMany({ where: { source: RATE_SOURCE } });
    await app?.close();
    await prisma?.$disconnect();
  });

  const server = () => app.getHttpServer();
  const headers = (name: string) =>
    auth.headers({
      id: seed.members[name].userId,
      nickname: name,
      profileImageUrl: null,
    });
  const list = async (name: string, query = '') =>
    (
      await request(server())
        .get(`/api/wallet/entries${query}`)
        .set(headers(name))
        .expect(200)
    ).body as WalletEntryListResponse;
  const me = async (name: string) =>
    (
      await request(server())
        .get('/api/users/me')
        .set(headers(name))
        .expect(200)
    ).body as Me;

  /** 직접 입력 지갑 항목(MANUAL) */
  const addManual = (
    member: SeedMember,
    input: { at: Date; amount: string; currency?: string; spotKrw?: number },
  ) =>
    prisma.transaction.create({
      data: {
        userId: member.userId,
        source: 'MANUAL',
        kind: 'APPROVAL',
        occurredAt: input.at,
        merchantNameRaw: '결제',
        merchantKey: '결제',
        originalAmount: new Prisma.Decimal(input.amount),
        originalCurrency: input.currency ?? 'KRW',
        spotKrwAmount: input.spotKrw ?? null,
      },
    });

  it('sums this KST month with cancellations offset, excluding other users and duplicates', async () => {
    const jy = seed.members['준용'];
    // KST 경계: 1일 00:00은 포함, 그 1초 전(지난달)·다음 달 1일 00:00은 제외
    await addManual(jy, { at: start, amount: '10000' });
    await addManual(jy, {
      at: new Date(start.getTime() - 1000),
      amount: '99999',
    });
    await addManual(jy, { at: next, amount: '77777' });
    // 가져온 거래: 승인 30,000 + 부분 취소 −12,000 → 18,000
    const approval = await fx.addTransaction(jy, {
      at: inMonth(60),
      merchant: '이마트',
      amount: '30000',
      currency: 'KRW',
    });
    await fx.addTransaction(jy, {
      at: inMonth(90),
      merchant: '이마트',
      amount: '-12000',
      currency: 'KRW',
      kind: 'CANCEL',
      cancelOf: approval.id,
    });
    // 여정 결제에 연결된 외화 거래는 그 결제의 원화(여정 환율 기준)
    const linked = await fx.addTransaction(jy, {
      at: inMonth(120),
      merchant: '로손',
      amount: '1000',
      currency: 'JPY',
    });
    await fx.addExpense(seed, '준용', {
      status: 'PERSONAL',
      at: '2026-11-13 10:00',
      merchant: '로손',
      amount: '1000',
      krw: 9_190,
      transactionId: linked.id,
    });
    // 계좌·카드 양쪽에 잡힌 같은 결제(계좌 쪽)는 목록·합계·개수에서 빠진다
    await prisma.transaction.update({
      where: {
        id: (
          await fx.addTransaction(jy, {
            at: inMonth(60),
            merchant: '이마트',
            amount: '30000',
            currency: 'KRW',
          })
        ).id,
      },
      data: { sameUserDuplicateOfId: approval.id },
    });
    // 다른 사용자의 이번 달 결제
    await addManual(seed.members['민지'], {
      at: inMonth(30),
      amount: '500000',
    });

    const page = await list('준용');
    expect(page.monthTotalKrw).toBe(10_000 + 18_000 + 9_190);
    expect(page.monthTotalEstimated).toBe(false);
    // 화면이 보는 krwAmount를 이번 달 항목만 더한 값과 같다
    const monthItems = page.items.filter(
      (e) =>
        Date.parse(e.occurredAt) >= start.getTime() &&
        Date.parse(e.occurredAt) < next.getTime(),
    );
    expect(monthItems.reduce((sum, e) => sum + (e.krwAmount ?? 0), 0)).toBe(
      page.monthTotalKrw,
    );

    // 지갑 항목 수 = 목록에 보이는 전체(지난달·다음 달 포함, 중복 제외)
    expect(page.items).toHaveLength(6);
    expect((await me('준용')).walletEntryCount).toBe(6);

    const other = await list('민지');
    expect(other).toMatchObject({
      monthTotalKrw: 500_000,
      monthTotalEstimated: false,
    });
    expect((await me('민지')).walletEntryCount).toBe(1);
  });

  it('gives the same full-month total on every page regardless of cursor', async () => {
    const first = await list('준용', '?limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await list(
      '준용',
      `?limit=2&cursor=${encodeURIComponent(first.nextCursor as string)}`,
    );
    expect(second.items).toHaveLength(2);
    expect(second.monthTotalKrw).toBe(first.monthTotalKrw);
    expect(second.monthTotalEstimated).toBe(first.monthTotalEstimated);
    expect(first.monthTotalKrw).toBe(37_190);
  });

  it('flags estimates: stored spot KRW, payment-time spot conversion, and unavailable rates', async () => {
    const mj = seed.members['민지'];
    // 저장된 매매기준율 추정 원화(연결 없는 외화)를 쓰면 추정
    await addManual(mj, {
      at: inMonth(40),
      amount: '10.00',
      currency: 'EUR',
      spotKrw: 15_000,
    });
    expect(await list('민지')).toMatchObject({
      monthTotalKrw: 515_000,
      monthTotalEstimated: true,
    });

    // krwAmount가 없는 외화: 결제 시점 매매기준율(1달러 1,400원)로 추정해 더한다
    await prisma.exchangeRate.create({
      data: {
        quoteCurrency: 'USD',
        rate: new Prisma.Decimal('1400'),
        displayUnit: 1,
        source: RATE_SOURCE,
        effectiveAt: new Date(start.getTime() - 86_400_000),
      },
    });
    const jy = seed.members['준용'];
    await addManual(jy, { at: inMonth(150), amount: '12.34', currency: 'USD' });
    const usd = await list('준용');
    expect(usd.items.find((e) => e.currency === 'USD')?.krwAmount).toBeNull();
    // 12.34 × 1,400 = 17,276 → 10원 반올림 17,280
    expect(usd).toMatchObject({
      monthTotalKrw: 37_190 + 17_280,
      monthTotalEstimated: true,
    });

    // 고시가 하나도 없는 통화는 합계에서 빼고 추정으로 표시한다
    const lone = await fx.seedTrip(['태현'], { withPaymentMethod: false });
    const th = lone.members['태현'];
    await addManual(th, { at: inMonth(10), amount: '3000' });
    await addManual(th, { at: inMonth(20), amount: '5.00', currency: 'XTS' });
    const thPage = (
      await request(server())
        .get('/api/wallet/entries')
        .set(
          auth.headers({
            id: th.userId,
            nickname: '태현',
            profileImageUrl: null,
          }),
        )
        .expect(200)
    ).body as WalletEntryListResponse;
    expect(thPage).toMatchObject({
      monthTotalKrw: 3_000,
      monthTotalEstimated: true,
    });
  });

  it('returns zero for an empty wallet', async () => {
    const empty = await fx.seedTrip(['수빈'], { withPaymentMethod: false });
    const h = auth.headers({
      id: empty.members['수빈'].userId,
      nickname: '수빈',
      profileImageUrl: null,
    });
    const res = await request(server())
      .get('/api/wallet/entries')
      .set(h)
      .expect(200);
    expect(res.body).toEqual({
      items: [],
      nextCursor: null,
      monthTotalKrw: 0,
      monthTotalEstimated: false,
    });
    const profile = await request(server())
      .get('/api/users/me')
      .set(h)
      .expect(200);
    expect(profile.body.walletEntryCount).toBe(0);
  });
});
