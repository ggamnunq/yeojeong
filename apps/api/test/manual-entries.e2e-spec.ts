import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  ExpenseDetailResponse,
  ExpenseListResponse,
  SettlementView,
  TripSummary,
  WalletEntryListResponse,
  WalletEntryMutationResponse,
  WalletTripCandidatesResponse,
} from '@yeojeong/shared';
import request from 'supertest';
import { Prisma, type PrismaClient } from './../src/generated/prisma/client.js';
import { purgeAllFinancialData } from './../src/payment-methods/unlink-purge.js';
import {
  createDbTestApp,
  createFixturePrisma,
  ExpenseFixtures,
  reachableDatabaseUrl,
  type SeedTrip,
} from './expenses-fixtures.js';

// 수동 결제(S7, 명세 v0.6.0) 실제 DB e2e: 지갑 → 여정 자동 연결, 여정에서 추가, 수정·삭제 전파, 정산 반영.
// 로컬: pnpm db:up + db:migrate:deploy. DB가 없으면 건너뛴다.
const databaseUrl = await reachableDatabaseUrl();

const DAY_MS = 86_400_000;
/** 오늘(KST) + n일 → "YYYY-MM-DD" */
const kstDay = (offsetDays: number) =>
  new Date(Date.now() + 9 * 3_600_000 + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
const RATE_SOURCE = 'S7 e2e 매매기준율';

describe.skipIf(!databaseUrl)('Manual entries (S7 e2e, real DB)', () => {
  let prisma: PrismaClient;
  let fx: ExpenseFixtures;
  let app: NestExpressApplication;
  let auth: Awaited<ReturnType<typeof createDbTestApp>>['auth'];

  beforeAll(async () => {
    prisma = createFixturePrisma(databaseUrl as string);
    fx = new ExpenseFixtures(prisma);
    // 운영 기본값처럼 계좌·카드 연결을 숨긴 상태(FR-006)로 띄운다
    ({ app, auth } = await createDbTestApp(prisma, {
      features: { accountLink: false },
    }));
    // 100엔 = 919.20원(1엔 9.192원). 가장 최근 고시가 되도록 지금 직전 시각으로 둔다
    await prisma.exchangeRate.create({
      data: {
        quoteCurrency: 'JPY',
        rate: new Prisma.Decimal('9.192'),
        displayUnit: 100,
        source: RATE_SOURCE,
        effectiveAt: new Date(Date.now() - 60_000),
      },
    });
  });

  afterAll(async () => {
    await prisma?.settlement.deleteMany({
      where: { tripId: { in: fx?.tripIds ?? [] } },
    });
    await fx?.cleanup();
    await prisma?.exchangeRate.deleteMany({ where: { source: RATE_SOURCE } });
    await app?.close();
    await prisma?.$disconnect();
  });

  const server = () => app.getHttpServer();
  const as = (seed: SeedTrip, name: string) => {
    const m = seed.members[name];
    return auth.headers({
      id: m.userId,
      nickname: name,
      profileImageUrl: null,
    });
  };
  const mid = (seed: SeedTrip, name: string) => seed.members[name].membershipId;

  /** 진행 중(어제~모레) JPY 여정. 결제수단을 연결한 적 없는 사용자들 */
  const seedOngoing = (names = ['준용', '민지', '태현']) =>
    fx.seedTrip(names, {
      period: { start: kstDay(-1), end: kstDay(2) },
      withPaymentMethod: false,
    });

  const addEntry = (seed: SeedTrip, name: string, body: object) =>
    request(server())
      .post('/api/wallet/entries')
      .set(as(seed, name))
      .send(body);
  const addTripExpense = (seed: SeedTrip, name: string, body: object) =>
    request(server())
      .post(`/api/trips/${seed.tripId}/expenses`)
      .set(as(seed, name))
      .send(body);
  const detail = (seed: SeedTrip, name: string, id: string) =>
    request(server())
      .get(`/api/trips/${seed.tripId}/expenses/${id}`)
      .set(as(seed, name));
  const classify = (seed: SeedTrip, name: string, id: string, body: object) =>
    request(server())
      .put(`/api/trips/${seed.tripId}/expenses/${id}/classification`)
      .set(as(seed, name))
      .send(body);
  const walletList = async (seed: SeedTrip, name: string) =>
    (
      await request(server())
        .get('/api/wallet/entries')
        .set(as(seed, name))
        .expect(200)
    ).body as WalletEntryListResponse;

  it('hides account linking while the flag is off (FR-006, L-10)', async () => {
    const res = await request(server()).get('/api/auth/session').expect(200);
    expect(res.body).toMatchObject({
      status: 'ANONYMOUS',
      features: { accountLink: false },
    });
    const seed = await seedOngoing(['준용', '민지']);
    const h = as(seed, '준용');
    // 연동 전용 API는 404(기능 존재를 숨김)
    await request(server())
      .post('/api/payment-connections')
      .set(h)
      .send({ provider: 'TOSS', purpose: 'WALLET_ADD' })
      .expect(404);
    await request(server())
      .post('/api/payment-methods/sync')
      .set(h)
      .expect(404);
    await request(server())
      .delete(`/api/payment-methods/${randomUUID()}`)
      .set(h)
      .expect(404);
    await request(server())
      .get(`/api/trips/${seed.tripId}/out-of-period-candidates`)
      .set(h)
      .expect(404);
    await request(server())
      .get('/api/consents/status')
      .query({ stage: 'FIN_LINK' })
      .set(h)
      .expect(404);
    await request(server())
      .get('/api/consents/documents')
      .query({ stage: 'FIN_LINK' })
      .expect(404);
    await request(server())
      .get('/api/consents/documents')
      .query({ stage: 'SIGNUP' })
      .expect(200);
    // 결제수단 목록은 빈 값, 기간 외 결제 추가 진입점은 없음
    const methods = await request(server())
      .get('/api/payment-methods')
      .set(h)
      .expect(200);
    expect(methods.body).toMatchObject({
      methods: [],
      connections: [],
      hasExpiredConnection: false,
    });
    const list = await request(server())
      .get(`/api/trips/${seed.tripId}/expenses`)
      .set(h)
      .expect(200);
    expect(list.body.showOutOfPeriodEntry).toBe(false);
  });

  describe('지갑 → 여정 자동 연결', () => {
    it('suggests the in-period trip first, ongoing before upcoming', async () => {
      const ongoing = await seedOngoing(['하나', '두리']);
      const users = {
        하나: ongoing.members['하나'].userId,
        두리: ongoing.members['두리'].userId,
      };
      const upcoming = await fx.seedTrip(['하나', '두리'], {
        status: 'UPCOMING',
        period: { start: kstDay(10), end: kstDay(12) },
        currency: 'USD',
        users,
      });
      const res = await request(server())
        .get('/api/wallet/trip-candidates')
        .query({ at: new Date().toISOString() })
        .set(as(ongoing, '하나'))
        .expect(200);
      const body = res.body as WalletTripCandidatesResponse;
      expect(body.items.map((i) => [i.tripId, i.inPeriod, i.status])).toEqual([
        [ongoing.tripId, true, 'ONGOING'],
        [upcoming.tripId, false, 'UPCOMING'],
      ]);
      expect(body.suggestedTripId).toBe(ongoing.tripId);
      expect(body.defaultCurrency).toBe('JPY');
      expect(body.items[0]).toMatchObject({
        groupName: '오사카 먹방',
        placeLabel: '일본 오사카',
        currency: 'JPY',
        startDate: kstDay(-1),
        endDate: kstDay(2),
      });
    });

    it('adds a wallet entry as a PENDING expense of the matching trip, then classifies, edits and deletes it', async () => {
      const seed = await seedOngoing();
      const created = await addEntry(seed, '준용', {
        amount: '1000',
        memo: '이치란 라멘',
      }).expect(201);
      const body = created.body as WalletEntryMutationResponse;
      // 통화 기본값 = 진행 중 여정의 통화(JPY), 환산은 여정 환율 기준(매매기준율)
      expect(body.entry).toMatchObject({
        source: 'MANUAL',
        kind: 'APPROVAL',
        memo: '이치란 라멘',
        merchantName: '이치란 라멘',
        amount: '1000',
        currency: 'JPY',
        krwAmount: 9190,
        paymentMethodLabel: null,
        canDelete: true,
        editableFields: ['amount', 'currency', 'memo', 'occurredAt'],
        linkedTrip: { tripId: seed.tripId, expenseStatus: 'PENDING' },
      });
      const expense = body.linkedExpense!;
      expect(expense).toMatchObject({
        status: 'PENDING',
        origin: 'MANUAL',
        merchantName: '이치란 라멘',
        krwAmount: 9190,
        originalCurrency: 'JPY',
        createdByMembershipId: mid(seed, '준용'),
        walletEntryId: body.entry.id,
        fx: { rate: '9.192', displayUnit: 100, policy: 'SPOT_AT_PAYMENT' },
        permissions: { canEdit: true, isPayer: true, isAuthor: true },
      });
      expect(expense.payer.isMe).toBe(true);

      // 미확정은 결제자에게만 보인다(가져온 결제와 같다)
      await detail(seed, '민지', expense.id).expect(404);
      const mine = (
        await request(server())
          .get(`/api/trips/${seed.tripId}/expenses`)
          .set(as(seed, '준용'))
          .expect(200)
      ).body as ExpenseListResponse;
      expect(mine.pendingCount).toBe(1);

      // 결제수단을 연결한 적 없어도(활성 결제수단 0개) 공동으로 확정된다(S4 규칙은 가져온 결제에만)
      const shared = await classify(seed, '준용', expense.id, {
        status: 'SHARED',
        version: expense.version,
      }).expect(200);
      expect(shared.body).toMatchObject({
        status: 'SHARED',
        perPersonKrw: 3063,
      });
      await detail(seed, '민지', expense.id).expect(200);

      // 지갑 금액을 바꾸면 공동 결제에 반영되고 "변경됨"이 붙는다
      const edited = await request(server())
        .patch(`/api/wallet/entries/${body.entry.id}`)
        .set(as(seed, '준용'))
        .send({ version: body.entry.version, amount: '2000' })
        .expect(200);
      const editedBody = edited.body as WalletEntryMutationResponse;
      expect(editedBody.entry).toMatchObject({
        amount: '2000',
        krwAmount: 18380,
      });
      expect(editedBody.entry.version).toBe(body.entry.version + 1);
      expect(editedBody.linkedExpense).toMatchObject({
        status: 'SHARED',
        krwAmount: 18380,
        version: (shared.body as ExpenseDetailResponse).version + 1,
      });
      const seen = (await detail(seed, '민지', expense.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(seen.flags.changed).toBe(true);
      expect(seen.shares.reduce((sum, s) => sum + s.amountKrw, 0)).toBe(18380);

      // 낡은 version → 409 VERSION_CONFLICT(최신 항목 동봉)
      const stale = await request(server())
        .patch(`/api/wallet/entries/${body.entry.id}`)
        .set(as(seed, '준용'))
        .send({ version: body.entry.version, amount: '3000' })
        .expect(409);
      expect(stale.body.code).toBe('VERSION_CONFLICT');
      expect(stale.body.details.current.entry.amount).toBe('2000');

      // 공동 결제가 연결된 항목은 확인 플래그 없이 지울 수 없다
      const blocked = await request(server())
        .delete(`/api/wallet/entries/${body.entry.id}`)
        .set(as(seed, '준용'))
        .expect(409);
      expect(blocked.body).toMatchObject({
        code: 'SHARED_DELETE_CONFIRM_REQUIRED',
        details: { tripId: seed.tripId, expenseId: expense.id },
      });
      await request(server())
        .delete(`/api/wallet/entries/${body.entry.id}`)
        .query({ includeShared: 'true' })
        .set(as(seed, '준용'))
        .expect(204);
      await detail(seed, '민지', expense.id).expect(404);
      expect(
        (await walletList(seed, '준용')).items.map((i) => i.id),
      ).not.toContain(body.entry.id);
    });

    it('deletes a linked PENDING expense together with the wallet entry', async () => {
      const seed = await seedOngoing();
      const created = (
        await addEntry(seed, '준용', {
          amount: '5000',
          currency: 'KRW',
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      expect(created.entry).toMatchObject({
        merchantName: '결제',
        memo: null,
        krwAmount: 5000,
      });
      await request(server())
        .delete(`/api/wallet/entries/${created.entry.id}`)
        .set(as(seed, '준용'))
        .expect(204);
      await detail(seed, '준용', created.linkedExpense!.id).expect(404);
    });

    it('keeps an entry wallet-only without a matching trip or with tripId null', async () => {
      const seed = await seedOngoing();
      const old = new Date(Date.now() - 20 * DAY_MS).toISOString();
      const outside = (
        await addEntry(seed, '준용', {
          amount: '15000',
          currency: 'KRW',
          occurredAt: old,
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      expect(outside.linkedExpense).toBeNull();
      expect(outside.entry).toMatchObject({
        linkedTrip: null,
        krwAmount: 15000,
      });

      const optOut = (
        await addEntry(seed, '준용', {
          amount: '7000',
          currency: 'KRW',
          tripId: null,
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      expect(optOut.linkedExpense).toBeNull();

      // 기간 밖이어도 직접 고른 여정에는 연결된다 → 여정 전 그룹(periodSide BEFORE), origin은 MANUAL
      const picked = (
        await addEntry(seed, '준용', {
          amount: '8000',
          currency: 'KRW',
          occurredAt: old,
          tripId: seed.tripId,
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      expect(picked.linkedExpense).toMatchObject({
        origin: 'MANUAL',
        periodSide: 'BEFORE',
        dayIndex: null,
        status: 'PENDING',
      });

      const notMine = await addEntry(seed, '준용', {
        amount: '1000',
        currency: 'KRW',
        tripId: randomUUID(),
      }).expect(400);
      expect(notMine.body.details.fields[0]).toMatchObject({
        path: 'tripId',
        code: 'tripNotAvailable',
      });
    });

    it('returns the first result again for the same clientRequestId', async () => {
      const seed = await seedOngoing();
      const clientRequestId = randomUUID();
      const first = (
        await addEntry(seed, '준용', {
          amount: '3000',
          currency: 'KRW',
          clientRequestId,
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      const again = (
        await addEntry(seed, '준용', {
          amount: '3000',
          currency: 'KRW',
          clientRequestId,
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      expect(again.entry.id).toBe(first.entry.id);
      expect(again.linkedExpense?.id).toBe(first.linkedExpense?.id);
      expect(
        await prisma.transaction.count({
          where: { userId: seed.members['준용'].userId, clientRequestId },
        }),
      ).toBe(1);
    });

    it('validates the amount against the currency', async () => {
      const seed = await seedOngoing();
      const res = await addEntry(seed, '준용', {
        amount: '100.5',
        currency: 'JPY',
      }).expect(400);
      expect(res.body.details.fields[0]).toMatchObject({
        path: 'amount',
        code: 'fractionDigits',
      });
      await addEntry(seed, '준용', { amount: '0', currency: 'USD' }).expect(
        400,
      );
      // 원화 환산 1억 원까지
      await addEntry(seed, '준용', {
        amount: '100000000',
        currency: 'KRW',
        tripId: null,
      }).expect(201);
      await addEntry(seed, '준용', {
        amount: '100000001',
        currency: 'KRW',
      }).expect(400);
      // 내용은 정리(줄바꿈·앞뒤 공백 제거) 뒤 40자까지
      const long = await addEntry(seed, '준용', {
        amount: '1000',
        currency: 'KRW',
        memo: 'ㄱ'.repeat(41),
      }).expect(400);
      expect(long.body.details.fields[0]).toMatchObject({
        path: 'memo',
        code: 'maxLength',
      });
      const cleaned = (
        await addEntry(seed, '준용', {
          amount: '1000',
          currency: 'KRW',
          tripId: null,
          memo: `  라멘\n${'ㄱ'.repeat(30)}  `,
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      expect(cleaned.entry.memo).toBe(`라멘 ${'ㄱ'.repeat(30)}`);
      // 미래 시각(지금 + 5분 초과)은 막는다
      await addEntry(seed, '준용', {
        amount: '1000',
        currency: 'KRW',
        occurredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }).expect(400);
    });

    it('converts unlinked foreign entries with the latest rate at input time (Q-43)', async () => {
      const seed = await seedOngoing();
      const res = (
        await addEntry(seed, '준용', {
          amount: '1000',
          currency: 'JPY',
          occurredAt: new Date(Date.now() - 20 * DAY_MS).toISOString(),
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      expect(res.entry).toMatchObject({ linkedTrip: null, krwAmount: 9190 });
    });

    it('moves a pending entry to another trip or unlinks it, but not after it is confirmed (Q-46)', async () => {
      const seed = await seedOngoing(['준용', '민지']);
      const users = {
        준용: seed.members['준용'].userId,
        민지: seed.members['민지'].userId,
      };
      const other = await fx.seedTrip(['준용', '민지'], {
        status: 'UPCOMING',
        period: { start: kstDay(10), end: kstDay(12) },
        currency: 'KRW',
        users,
      });
      const created = (
        await addEntry(seed, '준용', {
          amount: '7000',
          currency: 'KRW',
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      expect(created.entry.canChangeTrip).toBe(true);
      const patch = (body: object) =>
        request(server())
          .patch(`/api/wallet/entries/${created.entry.id}`)
          .set(as(seed, '준용'))
          .send(body);

      // 다른 여정으로 옮기면 그 여정의 미확정(여정 전 그룹)이 되고 원래 결제는 사라진다
      const moved = (
        await patch({
          version: created.entry.version,
          tripId: other.tripId,
        }).expect(200)
      ).body as WalletEntryMutationResponse;
      expect(moved.entry.linkedTrip?.tripId).toBe(other.tripId);
      expect(moved.linkedExpense).toMatchObject({
        status: 'PENDING',
        periodSide: 'BEFORE',
        krwAmount: 7000,
      });
      await detail(seed, '준용', created.linkedExpense!.id).expect(404);

      // 연결 끊기
      const unlinked = (
        await patch({ version: moved.entry.version, tripId: null }).expect(200)
      ).body as WalletEntryMutationResponse;
      expect(unlinked.entry.linkedTrip).toBeNull();
      expect(
        await prisma.expense.count({
          where: { transactionId: created.entry.id },
        }),
      ).toBe(0);

      // 다시 연결 → 확정 → 여정 바꾸기는 409
      const relinked = (
        await patch({
          version: unlinked.entry.version,
          tripId: seed.tripId,
        }).expect(200)
      ).body as WalletEntryMutationResponse;
      await classify(seed, '준용', relinked.linkedExpense!.id, {
        status: 'PERSONAL',
        version: relinked.linkedExpense!.version,
      }).expect(200);
      const entry = (await walletList(seed, '준용')).items.find(
        (i) => i.id === created.entry.id,
      )!;
      expect(entry.canChangeTrip).toBe(false);
      const locked = await patch({
        version: entry.version,
        tripId: other.tripId,
      }).expect(409);
      expect(locked.body).toMatchObject({
        code: 'EXPENSE_LOCKED',
        details: { lockedFields: ['tripId'] },
      });
    });
  });

  describe('여정에서 추가', () => {
    it('creates a shared expense with the default split in the trip currency (JPY fx)', async () => {
      const seed = await seedOngoing();
      const res = await addTripExpense(seed, '준용', { amount: '3000' }).expect(
        201,
      );
      const body = res.body as ExpenseDetailResponse;
      expect(body).toMatchObject({
        status: 'SHARED',
        origin: 'MANUAL',
        merchantName: '결제',
        originalAmount: '3000',
        originalCurrency: 'JPY',
        krwAmount: 27580,
        walletEntryId: null,
        createdByMembershipId: mid(seed, '준용'),
        fx: { rate: '9.192', policy: 'SPOT_AT_PAYMENT' },
      });
      expect(body.shares.map((s) => s.membershipId).sort()).toEqual(
        ['준용', '민지', '태현'].map((n) => mid(seed, n)).sort(),
      );
      expect(body.shares.reduce((sum, s) => sum + s.amountKrw, 0)).toBe(27580);
      const other = (await detail(seed, '민지', body.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(other.permissions).toMatchObject({
        canEdit: false,
        reason: 'NOT_AUTHOR',
      });
      // 지갑 기록을 켜지 않았으니 지갑에는 없다
      expect((await walletList(seed, '준용')).items).toEqual([]);
    });

    it('creates a personal expense when only the payer shares it', async () => {
      const seed = await seedOngoing();
      const res = await addTripExpense(seed, '준용', {
        amount: '500',
        memo: '편의점',
        participantMembershipIds: [mid(seed, '준용')],
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'PERSONAL',
        merchantName: '편의점',
      });
      await detail(seed, '민지', res.body.id).expect(404);
    });

    it('records the payment in my wallet only when addToWallet is on', async () => {
      const seed = await seedOngoing();
      const withWallet = (
        await addTripExpense(seed, '준용', {
          amount: '12000',
          currency: 'KRW',
          memo: '택시',
          addToWallet: true,
        }).expect(201)
      ).body as ExpenseDetailResponse;
      expect(withWallet.walletEntryId).not.toBeNull();
      const without = (
        await addTripExpense(seed, '준용', {
          amount: '4000',
          currency: 'KRW',
          addToWallet: false,
        }).expect(201)
      ).body as ExpenseDetailResponse;
      expect(without.walletEntryId).toBeNull();

      const wallet = await walletList(seed, '준용');
      expect(wallet.items).toHaveLength(1);
      expect(wallet.items[0]).toMatchObject({
        id: withWallet.walletEntryId,
        memo: '택시',
        amount: '12000',
        currency: 'KRW',
        krwAmount: 12000,
        linkedTrip: {
          tripId: seed.tripId,
          expenseId: withWallet.id,
          expenseStatus: 'SHARED',
        },
      });

      // 지갑 기록이 있는 결제는 결제자가 나로 고정(Q-49)
      const payer = await request(server())
        .patch(`/api/trips/${seed.tripId}/expenses/${withWallet.id}`)
        .set(as(seed, '준용'))
        .send({
          version: withWallet.version,
          payerMembershipId: mid(seed, '민지'),
        })
        .expect(400);
      expect(payer.body.details.fields[0].code).toBe('walletLinked');

      // 여정에서 고치면 지갑 항목에도 반영된다
      await request(server())
        .patch(`/api/trips/${seed.tripId}/expenses/${withWallet.id}`)
        .set(as(seed, '준용'))
        .send({ version: withWallet.version, amount: '13000' })
        .expect(200);
      expect((await walletList(seed, '준용')).items[0]).toMatchObject({
        amount: '13000',
        krwAmount: 13000,
      });

      // 여정에서 지우면 지갑 항목은 남고 연결만 끊긴다
      const current = (await detail(seed, '준용', withWallet.id).expect(200))
        .body as ExpenseDetailResponse;
      await request(server())
        .delete(`/api/trips/${seed.tripId}/expenses/${withWallet.id}`)
        .query({ version: current.version })
        .set(as(seed, '준용'))
        .expect(204);
      expect((await walletList(seed, '준용')).items[0]).toMatchObject({
        id: withWallet.walletEntryId,
        linkedTrip: null,
      });
    });

    it('lets me record a payment someone else made, but not into my wallet or as their personal payment', async () => {
      const seed = await seedOngoing();
      const wallet = await addTripExpense(seed, '준용', {
        amount: '900',
        currency: 'KRW',
        payerMembershipId: mid(seed, '민지'),
        addToWallet: true,
      }).expect(400);
      expect(wallet.body.details.fields[0]).toMatchObject({
        path: 'addToWallet',
        code: 'payerNotMe',
      });
      const personal = await addTripExpense(seed, '준용', {
        amount: '900',
        currency: 'KRW',
        payerMembershipId: mid(seed, '민지'),
        participantMembershipIds: [mid(seed, '민지')],
      }).expect(400);
      expect(personal.body.details.fields[0].code).toBe('othersPersonal');

      const created = (
        await addTripExpense(seed, '준용', {
          amount: '1000',
          currency: 'KRW',
          payerMembershipId: mid(seed, '민지'),
        }).expect(201)
      ).body as ExpenseDetailResponse;
      expect(created).toMatchObject({
        status: 'SHARED',
        createdByMembershipId: mid(seed, '준용'),
        permissions: { canEdit: true, isPayer: false, isAuthor: true },
      });
      expect(created.payer.membershipId).toBe(mid(seed, '민지'));
      expect(created.remainderHolderMembershipId).toBe(mid(seed, '민지'));

      const outsider = await addTripExpense(seed, '준용', {
        amount: '900',
        currency: 'KRW',
        payerMembershipId: randomUUID(),
      }).expect(400);
      expect(outsider.body.code).toBe('PARTICIPANT_NOT_MEMBER');

      // 결제자라도 작성자가 아니면 바꿀 수 없다
      const payerView = (await detail(seed, '민지', created.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(payerView.permissions).toMatchObject({
        canEdit: false,
        reason: 'NOT_AUTHOR',
        isPayer: true,
        isAuthor: false,
      });
      const denied = await request(server())
        .patch(`/api/trips/${seed.tripId}/expenses/${created.id}`)
        .set(as(seed, '민지'))
        .send({ version: created.version, memo: '저녁' })
        .expect(403);
      expect(denied.body.code).toBe('NOT_AUTHOR');
      await classify(seed, '민지', created.id, {
        status: 'PERSONAL',
        version: created.version,
        confirmSharedToPersonal: true,
      }).expect(403);
      // 작성자도 남의 결제를 개인으로 돌릴 수는 없다
      const toPersonal = await classify(seed, '준용', created.id, {
        status: 'PERSONAL',
        version: created.version,
        confirmSharedToPersonal: true,
      }).expect(400);
      expect(toPersonal.body.details.fields[0].code).toBe('othersPersonal');
    });

    it('edits and deletes a manual expense with version checks', async () => {
      const seed = await seedOngoing();
      const created = (
        await addTripExpense(seed, '준용', {
          amount: '30000',
          currency: 'KRW',
        }).expect(201)
      ).body as ExpenseDetailResponse;
      const patch = (body: object) =>
        request(server())
          .patch(`/api/trips/${seed.tripId}/expenses/${created.id}`)
          .set(as(seed, '준용'))
          .send(body);

      const confirm = await patch({
        version: created.version,
        participantMembershipIds: [mid(seed, '준용')],
      }).expect(409);
      expect(confirm.body.code).toBe('SHARED_TO_PERSONAL_CONFIRM_REQUIRED');
      const personal = (
        await patch({
          version: created.version,
          participantMembershipIds: [mid(seed, '준용')],
          confirmSharedToPersonal: true,
        }).expect(200)
      ).body as ExpenseDetailResponse;
      expect(personal).toMatchObject({
        status: 'PERSONAL',
        version: created.version + 1,
      });
      await detail(seed, '민지', created.id).expect(404);

      const back = (
        await patch({
          version: personal.version,
          participantMembershipIds: [mid(seed, '준용'), mid(seed, '민지')],
          memo: '숙소',
          occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
        }).expect(200)
      ).body as ExpenseDetailResponse;
      expect(back).toMatchObject({
        status: 'SHARED',
        merchantName: '숙소',
        perPersonKrw: 15000,
      });

      const stale = await patch({ version: created.version, memo: 'x' }).expect(
        409,
      );
      expect(stale.body.code).toBe('VERSION_CONFLICT');
      expect(stale.body.details.current.id).toBe(created.id);

      await request(server())
        .delete(`/api/trips/${seed.tripId}/expenses/${created.id}`)
        .query({ version: created.version })
        .set(as(seed, '준용'))
        .expect(409);
      await request(server())
        .delete(`/api/trips/${seed.tripId}/expenses/${created.id}`)
        .query({ version: back.version })
        .set(as(seed, '준용'))
        .expect(204);
      await detail(seed, '민지', created.id).expect(404);
    });

    it('rejects edits of imported expenses', async () => {
      const seed = await fx.seedTrip(['준용', '민지']);
      const imported = await fx.addExpense(seed, '준용', {
        status: 'PENDING',
        at: '2026-11-13 14:10',
        merchant: 'MK택시',
        amount: '2860',
        krw: 26290,
      });
      const res = await request(server())
        .patch(`/api/trips/${seed.tripId}/expenses/${imported.id}`)
        .set(as(seed, '준용'))
        .send({ version: 0, memo: '택시' })
        .expect(409);
      expect(res.body.code).toBe('NOT_MANUAL_ENTRY');
    });

    it('allows upcoming trips and rejects ended trips', async () => {
      const upcoming = await fx.seedTrip(['준용', '민지'], {
        status: 'UPCOMING',
        period: { start: kstDay(5), end: kstDay(7) },
        withPaymentMethod: false,
      });
      const created = (
        await addTripExpense(upcoming, '준용', {
          amount: '50000',
          currency: 'KRW',
          memo: '숙소 예약',
        }).expect(201)
      ).body as ExpenseDetailResponse;
      // 시작 전 결제는 여정 전 그룹으로 보이고 작성자가 바꿀 수 있다
      expect(created).toMatchObject({
        status: 'SHARED',
        periodSide: 'BEFORE',
        permissions: { canEdit: true, reason: null },
      });
      const listed = (
        await request(server())
          .get(`/api/trips/${upcoming.tripId}/expenses`)
          .set(as(upcoming, '민지'))
          .expect(200)
      ).body as ExpenseListResponse;
      expect(listed.items.map((i) => i.id)).toEqual([created.id]);

      const ended = await seedOngoing(['준용', '민지']);
      await fx.endTrip(ended.tripId);
      const res = await addTripExpense(ended, '준용', {
        amount: '1000',
        currency: 'KRW',
      }).expect(409);
      expect(res.body.code).toBe('TRIP_PHASE_INVALID');
    });

    it('returns the first result again for the same clientRequestId', async () => {
      const seed = await seedOngoing();
      const clientRequestId = randomUUID();
      const body = { amount: '1000', currency: 'KRW', clientRequestId };
      const first = await addTripExpense(seed, '준용', body).expect(201);
      const again = await addTripExpense(seed, '준용', body).expect(201);
      expect(again.body.id).toBe(first.body.id);
      expect(
        await prisma.expense.count({ where: { tripId: seed.tripId } }),
      ).toBe(1);
    });
  });

  describe('중복 의심(Q-42, FR-407·511)', () => {
    it('flags manual expenses with the same KRW amount within 30 minutes regardless of payer, and the author dismisses', async () => {
      const seed = await seedOngoing();
      const a = (
        await addTripExpense(seed, '준용', {
          amount: '30000',
          currency: 'KRW',
          memo: '저녁',
          occurredAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        }).expect(201)
      ).body as ExpenseDetailResponse;
      expect(a.duplicate).toBeNull();
      // 민지가 같은 저녁을 따로 기록(내용·시각이 달라도 같은 원화·30분 안)
      const b = (
        await addTripExpense(seed, '민지', {
          amount: '30000',
          currency: 'KRW',
          memo: '고기집',
        }).expect(201)
      ).body as ExpenseDetailResponse;
      expect(b.duplicate).not.toBeNull();
      expect(b.flags.duplicateSuspected).toBe(true);
      const aNow = (await detail(seed, '준용', a.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(aNow.duplicate?.groupId).toBe(b.duplicate?.groupId);
      // 같은 결제자라도 묶는다
      const c = (
        await addTripExpense(seed, '준용', {
          amount: '30000',
          currency: 'KRW',
          occurredAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        }).expect(201)
      ).body as ExpenseDetailResponse;
      expect(c.duplicate?.groupId).toBe(b.duplicate?.groupId);
      // 30분 밖이면 묶지 않는다
      const far = (
        await addTripExpense(seed, '태현', {
          amount: '30000',
          currency: 'KRW',
          occurredAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        }).expect(201)
      ).body as ExpenseDetailResponse;
      expect(far.duplicate).toBeNull();

      // 금액을 바꾸면 다시 판정해 묶음에서 빠진다
      const cNow = (await detail(seed, '준용', c.id).expect(200))
        .body as ExpenseDetailResponse;
      const edited = (
        await request(server())
          .patch(`/api/trips/${seed.tripId}/expenses/${c.id}`)
          .set(as(seed, '준용'))
          .send({ version: cNow.version, amount: '31000' })
          .expect(200)
      ).body as ExpenseDetailResponse;
      expect(edited.duplicate).toBeNull();

      // 표시 해제는 작성자가(민지의 결제 → 민지)
      const bNow = (await detail(seed, '민지', b.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(bNow.duplicate?.canDismiss).toBe(true);
      await request(server())
        .post(`/api/trips/${seed.tripId}/expenses/${b.id}/duplicate-dismissal`)
        .set(as(seed, '태현'))
        .send({ version: bNow.version })
        .expect(403);
      await request(server())
        .post(`/api/trips/${seed.tripId}/expenses/${b.id}/duplicate-dismissal`)
        .set(as(seed, '민지'))
        .send({ version: bNow.version })
        .expect(200);
      const after = (await detail(seed, '준용', a.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(after.flags.duplicateSuspected).toBe(false);
    });
  });

  describe('정산·종료', () => {
    it('counts manual shared expenses in the summary', async () => {
      const seed = await seedOngoing();
      await addTripExpense(seed, '준용', {
        amount: '30000',
        currency: 'KRW',
      }).expect(201);
      await addTripExpense(seed, '민지', {
        amount: '6000',
        currency: 'KRW',
      }).expect(201);
      // 개인 결제는 공동 지출에 넣지 않는다
      await addTripExpense(seed, '준용', {
        amount: '9000',
        currency: 'KRW',
        participantMembershipIds: [mid(seed, '준용')],
      }).expect(201);
      const summary = (
        await request(server())
          .get(`/api/trips/${seed.tripId}/summary`)
          .set(as(seed, '준용'))
          .expect(200)
      ).body as TripSummary;
      expect(summary.sharedTotalKrw).toBe(36000);
      // 준용: 30000 냄 − 12000 부담 = +18000
      expect(summary.me.netKrw).toBe(18000);
    });

    it('keeps an ended trip ledger: memo-only wallet edits, and deleting the entry keeps the shared expense', async () => {
      const seed = await seedOngoing();
      const created = (
        await addEntry(seed, '준용', {
          amount: '30000',
          currency: 'KRW',
          memo: '저녁',
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      const expenseId = created.linkedExpense!.id;
      await classify(seed, '준용', expenseId, {
        status: 'SHARED',
        version: created.linkedExpense!.version,
      }).expect(200);
      await fx.endTrip(seed.tripId);

      const settlement = (
        await request(server())
          .get(`/api/trips/${seed.tripId}/settlement`)
          .set(as(seed, '민지'))
          .expect(200)
      ).body as SettlementView;
      expect(settlement).toMatchObject({
        totalSharedKrw: 30000,
        sharedCount: 1,
      });

      const locked = await request(server())
        .patch(`/api/wallet/entries/${created.entry.id}`)
        .set(as(seed, '준용'))
        .send({ version: created.entry.version, amount: '40000' })
        .expect(409);
      expect(locked.body).toMatchObject({
        code: 'EXPENSE_LOCKED',
        details: { lockedFields: ['amount', 'currency', 'occurredAt'] },
      });

      const memo = (
        await request(server())
          .patch(`/api/wallet/entries/${created.entry.id}`)
          .set(as(seed, '준용'))
          .send({ version: created.entry.version, memo: '야키니쿠' })
          .expect(200)
      ).body as WalletEntryMutationResponse;
      expect(memo.entry).toMatchObject({
        memo: '야키니쿠',
        editableFields: ['memo'],
        canChangeTrip: false,
        linkedTrip: { tripStatus: 'ENDED', expenseStatus: 'SHARED' },
      });
      // 종료된 여정 장부는 바꾸지 않는다
      expect(memo.linkedExpense?.merchantName).toBe('저녁');

      await request(server())
        .delete(`/api/wallet/entries/${created.entry.id}`)
        .set(as(seed, '준용'))
        .expect(204);
      const kept = (await detail(seed, '민지', expenseId).expect(200))
        .body as ExpenseDetailResponse;
      expect(kept).toMatchObject({ status: 'SHARED', krwAmount: 30000 });
      const own = (await detail(seed, '준용', expenseId).expect(200))
        .body as ExpenseDetailResponse;
      expect(own.walletEntryId).toBeNull();
    });
  });

  describe('결제수단 0개 규칙(S4)과의 관계', () => {
    it('keeps manual personal expenses when moving shared → personal without payment methods', async () => {
      const seed = await seedOngoing();
      const created = (
        await addTripExpense(seed, '준용', {
          amount: '10000',
          currency: 'KRW',
        }).expect(201)
      ).body as ExpenseDetailResponse;
      // 가져온 결제라면 204(삭제)지만 직접 입력은 개인 결제로 남는다
      const res = await classify(seed, '준용', created.id, {
        status: 'PERSONAL',
        version: created.version,
        confirmSharedToPersonal: true,
      }).expect(200);
      expect(res.body.status).toBe('PERSONAL');
    });

    it('purges only provider data when all payment methods are removed', async () => {
      const seed = await fx.seedTrip(['준용', '민지'], {
        period: { start: kstDay(-1), end: kstDay(2) },
      });
      const provider = await fx.addTransaction(seed.members['준용'], {
        at: new Date(),
        merchant: 'MK택시',
        amount: '2860',
      });
      const manual = (
        await addEntry(seed, '준용', {
          amount: '20000',
          currency: 'KRW',
          memo: '시장',
        }).expect(201)
      ).body as WalletEntryMutationResponse;
      await prisma.$transaction((tx) =>
        purgeAllFinancialData(tx, seed.members['준용'].userId, () => null),
      );
      expect(
        await prisma.transaction.findUnique({ where: { id: provider.id } }),
      ).toBeNull();
      expect(
        await prisma.transaction.findUnique({ where: { id: manual.entry.id } }),
      ).not.toBeNull();
      await detail(seed, '준용', manual.linkedExpense!.id).expect(200);
    });
  });
});
