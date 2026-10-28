import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  SettlementMemberExpenses,
  SettlementView,
  TripSummary,
} from '@yeojeong/shared';
import request from 'supertest';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { SettlementSnapshotService } from './../src/settlements/settlement-snapshot.service.js';
import { TRIP_EVENTS, type TripEndedEvent } from './../src/trips/events.js';
import { createTestAuth, type TestAuth } from './auth-helpers.js';
import {
  createDbTestApp,
  hasDatabase,
  INTERNAL_SECRET,
  LedgerFixture,
  type FixtureMember,
} from './settlements-fixtures.js';

const withDb = await hasDatabase();

/** S2A 계약(src/trips/events.ts) 그대로의 trip.ended */
const ended = (
  trip: { tripId: string; groupId: string },
  over: Partial<TripEndedEvent> = {},
): TripEndedEvent => ({
  tripId: trip.tripId,
  groupId: trip.groupId,
  endedByUserId: null,
  endedAt: new Date('2026-11-15T20:00:00+09:00'),
  reason: 'MANUAL',
  redelivered: false,
  eventSeq: 1n,
  occurredAt: new Date('2026-11-15T20:00:00+09:00'),
  ...over,
});

/** 금액·가맹점이 새지 않았는지 볼 때 UUID 속 숫자와 헷갈리지 않게 지운다 */
const visibleText = (body: unknown) =>
  JSON.stringify(body).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    '<id>',
  );

/**
 * 시나리오(원화 여정, 예산 ₩72,000): A(그룹장)·B·C 활성, D는 부담 인원으로 들어간 뒤 나감, E는 관여 없이 나감.
 * E1 A ₩30,000 [A,B,C] · E2 B ₩10,001 [A,B](나머지 1원 B) · E3 C ₩9,000 [C,D] · E4 A ₩12,000 − 취소 ₩3,000 [A,B,C]
 * A 개인 ₩7,000 · B 개인 ₩5,000 · C 미확정 ₩9,999
 * → A +21,000 · B −8,000 · C −8,500 · D −4,500 (합 0), 공동 ₩58,001
 */
async function seedScenario(
  fixture: LedgerFixture,
  status: 'ONGOING' | 'ENDED' = 'ONGOING',
) {
  const trip = await fixture.createTrip({
    members: [
      { nickname: 'A' },
      { nickname: 'B' },
      { nickname: 'C' },
      { nickname: 'D' },
      { nickname: 'E' },
    ],
    status,
    budgetKrw: 72_000,
    currency: 'KRW',
  });
  const [a, b, c, d, e] = trip.members;
  const ids = {
    e1: await fixture.addShared(trip.tripId, a, 30_000, [a, b, c], {
      merchantName: '이치란',
      occurredAt: '2026-11-12T19:00:00+09:00',
    }),
    e2: await fixture.addShared(trip.tripId, b, 10_001, [a, b], {
      merchantName: '난카이',
      occurredAt: '2026-11-13T11:20:00+09:00',
    }),
    e3: await fixture.addShared(trip.tripId, c, 9_000, [c, d], {
      merchantName: '오사카성',
    }),
    e4: await fixture.addShared(trip.tripId, a, 12_000, [a, b, c], {
      merchantName: '주유패스',
      occurredAt: '2026-11-14T09:00:00+09:00',
      refundKrw: -3_000,
    }),
    p1: await fixture.addPrivate(
      trip.tripId,
      a,
      7_000,
      'PERSONAL',
      'A 돈키호테',
    ),
    p2: await fixture.addPrivate(
      trip.tripId,
      b,
      5_000,
      'PERSONAL',
      'B 비밀가게',
    ),
    p3: await fixture.addPrivate(
      trip.tripId,
      c,
      9_999,
      'PENDING',
      'C 미확정가게',
    ),
  };
  await fixture.leave(d);
  await fixture.leave(e);
  return { ...trip, a, b, c, d, e, ids };
}

const expectScenarioSettlement = (body: SettlementView, viewer: string) => {
  expect(body).toMatchObject({
    totalSharedKrw: 58_001,
    sharedCount: 4,
    memberCount: 4,
    perCapitaKrw: 14_500, // round(14,500.25)
    fxPolicy: 'SPOT_AT_PAYMENT',
    algorithmVersion: 'v1',
  });
  expect(body.settledAt).toBe('2026-11-15T20:00:00+09:00');
  expect(body.members[0].member.nickname).toBe(viewer);
  const byName = Object.fromEntries(
    body.members.map((m) => [m.member.nickname, m]),
  );
  expect(byName.A).toMatchObject({
    paidKrw: 39_000,
    paidCount: 2,
    burdenKrw: 18_000,
    netKrw: 21_000,
    direction: 'RECEIVE',
    isLeft: false,
  });
  expect(byName.B).toMatchObject({
    paidKrw: 10_001,
    paidCount: 1,
    burdenKrw: 18_001,
    netKrw: -8_000,
    direction: 'SEND',
  });
  expect(byName.C).toMatchObject({
    paidKrw: 9_000,
    burdenKrw: 17_500,
    netKrw: -8_500,
  });
  expect(byName.D).toMatchObject({
    paidKrw: 0,
    burdenKrw: 4_500,
    netKrw: -4_500,
    isLeft: true,
  });
  expect(byName.E).toBeUndefined();
  expect(body.members.reduce((sum, m) => sum + m.netKrw, 0)).toBe(0);
  expect(
    body.transfers.map((t) => [
      t.seq,
      t.from.nickname,
      t.to.nickname,
      t.amountKrw,
    ]),
  ).toEqual([
    [1, 'C', 'A', 8_500],
    [2, 'B', 'A', 8_000],
    [3, 'D', 'A', 4_500],
  ]);
};

describe.skipIf(!withDb)('Settlements · summary (e2e, real DB)', () => {
  let app: NestExpressApplication;
  let auth: TestAuth;
  let fixture: LedgerFixture;

  beforeAll(async () => {
    auth = createTestAuth();
    app = await createDbTestApp(auth);
    fixture = LedgerFixture.from(app);
  });

  afterAll(async () => {
    await fixture?.cleanup();
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const get = (path: string, who?: FixtureMember) =>
    request(server()).get(path).set(auth.headers(who?.user));
  const post = (path: string, who?: FixtureMember) =>
    request(server()).post(path).set(auth.headers(who?.user));

  describe('GET /api/trips/:tripId/summary (FR-601~604)', () => {
    it('computes the payer view: net, budget, my spending, burdens', async () => {
      const s = await seedScenario(fixture);
      const res = await get(`/api/trips/${s.tripId}/summary`, s.a).expect(200);
      const body = res.body as TripSummary;

      expect(body.asOf).toMatch(/\+09:00$/);
      expect(body.me).toEqual({
        membershipId: s.a.membershipId,
        netKrw: 21_000,
        toPayKrw: 0,
        toReceiveKrw: 21_000,
      });
      expect(body.sharedTotalKrw).toBe(58_001);
      expect(body.budgetKrw).toBe(72_000);
      expect(body.budgetRatio).toBe(0.8056);
      expect(body.budgetState).toBe('CAUTION');
      expect(body.overBudgetKrw).toBe(0);
      expect(body.mySpending).toEqual({
        totalKrw: 25_000,
        sharedBurdenKrw: 18_000,
        personalKrw: 7_000,
        sharedPct: 72,
        personalPct: 28,
      });
      expect(
        body.burdens.map((x) => [
          x.member.nickname,
          x.burdenKrw,
          x.member.isMe,
          x.member.isLeft,
        ]),
      ).toEqual([
        ['A', 18_000, true, false],
        ['B', 18_001, false, false],
        ['C', 17_500, false, false],
        ['D', 4_500, false, true], // 나간 멤버도 부담이 있으면 남는다
      ]); // E(관여 없이 나감)는 없다
    });

    it('shows a non-payer only their own numbers, never others’ personal or pending payments', async () => {
      const s = await seedScenario(fixture);
      const res = await get(`/api/trips/${s.tripId}/summary`, s.c).expect(200);
      const body = res.body as TripSummary;

      expect(body.me).toMatchObject({
        netKrw: -8_500,
        toPayKrw: 8_500,
        toReceiveKrw: 0,
      });
      // C의 미확정 ₩9,999는 내 지출에도 넣지 않는다
      expect(body.mySpending).toEqual({
        totalKrw: 17_500,
        sharedBurdenKrw: 17_500,
        personalKrw: 0,
        sharedPct: 100,
        personalPct: 0,
      });
      expect(body.burdens[0].member).toMatchObject({
        nickname: 'C',
        isMe: true,
      });
      const raw = visibleText(res.body);
      for (const secret of ['7000', '5000', '9999', '돈키호테', '비밀가게']) {
        expect(raw).not.toContain(secret);
      }

      const bView = (
        await get(`/api/trips/${s.tripId}/summary`, s.b).expect(200)
      ).body as TripSummary;
      expect(bView.mySpending).toMatchObject({
        totalKrw: 23_001,
        personalKrw: 5_000,
        sharedPct: 78,
        personalPct: 22,
      });
    });

    it('hides the trip from left members and outsiders, and is locked before start', async () => {
      const s = await seedScenario(fixture);
      await get(`/api/trips/${s.tripId}/summary`, s.d).expect(404);
      await get(`/api/trips/${s.tripId}/summary`, {
        user: auth.addUser(),
        membershipId: '',
        joinOrder: 0,
      }).expect(404);
      await get(`/api/trips/${s.tripId}/summary`).expect(401);

      const upcoming = await fixture.createTrip({
        members: [{ nickname: 'U' }],
        status: 'UPCOMING',
      });
      const res = await get(
        `/api/trips/${upcoming.tripId}/summary`,
        upcoming.members[0],
      ).expect(409);
      expect(res.body.code).toBe('TRIP_PHASE_INVALID');
    });

    it('reports an empty trip as zeros with the ratio hidden', async () => {
      const t = await fixture.createTrip({
        members: [{ nickname: 'Z' }, { nickname: 'Y' }],
        currency: 'KRW',
      });
      const body = (
        await get(`/api/trips/${t.tripId}/summary`, t.members[1]).expect(200)
      ).body as TripSummary;
      expect(body).toMatchObject({
        me: { netKrw: 0, toPayKrw: 0, toReceiveKrw: 0 },
        sharedTotalKrw: 0,
        budgetRatio: 0,
        budgetState: 'NORMAL',
        mySpending: { totalKrw: 0, sharedPct: null, personalPct: null },
      });
      expect(body.burdens.map((x) => x.member.nickname)).toEqual(['Y', 'Z']);
    });
  });

  describe('settlement snapshot (FR-306·701·702·704·705)', () => {
    it('creates exactly one snapshot from trip.ended, even when the event arrives twice or concurrently', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);
      const events = app.get(EventEmitter2);

      await events.emitAsync(TRIP_EVENTS.ENDED, ended(s));
      // 자동 종료 잡의 재발행(S2A 계약: redelivered·eventSeq·occurredAt)
      await events.emitAsync(
        TRIP_EVENTS.ENDED,
        ended(s, { redelivered: true, eventSeq: 2n }),
      );
      await Promise.all([
        events.emitAsync(TRIP_EVENTS.ENDED, ended(s)),
        events.emitAsync(TRIP_EVENTS.ENDED, ended(s)),
        app.get(SettlementSnapshotService).ensureSettlement(s.tripId),
      ]);
      expect(await fixture.settlementCount(s.tripId)).toBe(1);

      const prisma = app.get(PrismaService);
      const stored = await prisma.settlement.findUniqueOrThrow({
        where: { tripId: s.tripId },
        include: { members: true },
      });
      const personal = Object.fromEntries(
        stored.members.map((m) => [m.membershipId, m.personalCount]),
      );
      // C의 미확정은 종료 때 개인이 되므로 건수에 들어간다
      expect(personal).toEqual({
        [s.a.membershipId]: 1,
        [s.b.membershipId]: 1,
        [s.c.membershipId]: 1,
        [s.d.membershipId]: 0,
      });

      const res = await get(`/api/trips/${s.tripId}/settlement`, s.b).expect(
        200,
      );
      expectScenarioSettlement(res.body as SettlementView, 'B');
      expect(res.body.settlementId).toBe(stored.id);
    });

    it('creates the snapshot lazily on GET when no event came, and only once', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);
      expect(await fixture.settlementCount(s.tripId)).toBe(0);

      const first = await get(`/api/trips/${s.tripId}/settlement`, s.a).expect(
        200,
      );
      expectScenarioSettlement(first.body as SettlementView, 'A');
      const second = await get(`/api/trips/${s.tripId}/settlement`, s.c).expect(
        200,
      );
      expect(second.body.settlementId).toBe(first.body.settlementId);
      expect(await fixture.settlementCount(s.tripId)).toBe(1);
    });

    it('recovers when the trip.ended listener fails: GET builds it, a later event is a no-op', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);
      const snapshots = app.get(SettlementSnapshotService);
      const write = vi
        .spyOn(snapshots, 'writeSnapshot')
        .mockRejectedValueOnce(new Error('DB 연결 끊김(테스트)'));
      const events = app.get(EventEmitter2);

      // S2A 계약: 구독자 실패는 발행자에게 던지지 않고 error 로그로 남긴다(리스너 결과 null)
      const snapshotResult = (results: unknown[]) =>
        results.find(
          (r) =>
            r === null ||
            (typeof r === 'object' && r !== null && 'settlementId' in r),
        );
      const failed = await events.emitAsync(TRIP_EVENTS.ENDED, ended(s));
      expect(snapshotResult(failed)).toBeNull();
      expect(await fixture.settlementCount(s.tripId)).toBe(0);

      const res = await get(`/api/trips/${s.tripId}/settlement`, s.a).expect(
        200,
      );
      expectScenarioSettlement(res.body as SettlementView, 'A');

      await events.emitAsync(TRIP_EVENTS.ENDED, ended(s));
      expect(await fixture.settlementCount(s.tripId)).toBe(1);
      expect(write).toHaveBeenCalledTimes(2); // 실패 1회 + GET 지연 생성 1회
      write.mockRestore();
    });

    it('ignores a trip.ended for a trip that has not ended', async () => {
      const s = await seedScenario(fixture);
      const events = app.get(EventEmitter2);
      // 잘못 보낸 이벤트는 발행자에게 던지지 않고(warn) 아무것도 만들지 않는다
      await expect(
        events.emitAsync(TRIP_EVENTS.ENDED, ended(s)),
      ).resolves.toBeDefined();
      expect(await fixture.settlementCount(s.tripId)).toBe(0);
    });

    it('answers 409 before the trip ends and 404 to left members', async () => {
      const s = await seedScenario(fixture);
      const res = await get(`/api/trips/${s.tripId}/settlement`, s.a).expect(
        409,
      );
      expect(res.body.code).toBe('TRIP_PHASE_INVALID');
      await get(
        `/api/trips/${s.tripId}/settlement/members/${s.b.membershipId}/expenses`,
        s.a,
      ).expect(409);

      await fixture.end(s.tripId);
      await get(`/api/trips/${s.tripId}/settlement`, s.d).expect(404); // 나간 멤버는 열람 불가(Q-09)
    });

    it('keeps everyone at ₩0 with no transfers when nothing was shared', async () => {
      const t = await fixture.createTrip({
        members: [{ nickname: 'P' }, { nickname: 'Q' }],
        status: 'ENDED',
      });
      const body = (
        await get(`/api/trips/${t.tripId}/settlement`, t.members[0]).expect(200)
      ).body as SettlementView;
      expect(body).toMatchObject({
        totalSharedKrw: 0,
        sharedCount: 0,
        memberCount: 2,
        perCapitaKrw: 0,
        transfers: [],
      });
      expect(body.members.map((m) => m.direction)).toEqual(['EVEN', 'EVEN']);
    });
  });

  describe('GET …/settlement/members/:membershipId/expenses (FR-703)', () => {
    it('lists only shared payments of another member and the count of their personal ones', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);
      const res = await get(
        `/api/trips/${s.tripId}/settlement/members/${s.b.membershipId}/expenses`,
        s.a,
      ).expect(200);
      const body = res.body as SettlementMemberExpenses;

      expect(body).toMatchObject({
        paidKrw: 10_001,
        burdenKrw: 18_001,
        netKrw: -8_000,
        direction: 'SEND',
        personalCount: 1,
        personalPayments: null,
      });
      expect(body.member).toMatchObject({ nickname: 'B', isMe: false });
      expect(body.sharedPayments.map((p) => p.merchantName)).toEqual([
        '난카이',
      ]);
      expect(body.sharedPayments[0]).toMatchObject({
        status: 'SHARED',
        krwAmount: 10_001,
        occurredAt: '2026-11-13T11:20:00+09:00',
        dayIndex: 2,
        flags: { changed: false, duplicateSuspected: false, hasRefund: false },
      });
      expect(
        body.sharedPayments[0].participants?.map((p) => p.nickname),
      ).toEqual(['A', 'B']);
      // 남의 개인 결제는 가맹점·금액이 응답에 없다(C-02)
      expect(visibleText(res.body)).not.toContain('비밀가게');
      expect(visibleText(res.body)).not.toContain('5000');

      const c = (
        await get(
          `/api/trips/${s.tripId}/settlement/members/${s.c.membershipId}/expenses`,
          s.a,
        ).expect(200)
      ).body as SettlementMemberExpenses;
      expect(c.personalCount).toBe(1);
      expect(visibleText(c)).not.toContain('미확정가게');
    });

    it('shows my own personal payments and refund bundles when I open my row', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);
      const body = (
        await get(
          `/api/trips/${s.tripId}/settlement/members/${s.a.membershipId}/expenses`,
          s.a,
        ).expect(200)
      ).body as SettlementMemberExpenses;

      expect(body.member.isMe).toBe(true);
      expect(
        body.sharedPayments.map((p) => [
          p.merchantName,
          p.krwAmount,
          p.flags.hasRefund,
          p.refunds.length,
        ]),
      ).toEqual([
        ['주유패스', 9_000, true, 1],
        ['이치란', 30_000, false, 0],
      ]);
      expect(body.personalCount).toBe(1);
      expect(
        body.personalPayments?.map((p) => [
          p.merchantName,
          p.status,
          p.krwAmount,
          p.participants,
        ]),
      ).toEqual([['A 돈키호테', 'PERSONAL', 7_000, null]]);
    });

    it('opens a left member row but 404s for memberships outside the settlement', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);
      const d = (
        await get(
          `/api/trips/${s.tripId}/settlement/members/${s.d.membershipId}/expenses`,
          s.b,
        ).expect(200)
      ).body as SettlementMemberExpenses;
      expect(d).toMatchObject({
        isLeft: true,
        burdenKrw: 4_500,
        sharedPayments: [],
        personalCount: 0,
      });

      await get(
        `/api/trips/${s.tripId}/settlement/members/${s.e.membershipId}/expenses`,
        s.a,
      ).expect(404);
      await get(
        `/api/trips/${s.tripId}/settlement/members/not-a-uuid/expenses`,
        s.a,
      ).expect(404);
      const other = await seedScenario(fixture);
      await get(
        `/api/trips/${s.tripId}/settlement/members/${other.a.membershipId}/expenses`,
        s.a,
      ).expect(404);
    });
  });

  describe('recompute and internal jobs', () => {
    it('lets the leader recompute explicitly, replacing the single snapshot', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);
      const before = (
        await get(`/api/trips/${s.tripId}/settlement`, s.a).expect(200)
      ).body as SettlementView;

      const res = await post(
        `/api/trips/${s.tripId}/settlement/recompute`,
        s.a,
      ).expect(200);
      expectScenarioSettlement(res.body as SettlementView, 'A');
      expect(res.body.settlementId).not.toBe(before.settlementId);
      expect(await fixture.settlementCount(s.tripId)).toBe(1);

      const denied = await post(
        `/api/trips/${s.tripId}/settlement/recompute`,
        s.b,
      ).expect(403);
      expect(denied.body.code).toBe('NOT_LEADER');
    });

    it('guards the internal recompute and sweep jobs with the job secret', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);

      await post('/api/internal/jobs/settlements/recompute')
        .send({ tripId: s.tripId })
        .expect(403);
      await post('/api/internal/jobs/settlements/recompute')
        .set('x-internal-job-secret', 'wrong')
        .send({ tripId: s.tripId })
        .expect(403);
      await post('/api/internal/jobs/settlements').expect(403);

      const res = await post('/api/internal/jobs/settlements/recompute')
        .set('x-internal-job-secret', INTERNAL_SECRET)
        .send({ tripId: s.tripId })
        .expect(200);
      expect(res.body).toMatchObject({ tripId: s.tripId, replaced: false });
      expect(await fixture.settlementCount(s.tripId)).toBe(1);

      const ongoing = await seedScenario(fixture);
      const phase = await post('/api/internal/jobs/settlements/recompute')
        .set('x-internal-job-secret', INTERNAL_SECRET)
        .send({ tripId: ongoing.tripId })
        .expect(409);
      expect(phase.body.code).toBe('TRIP_PHASE_INVALID');
    });

    it('sweeps ended trips that are missing a snapshot', async () => {
      const s = await seedScenario(fixture);
      await fixture.end(s.tripId);
      // 공유 로컬 DB의 다른 여정은 건드리지 않게 대상 조회만 이 여정으로 좁힌다
      const prisma = app.get(PrismaService);
      const findMany = vi
        .spyOn(prisma.trip, 'findMany')
        .mockResolvedValueOnce([{ id: s.tripId }] as never);

      const res = await post('/api/internal/jobs/settlements')
        .set('x-internal-job-secret', INTERNAL_SECRET)
        .expect(200);
      expect(res.body).toEqual({ checked: 1, created: 1, failed: 0 });
      expect(await fixture.settlementCount(s.tripId)).toBe(1);
      findMany.mockRestore();
    });
  });
});
