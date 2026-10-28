import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  ExpenseDetailResponse,
  ExpenseListResponse,
  ExpenseRow,
} from '@yeojeong/shared';
import request from 'supertest';
import { ExpenseLifecycleService } from './../src/expenses/expense-lifecycle.service.js';
import { ExpenseStatsService } from './../src/expenses/expense-stats.service.js';
import { TRIP_ENDED_EVENT } from './../src/expenses/trip-ended.listener.js';
import type { PrismaClient } from './../src/generated/prisma/client.js';
import {
  createDbTestApp,
  createFixturePrisma,
  ExpenseFixtures,
  kst,
  reachableDatabaseUrl,
  type SeedTrip,
} from './expenses-fixtures.js';

// 실제 DB e2e. 로컬: pnpm db:up + db:migrate:deploy. DB가 없으면(CI) 건너뛴다.
const databaseUrl = await reachableDatabaseUrl();

describe.skipIf(!databaseUrl)('Expenses (e2e, real DB)', () => {
  let prisma: PrismaClient;
  let fx: ExpenseFixtures;
  let app: NestExpressApplication;
  let auth: Awaited<ReturnType<typeof createDbTestApp>>['auth'];

  beforeAll(async () => {
    prisma = createFixturePrisma(databaseUrl as string);
    fx = new ExpenseFixtures(prisma);
    ({ app, auth } = await createDbTestApp(prisma));
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app?.close();
    await prisma?.$disconnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
  const list = async (seed: SeedTrip, name: string, query = '') =>
    (
      await request(server())
        .get(`/api/trips/${seed.tripId}/expenses${query}`)
        .set(as(seed, name))
        .expect(200)
    ).body as ExpenseListResponse;
  const detail = (seed: SeedTrip, name: string, id: string) =>
    request(server())
      .get(`/api/trips/${seed.tripId}/expenses/${id}`)
      .set(as(seed, name));
  const classify = (seed: SeedTrip, name: string, id: string, body: object) =>
    request(server())
      .put(`/api/trips/${seed.tripId}/expenses/${id}/classification`)
      .set(as(seed, name))
      .send(body);
  const names = (items: ExpenseRow[]) => items.map((i) => i.merchantName);

  /** WF-18 샘플(11.13 Day 2) + 환불 묶음 */
  async function seedOsaka() {
    const seed = await fx.seedTrip();
    const all = ['준용', '민지', '태현', '수빈'];
    const e = {
      familyMart: await fx.addExpense(seed, '준용', {
        status: 'PENDING',
        at: '2026-11-13 08:50',
        merchant: '패밀리마트 난바역점',
        amount: '1280',
        krw: 11770,
      }),
      osakaCastle: await fx.addExpense(seed, '수빈', {
        status: 'SHARED',
        at: '2026-11-13 10:30',
        merchant: '오사카성 천수각',
        amount: '4800',
        krw: 44120,
        participants: all,
      }),
      mkTaxi: await fx.addExpense(seed, '준용', {
        status: 'SHARED',
        at: '2026-11-13 14:10',
        merchant: 'MK택시',
        amount: '2860',
        krw: 26290,
        participants: ['준용', '민지'],
      }),
      umeda: await fx.addExpense(seed, '민지', {
        status: 'SHARED',
        at: '2026-11-13 16:40',
        merchant: '우메다 스카이빌딩 공중정원',
        amount: '8000',
        krw: 73540,
        participants: all,
      }),
      horai: await fx.addExpense(seed, '준용', {
        status: 'PENDING',
        at: '2026-11-13 18:20',
        merchant: '551 호라이 난바본점',
        amount: '2800',
        krw: 25740,
      }),
      donki: await fx.addExpense(seed, '준용', {
        status: 'PERSONAL',
        at: '2026-11-12 17:40',
        merchant: '돈키호테 도톤보리점',
        amount: '8640',
        krw: 79420,
      }),
      ichiran: await fx.addExpense(seed, '준용', {
        status: 'SHARED',
        at: '2026-11-12 13:05',
        merchant: '이치란 라멘',
        amount: '3960',
        krw: 36400,
        participants: all,
      }),
      pass: await fx.addExpense(seed, '태현', {
        status: 'SHARED',
        at: '2026-11-13 09:40',
        merchant: '오사카 주유패스 (4매)',
        amount: '13200',
        krw: 121330,
        participants: all,
      }),
    };
    const refund = await fx.addRefund(seed, e.pass.id, {
      at: '2026-11-13 12:15',
      amount: '-13200',
      krw: -121330,
    });
    return { seed, e, refund };
  }

  describe('조회와 가시성 (FR-501~503, 4-2)', () => {
    it('shows pending and personal expenses only to the payer', async () => {
      const { seed, e, refund } = await seedOsaka();

      const mine = await list(seed, '준용');
      expect(names(mine.items)).toEqual([
        '551 호라이 난바본점',
        '우메다 스카이빌딩 공중정원',
        'MK택시',
        '오사카성 천수각',
        '오사카 주유패스 (4매)',
        '패밀리마트 난바역점',
        '돈키호테 도톤보리점',
        '이치란 라멘',
      ]);
      expect(mine.pendingCount).toBe(2);
      expect(mine.showOutOfPeriodEntry).toBe(true);
      expect(mine.period).toMatchObject({
        startDate: '2026-11-12',
        endDate: '2026-11-15',
        days: 4,
      });
      expect(mine.items[0]).toMatchObject({
        status: 'PENDING',
        localDate: '2026-11-13',
        dayIndex: 2,
        occurredAt: '2026-11-13T18:20:00+09:00',
        payer: { nickname: '준용', isMe: true },
        participants: null,
        originalAmount: '2800',
        originalCurrency: 'JPY',
      });

      const minji = await list(seed, '민지');
      expect(names(minji.items)).toEqual([
        '우메다 스카이빌딩 공중정원',
        'MK택시',
        '오사카성 천수각',
        '오사카 주유패스 (4매)',
        '이치란 라멘',
      ]);
      expect(minji.pendingCount).toBe(0);
      const taxi = minji.items.find((i) => i.id === e.mkTaxi.id);
      expect(taxi?.participants?.map((p) => p.nickname)).toEqual([
        '민지',
        '준용',
      ]);
      expect(taxi?.participants?.[0].isMe).toBe(true);

      // 환불 묶음: 자식은 부모 안에만, 순액·원 결제 원화
      const bundle = minji.items.find((i) => i.id === e.pass.id);
      expect(bundle).toMatchObject({
        krwAmount: 0,
        grossKrwAmount: 121330,
        netOriginalAmount: '0',
        flags: { hasRefund: true },
        refunds: [
          {
            id: refund.id,
            krwAmount: -121330,
            occurredAt: '2026-11-13T12:15:00+09:00',
          },
        ],
      });
      expect(minji.items.some((i) => i.id === refund.id)).toBe(false);

      // 확인 필요만
      expect(
        names((await list(seed, '준용', '?status=PENDING')).items),
      ).toEqual(['551 호라이 난바본점', '패밀리마트 난바역점']);
      expect((await list(seed, '민지', '?status=PENDING')).items).toEqual([]);
    });

    it('returns 404 for hidden expenses and hides the payment method from others', async () => {
      const { seed, e, refund } = await seedOsaka();
      await detail(seed, '민지', e.horai.id).expect(404);
      await detail(seed, '민지', e.donki.id).expect(404);
      await detail(seed, '준용', refund.id).expect(404);
      await detail(seed, '준용', 'not-a-uuid').expect(404);

      const other = await fx.seedTrip(['외부인']);
      await request(server())
        .get(`/api/trips/${seed.tripId}/expenses/${e.mkTaxi.id}`)
        .set(as(other, '외부인'))
        .expect(404);
      // 다른 여정 ID로 이 결제를 찾을 수 없다
      await request(server())
        .get(`/api/trips/${other.tripId}/expenses/${e.mkTaxi.id}`)
        .set(as(other, '외부인'))
        .expect(404);

      const readOnly = (await detail(seed, '민지', e.mkTaxi.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(readOnly).toMatchObject({
        paymentMethodLabel: null,
        permissions: { canEdit: false, reason: 'NOT_PAYER', isPayer: false },
        perPersonKrw: 13145,
        participantCandidates: null,
      });

      const own = (await detail(seed, '준용', e.horai.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(own).toMatchObject({
        paymentMethodLabel: '토스뱅크 체크카드 1934',
        permissions: { canEdit: true, reason: null, isPayer: true },
        status: 'PENDING',
        defaultParticipantMembershipIds: ['준용', '민지', '태현', '수빈'].map(
          (n) => seed.members[n].membershipId,
        ),
      });
      expect(own.participantCandidates?.[0]).toMatchObject({
        nickname: '준용',
        isMe: true,
      });

      // 접근 기록(내용 없이 ID만)
      const logs = await prisma.accessLog.findMany({
        where: {
          userId: seed.members['준용'].userId,
          action: 'VIEW_EXPENSE_DETAIL',
        },
      });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('pages with a cursor and serves the timeline by day', async () => {
      const { seed } = await seedOsaka();
      const first = await list(seed, '준용', '?limit=3');
      expect(first.items).toHaveLength(3);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await list(
        seed,
        '준용',
        `?limit=3&cursor=${first.nextCursor}`,
      );
      const third = await list(
        seed,
        '준용',
        `?limit=3&cursor=${second.nextCursor}`,
      );
      expect(third.nextCursor).toBeNull();
      expect(names([...first.items, ...second.items, ...third.items])).toEqual(
        names((await list(seed, '준용')).items),
      );

      const day2 = await list(seed, '준용', '?day=2&order=asc');
      expect(names(day2.items)).toEqual([
        '패밀리마트 난바역점',
        '오사카 주유패스 (4매)',
        '오사카성 천수각',
        'MK택시',
        '우메다 스카이빌딩 공중정원',
        '551 호라이 난바본점',
      ]);
      expect((await list(seed, '준용', '?day=5')).items).toEqual([]);

      const bad = await request(server())
        .get(`/api/trips/${seed.tripId}/expenses?cursor=garbage&limit=500`)
        .set(as(seed, '준용'))
        .expect(400);
      expect(bad.body.code).toBe('VALIDATION_FAILED');
    });

    it('locks the expense tab before the trip starts', async () => {
      const seed = await fx.seedTrip(['준용'], { status: 'UPCOMING' });
      const res = await request(server())
        .get(`/api/trips/${seed.tripId}/expenses`)
        .set(as(seed, '준용'))
        .expect(409);
      expect(res.body.code).toBe('TRIP_PHASE_INVALID');
    });
  });

  describe('분류·분담 (FR-504~510)', () => {
    it('confirms, changes participants and switches between shared and personal', async () => {
      const { seed, e } = await seedOsaka();
      const m = (n: string) => seed.members[n].membershipId;

      // 미확정 → 공동(전원, 부담 인원 생략 = 활성 멤버 전원)
      let res = await classify(seed, '준용', e.horai.id, {
        status: 'SHARED',
        version: 0,
      }).expect(200);
      let body = res.body as ExpenseDetailResponse;
      expect(body).toMatchObject({
        status: 'SHARED',
        perPersonKrw: 6435,
        remainderKrw: 0,
        version: 1,
      });
      expect(body.shares.map((s) => s.amountKrw)).toEqual([
        6435, 6435, 6435, 6435,
      ]);
      let minjiRow = (await list(seed, '민지')).items.find(
        (i) => i.id === e.horai.id,
      );
      expect(minjiRow?.flags.changed).toBe(false);
      expect((await list(seed, '준용')).pendingCount).toBe(1);

      // 같은 요청은 멱등(버전이 낡아도 200, 변경 없음)
      res = await classify(seed, '준용', e.horai.id, {
        status: 'SHARED',
        version: 0,
      }).expect(200);
      expect(res.body.version).toBe(1);

      // 부담 인원 4 → 3(수빈 해제): 다른 멤버에게 "변경됨"
      res = await classify(seed, '준용', e.horai.id, {
        status: 'SHARED',
        participantMembershipIds: [m('준용'), m('민지'), m('태현')],
        version: 1,
      }).expect(200);
      expect(res.body).toMatchObject({ perPersonKrw: 8580, version: 2 });
      minjiRow = (await list(seed, '민지')).items.find(
        (i) => i.id === e.horai.id,
      );
      expect(minjiRow?.flags.changed).toBe(true);
      expect(minjiRow?.participants?.map((p) => p.nickname)).toEqual([
        '민지',
        '준용',
        '태현',
      ]);
      expect(
        (await list(seed, '준용')).items.find((i) => i.id === e.horai.id)?.flags
          .changed,
      ).toBe(false);

      // 낡은 version → 409 + 최신 리소스
      res = await classify(seed, '준용', e.horai.id, {
        status: 'SHARED',
        participantMembershipIds: [m('준용'), m('민지')],
        version: 1,
      }).expect(409);
      expect(res.body.code).toBe('VERSION_CONFLICT');
      expect(res.body.details.current).toMatchObject({
        id: e.horai.id,
        version: 2,
        perPersonKrw: 8580,
      });

      // 공동 → 개인은 확인이 필요하다
      res = await classify(seed, '준용', e.horai.id, {
        status: 'PERSONAL',
        version: 2,
      }).expect(409);
      expect(res.body.code).toBe('SHARED_TO_PERSONAL_CONFIRM_REQUIRED');
      res = await classify(seed, '준용', e.horai.id, {
        status: 'PERSONAL',
        version: 2,
        confirmSharedToPersonal: true,
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'PERSONAL',
        shares: [],
        perPersonKrw: null,
        participants: null,
      });
      expect(
        (await list(seed, '민지')).items.some((i) => i.id === e.horai.id),
      ).toBe(false);
      await detail(seed, '민지', e.horai.id).expect(404);
      expect(
        await prisma.expenseShare.count({ where: { expenseId: e.horai.id } }),
      ).toBe(0);

      // 개인 → 공동(예전에 공개된 적 있음 → 변경됨)
      res = await classify(seed, '준용', e.horai.id, {
        status: 'SHARED',
        version: 3,
      }).expect(200);
      minjiRow = (await list(seed, '민지')).items.find(
        (i) => i.id === e.horai.id,
      );
      expect(minjiRow?.flags.changed).toBe(true);

      const logs = await prisma.expenseChangeLog.findMany({
        where: { expenseId: e.horai.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'CONFIRM_SHARED',
        'PARTICIPANTS_CHANGED',
        'SHARED_TO_PERSONAL',
        'PERSONAL_TO_SHARED',
      ]);
      expect(logs[1]).toMatchObject({
        actorMembershipId: m('준용'),
        before: {
          status: 'SHARED',
          participantIds: [m('준용'), m('민지'), m('태현'), m('수빈')],
          netKrwAmount: 25740,
          perPersonKrw: 6435,
        },
        after: {
          status: 'SHARED',
          participantIds: [m('준용'), m('민지'), m('태현')],
          netKrwAmount: 25740,
          perPersonKrw: 8580,
        },
      });
    });

    it('confirms personal, first-time shared without "변경됨", and the remainder to the payer', async () => {
      const { seed, e } = await seedOsaka();
      const m = (n: string) => seed.members[n].membershipId;
      await classify(seed, '준용', e.familyMart.id, {
        status: 'PERSONAL',
        version: 0,
      })
        .expect(200)
        .expect((r) => expect(r.body.status).toBe('PERSONAL'));
      expect(
        (await list(seed, '민지')).items.some((i) => i.id === e.familyMart.id),
      ).toBe(false);

      // 개인 → 공동(처음 공개): 변경됨 없음
      await classify(seed, '준용', e.donki.id, {
        status: 'SHARED',
        version: 0,
      }).expect(200);
      const donki = (await list(seed, '민지')).items.find(
        (i) => i.id === e.donki.id,
      );
      expect(donki).toMatchObject({
        flags: { changed: false },
        krwAmount: 79420,
      });

      // MK택시 2 → 4명: 1인 6,572 + 결제자 +2원
      const res = await classify(seed, '준용', e.mkTaxi.id, {
        status: 'SHARED',
        participantMembershipIds: [m('민지'), m('준용'), m('태현'), m('수빈')],
        version: 0,
      }).expect(200);
      expect(res.body).toMatchObject({
        perPersonKrw: 6572,
        remainderKrw: 2,
        remainderHolderMembershipId: m('준용'),
      });
      const shares = await prisma.expenseShare.findMany({
        where: { expenseId: e.mkTaxi.id },
      });
      expect(shares.find((s) => s.membershipId === m('준용'))?.amountKrw).toBe(
        6574,
      );
      expect(shares.reduce((sum, s) => sum + s.amountKrw, 0)).toBe(26290);
    });

    it('rejects non-payers, empty or foreign participants', async () => {
      const { seed, e } = await seedOsaka();
      let res = await classify(seed, '민지', e.mkTaxi.id, {
        status: 'PERSONAL',
        version: 0,
        confirmSharedToPersonal: true,
      }).expect(403);
      expect(res.body.code).toBe('NOT_PAYER');
      await classify(seed, '민지', e.horai.id, {
        status: 'SHARED',
        version: 0,
      }).expect(404);

      res = await classify(seed, '준용', e.horai.id, {
        status: 'SHARED',
        participantMembershipIds: [],
        version: 0,
      }).expect(400);
      expect(res.body.code).toBe('PARTICIPANTS_REQUIRED');

      const outsider = await fx.seedTrip(['외부인']);
      res = await classify(seed, '준용', e.horai.id, {
        status: 'SHARED',
        participantMembershipIds: [
          seed.members['준용'].membershipId,
          outsider.members['외부인'].membershipId,
        ],
        version: 0,
      }).expect(400);
      expect(res.body).toMatchObject({
        code: 'PARTICIPANT_NOT_MEMBER',
        details: {
          invalidMembershipIds: [outsider.members['외부인'].membershipId],
        },
      });

      res = await classify(seed, '준용', e.horai.id, {
        status: 'PENDING',
        version: 0,
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('blocks sharing a transaction already shared in another trip', async () => {
      const a = await fx.seedTrip(['준용', '민지']);
      const users = {
        준용: a.members['준용'].userId,
        민지: a.members['민지'].userId,
      };
      const b = await fx.seedTrip(['준용', '민지'], { users });
      const tx = await fx.addTransaction(a.members['준용'], {
        at: kst('2026-11-13 12:00'),
        merchant: '공항 리무진',
        amount: '1600',
      });
      const inA = await fx.addExpense(a, '준용', {
        status: 'PENDING',
        at: '2026-11-13 12:00',
        merchant: '공항 리무진',
        amount: '1600',
        krw: 14710,
        transactionId: tx.id,
      });
      await fx.addExpense(b, '준용', {
        status: 'SHARED',
        at: '2026-11-13 12:00',
        merchant: '공항 리무진',
        amount: '1600',
        krw: 14710,
        transactionId: tx.id,
        participants: ['준용', '민지'],
      });
      const res = await classify(a, '준용', inA.id, {
        status: 'SHARED',
        version: 0,
      }).expect(409);
      expect(res.body.code).toBe('SHARED_IN_OTHER_TRIP');
      await classify(a, '준용', inA.id, {
        status: 'PERSONAL',
        version: 0,
      }).expect(200);
    });
  });

  describe('잠금 (FR-512, 나간 멤버)', () => {
    it('locks shared expenses of a member who left and keeps their share removable only', async () => {
      const { seed, e } = await seedOsaka();
      await fx.leave(seed.members['수빈'].membershipId);

      // 나간 멤버는 여정의 어떤 API도 404
      await request(server())
        .get(`/api/trips/${seed.tripId}/expenses`)
        .set(as(seed, '수빈'))
        .expect(404);

      const castle = (await detail(seed, '민지', e.osakaCastle.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(castle.permissions).toEqual({
        canEdit: false,
        reason: 'PAYER_LEFT',
        isPayer: false,
      });
      expect(castle.payer).toMatchObject({ nickname: '수빈', isLeft: true });

      // 이치란(준용 결제, 수빈 포함): 토글에 수빈이 흐리게 남고 해제만 가능
      const ichiran = (await detail(seed, '준용', e.ichiran.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(
        ichiran.participantCandidates?.find((c) => c.nickname === '수빈'),
      ).toMatchObject({ isLeft: true });
      const m = (n: string) => seed.members[n].membershipId;
      await classify(seed, '준용', e.ichiran.id, {
        status: 'SHARED',
        participantMembershipIds: [
          m('준용'),
          m('민지'),
          m('태현'),
          m('수빈'),
        ].slice(0, 3),
        version: 0,
      }).expect(200);
      const res = await classify(seed, '준용', e.ichiran.id, {
        status: 'SHARED',
        participantMembershipIds: [m('준용'), m('수빈')],
        version: 1,
      }).expect(400);
      expect(res.body.code).toBe('PARTICIPANT_NOT_MEMBER');

      // 새 공동 확정의 기본값(전원)에는 나간 멤버가 없다
      const horai = await classify(seed, '준용', e.horai.id, {
        status: 'SHARED',
        version: 0,
      }).expect(200);
      expect(horai.body.shares).toHaveLength(3);
    });

    it('locks every change after the trip ends', async () => {
      const { seed, e } = await seedOsaka();
      await fx.endTrip(seed.tripId);
      const res = await classify(seed, '준용', e.mkTaxi.id, {
        status: 'SHARED',
        participantMembershipIds: [seed.members['준용'].membershipId],
        version: 0,
      }).expect(409);
      expect(res.body.code).toBe('EXPENSE_LOCKED');
      const locked = (await detail(seed, '준용', e.mkTaxi.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(locked.permissions).toEqual({
        canEdit: false,
        reason: 'TRIP_ENDED',
        isPayer: true,
      });
      expect(locked.participantCandidates).toBeNull();
      const page = await list(seed, '준용');
      expect(page).toMatchObject({
        pendingCount: 0,
        showOutOfPeriodEntry: false,
      });
      await request(server())
        .post(
          `/api/trips/${seed.tripId}/expenses/${e.mkTaxi.id}/duplicate-dismissal`,
        )
        .set(as(seed, '준용'))
        .send({ version: 0 })
        .expect(409);
    });
  });

  describe('여정 종료 → 미확정 자동 개인 (trip.ended, FR-306)', () => {
    it('falls back to read-time conversion when the listener fails', async () => {
      const { seed, e } = await seedOsaka();
      await fx.endTrip(seed.tripId);
      const lifecycle = app.get(ExpenseLifecycleService);
      vi.spyOn(lifecycle, 'personalizePendingOnTripEnd').mockRejectedValueOnce(
        new Error('db down'),
      );

      await app
        .get(EventEmitter2)
        .emitAsync(TRIP_ENDED_EVENT, { tripId: seed.tripId, eventSeq: 1 });
      expect(
        await prisma.expense.count({
          where: { tripId: seed.tripId, status: 'PENDING' },
        }),
      ).toBe(2);

      // 비결제자에게는 여전히 없음
      const minji = await list(seed, '민지');
      expect(
        minji.items.some(
          (i) => i.id === e.horai.id || i.id === e.familyMart.id,
        ),
      ).toBe(false);
      await detail(seed, '민지', e.horai.id).expect(404);

      // 결제자에게는 개인
      const mine = await list(seed, '준용');
      expect(
        mine.items
          .filter((i) => [e.horai.id, e.familyMart.id].includes(i.id))
          .map((i) => i.status),
      ).toEqual(['PERSONAL', 'PERSONAL']);
      expect((await list(seed, '준용', '?status=PERSONAL')).items).toHaveLength(
        3,
      );
      expect((await list(seed, '준용', '?status=PENDING')).items).toEqual([]);

      // 조회가 지연 전환을 했다(멱등)
      const rows = await prisma.expense.findMany({
        where: { id: { in: [e.horai.id, e.familyMart.id] } },
      });
      expect(
        rows.every(
          (r) => r.status === 'PERSONAL' && r.autoPersonalizedAt !== null,
        ),
      ).toBe(true);
      expect(
        await prisma.expenseChangeLog.count({
          where: { tripId: seed.tripId, action: 'AUTO_PERSONAL_ON_END' },
        }),
      ).toBe(2);

      const counts = await app
        .get(ExpenseStatsService)
        .personalCountsByPayer(seed.tripId);
      expect(counts).toEqual([
        { membershipId: seed.members['준용'].membershipId, personalCount: 3 },
      ]);
    });

    it('still answers as personal when the read-time conversion fails too', async () => {
      const { seed, e } = await seedOsaka();
      await fx.endTrip(seed.tripId);
      vi.spyOn(
        app.get(ExpenseLifecycleService),
        'personalizePendingOnTripEnd',
      ).mockRejectedValue(new Error('db down'));

      const mine = (await detail(seed, '준용', e.horai.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(mine).toMatchObject({
        status: 'PERSONAL',
        permissions: { reason: 'TRIP_ENDED' },
      });
      await detail(seed, '민지', e.horai.id).expect(404);
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: e.horai.id } }))
          .status,
      ).toBe('PENDING');
    });

    it('converts on trip.ended exactly once', async () => {
      const { seed } = await seedOsaka();
      const emitter = app.get(EventEmitter2);
      // 종료 전 이벤트(잘못 온 것)는 무시
      await emitter.emitAsync(TRIP_ENDED_EVENT, { tripId: seed.tripId });
      expect(
        await prisma.expense.count({
          where: { tripId: seed.tripId, status: 'PENDING' },
        }),
      ).toBe(2);

      await fx.endTrip(seed.tripId);
      await emitter.emitAsync(TRIP_ENDED_EVENT, { tripId: seed.tripId });
      await emitter.emitAsync(TRIP_ENDED_EVENT, {
        tripId: seed.tripId,
        groupId: seed.groupId,
        endedByUserId: null,
        reason: 'AUTO',
        redelivered: true,
        eventSeq: 2,
      });
      expect(
        await prisma.expense.count({
          where: { tripId: seed.tripId, status: 'PENDING' },
        }),
      ).toBe(0);
      expect(
        await prisma.expenseChangeLog.count({
          where: { tripId: seed.tripId, action: 'AUTO_PERSONAL_ON_END' },
        }),
      ).toBe(2);
    });
  });

  describe('중복 의심 (FR-407·511)', () => {
    it('flags shared duplicates of different payers and lets a payer dismiss the group', async () => {
      const { seed, e } = await seedOsaka();
      const dup = await fx.addExpense(seed, '민지', {
        status: 'PENDING',
        at: '2026-11-13 10:31',
        merchant: '오사카성 천수각',
        amount: '4800',
        krw: 44120,
      });

      await classify(seed, '민지', dup.id, {
        status: 'SHARED',
        version: 0,
      }).expect(200);
      const taehyun = await list(seed, '태현');
      const flagged = taehyun.items
        .filter((i) => i.flags.duplicateSuspected)
        .map((i) => i.id)
        .sort();
      expect(flagged).toEqual([e.osakaCastle.id, dup.id].sort());

      const view = (await detail(seed, '태현', dup.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(view.duplicate).toEqual({
        groupId: expect.any(String),
        canDismiss: false,
      });
      const dismiss = (name: string, version: number) =>
        request(server())
          .post(
            `/api/trips/${seed.tripId}/expenses/${dup.id}/duplicate-dismissal`,
          )
          .set(as(seed, name))
          .send({ version });
      expect((await dismiss('태현', 1).expect(403)).body.code).toBe(
        'NOT_PAYER',
      );

      const own = (await detail(seed, '민지', dup.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(own.duplicate?.canDismiss).toBe(true);
      const res = await dismiss('민지', own.version).expect(200);
      expect(res.body).toMatchObject({
        duplicate: null,
        flags: { duplicateSuspected: false },
      });
      expect(
        (await list(seed, '태현')).items.some(
          (i) => i.flags.duplicateSuspected,
        ),
      ).toBe(false);
      expect(
        (await dismiss('민지', res.body.version).expect(409)).body.code,
      ).toBe('DUPLICATE_NOT_FLAGGED');

      // 개인 → 공동으로 다시 공개해도 같은 쌍은 다시 묶지 않는다
      let version = res.body.version as number;
      version = (
        await classify(seed, '민지', dup.id, {
          status: 'PERSONAL',
          version,
          confirmSharedToPersonal: true,
        }).expect(200)
      ).body.version;
      await classify(seed, '민지', dup.id, {
        status: 'SHARED',
        version,
      }).expect(200);
      expect(
        (await list(seed, '태현')).items.some(
          (i) => i.flags.duplicateSuspected,
        ),
      ).toBe(false);
    });

    it('dissolves the group when one side becomes personal', async () => {
      const { seed, e } = await seedOsaka();
      const dup = await fx.addExpense(seed, '민지', {
        status: 'PENDING',
        at: '2026-11-13 10:29',
        merchant: '오사카성 천수각',
        amount: '4800',
        krw: 44120,
      });
      const shared = await classify(seed, '민지', dup.id, {
        status: 'SHARED',
        version: 0,
      }).expect(200);
      expect(shared.body.flags.duplicateSuspected).toBe(true);
      await classify(seed, '민지', dup.id, {
        status: 'PERSONAL',
        version: shared.body.version,
        confirmSharedToPersonal: true,
      }).expect(200);
      const castle = (await detail(seed, '태현', e.osakaCastle.id).expect(200))
        .body as ExpenseDetailResponse;
      expect(castle.flags.duplicateSuspected).toBe(false);
      // 같은 결제자끼리는 묶지 않는다
      const same = await fx.addExpense(seed, '수빈', {
        status: 'PENDING',
        at: '2026-11-13 10:30',
        merchant: '오사카성 천수각',
        amount: '4800',
        krw: 44120,
      });
      expect(same.id).toBeDefined();
    });
  });

  describe('기간 외 결제 추가 (FR-408)', () => {
    it('lists own out-of-period approvals and adds them as pending', async () => {
      const seed = await fx.seedTrip(['준용', '민지']);
      const me = seed.members['준용'];
      const agoda = await fx.addTransaction(me, {
        at: kst('2026-10-20 21:10'),
        merchant: '아고다 · 오리엔탈 익스프레스 난바',
        amount: '486000',
        currency: 'KRW',
      });
      const jeju = await fx.addTransaction(me, {
        at: kst('2026-11-02 09:00'),
        merchant: '제주항공 ICN–KIX 4매',
        amount: '1032400',
        currency: 'KRW',
      });
      const kkday = await fx.addTransaction(me, {
        at: kst('2026-11-10 12:00'),
        merchant: 'KKday · 유니버설 스튜디오 입장권',
        amount: '412800',
        currency: 'KRW',
      });
      await fx.addTransaction(me, {
        at: kst('2026-11-10 13:00'),
        merchant: 'KKday 환불',
        amount: '-100000',
        currency: 'KRW',
        kind: 'CANCEL',
        cancelOf: kkday.id,
      });
      const cancelled = await fx.addTransaction(me, {
        at: kst('2026-11-05 10:00'),
        merchant: '취소된 숙소',
        amount: '200000',
        currency: 'KRW',
      });
      await fx.addTransaction(me, {
        at: kst('2026-11-05 11:00'),
        merchant: '취소된 숙소',
        amount: '-200000',
        currency: 'KRW',
        kind: 'CANCEL',
        cancelOf: cancelled.id,
      });
      await fx.addTransaction(me, {
        at: kst('2026-08-01 10:00'),
        merchant: '너무 이른 결제',
        amount: '10000',
        currency: 'KRW',
      });
      await fx.addTransaction(me, {
        at: kst('2026-11-12 09:00'),
        merchant: '기간 안 결제',
        amount: '10000',
        currency: 'KRW',
      });
      const minjis = await fx.addTransaction(seed.members['민지'], {
        at: kst('2026-11-01 10:00'),
        merchant: '민지 항공권',
        amount: '500000',
        currency: 'KRW',
      });

      const candidates = async () =>
        (
          await request(server())
            .get(
              `/api/trips/${seed.tripId}/out-of-period-candidates?side=BEFORE`,
            )
            .set(as(seed, '준용'))
            .expect(200)
        ).body as {
          candidateId: string;
          merchantName: string;
          krwAmount: number;
          paymentMethodLabel: string;
        }[];
      const before = await candidates();
      expect(before.map((c) => c.merchantName)).toEqual([
        '아고다 · 오리엔탈 익스프레스 난바',
        '제주항공 ICN–KIX 4매',
        'KKday · 유니버설 스튜디오 입장권',
      ]);
      expect(before[0]).toMatchObject({
        candidateId: agoda.id,
        krwAmount: 486000,
        localDate: '2026-10-20',
        paymentMethodLabel: '토스뱅크 체크카드 1934',
      });
      await request(server())
        .get(`/api/trips/${seed.tripId}/out-of-period-candidates?side=AFTER`)
        .set(as(seed, '준용'))
        .expect(200)
        .expect([]);

      const add = (ids: string[]) =>
        request(server())
          .post(`/api/trips/${seed.tripId}/out-of-period-expenses`)
          .set(as(seed, '준용'))
          .send({ candidateIds: ids });
      const res = await add([jeju.id, agoda.id]).expect(201);
      expect(res.body.added).toBe(2);
      expect(res.body.items.map((i: ExpenseRow) => i.merchantName)).toEqual([
        '아고다 · 오리엔탈 익스프레스 난바',
        '제주항공 ICN–KIX 4매',
      ]);
      expect(res.body.items[0]).toMatchObject({
        status: 'PENDING',
        origin: 'OUT_OF_PERIOD',
        periodSide: 'BEFORE',
        dayIndex: null,
        krwAmount: 486000,
      });
      expect((await list(seed, '준용')).pendingCount).toBe(2);
      expect((await list(seed, '민지')).items).toEqual([]);
      expect((await candidates()).map((c) => c.candidateId)).toEqual([
        kkday.id,
      ]);

      // 이미 추가한 건·남의 거래·취소된 거래·범위 밖은 400(하나라도 있으면 아무것도 추가하지 않는다)
      for (const id of [agoda.id, minjis.id, cancelled.id]) {
        const bad = await add([kkday.id, id]).expect(400);
        expect(bad.body).toMatchObject({
          code: 'OUT_OF_PERIOD_CANDIDATE_INVALID',
          details: { invalidCandidateIds: [id] },
        });
      }
      await add([]).expect(400);

      // 부분 취소는 자식으로 붙는다
      const partial = await add([kkday.id]).expect(201);
      expect(partial.body.items[0]).toMatchObject({
        krwAmount: 312800,
        grossKrwAmount: 412800,
        refunds: [{ krwAmount: -100000 }],
      });
      const logs = await prisma.expenseChangeLog.findMany({
        where: { tripId: seed.tripId },
      });
      expect(
        logs.filter((l) => l.action === 'OUT_OF_PERIOD_ADDED'),
      ).toHaveLength(3);
      expect(logs.filter((l) => l.action === 'REFUND_ATTACHED')).toHaveLength(
        1,
      );
    });

    it('is only available while the trip is ongoing', async () => {
      const seed = await fx.seedTrip(['준용']);
      await fx.endTrip(seed.tripId);
      const res = await request(server())
        .get(`/api/trips/${seed.tripId}/out-of-period-candidates`)
        .set(as(seed, '준용'))
        .expect(409);
      expect(res.body.code).toBe('TRIP_PHASE_INVALID');
    });
  });
});
