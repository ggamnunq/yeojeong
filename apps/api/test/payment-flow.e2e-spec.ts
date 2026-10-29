import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { AuthUser } from './../src/common/auth/index.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DuplicateFlagger } from './../src/transactions/duplicate-flagger.js';
import { INTERNAL_JOB_SECRET_HEADER } from './../src/common/internal-job/index.js';
import { TripEventsListener } from './../src/transactions/trip-events.listener.js';
import { createTestAuth, TEST_ORIGIN, type TestAuth } from './auth-helpers.js';
import {
  cleanupSeed,
  createPaymentTestApp,
  seedTrip,
  type FaultyDemoAdapter,
  type SeededTrip,
} from './payment-helpers.js';

// 실제 DB에 붙는 결제수단·인입 e2e. PAYMENT_TEST_DATABASE_URL(이름이 _test로 끝나는 전용 DB)이 있을 때만 돈다(CI는 yeojeong_s2b_test).
// S2A의 TEST_DATABASE_URL은 시작할 때 TRUNCATE하므로 같이 돌면 서로 지운다 — 다른 DB를 쓴다. 이 테스트는 자기가 만든 행만 지운다.
// 예: PAYMENT_TEST_DATABASE_URL=postgresql://yeojeong:yeojeong@localhost:5432/yeojeong_s2b_test pnpm --filter @yeojeong/api test:e2e
const TEST_DB = process.env.PAYMENT_TEST_DATABASE_URL;
const JOB_SECRET = 'test-internal-job-secret-0123456789';
const DOC_HASH = 'a'.repeat(64);

describe.skipIf(!TEST_DB)('Payment flow (e2e, real DB)', () => {
  let app: NestExpressApplication;
  let auth: TestAuth;
  let adapter: FaultyDemoAdapter;
  let prisma: PrismaService;
  const seeds: SeededTrip[] = [];

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', TEST_DB);
    vi.stubEnv('INTERNAL_JOB_SECRET', JOB_SECRET);
    auth = createTestAuth();
    ({ app, adapter } = await createPaymentTestApp({ auth, prisma: 'real' }));
    prisma = app.get(PrismaService);
    const [{ db }] = await prisma.$queryRaw<
      { db: string }[]
    >`SELECT current_database() AS db`;
    if (!db.endsWith('_test')) {
      throw new Error(
        `PAYMENT_TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 합니다: ${db}`,
      );
    }
    // 원화는 S2C fx(SPOT_AT_PAYMENT)가 정한다: 샘플과 같은 100엔 = 919.20원 고시 하나
    await prisma.exchangeRate.createMany({
      data: [
        {
          quoteCurrency: 'JPY',
          rate: '9.192',
          displayUnit: 100,
          source: 'S2B 테스트 고시',
          effectiveAt: new Date('2020-01-01T00:00:00Z'),
        },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await cleanupSeed(prisma, seeds);
    await app.close();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    adapter.failList = null;
    adapter.failRefresh = null;
  });

  const server = () => app.getHttpServer();
  const asUser = (u: { id: string; nickname: string }): AuthUser => ({
    id: u.id,
    nickname: u.nickname,
    profileImageUrl: null,
  });
  const runJob = () =>
    request(server())
      .post('/api/internal/jobs/sync')
      .set('Origin', TEST_ORIGIN)
      .set(INTERNAL_JOB_SECRET_HEADER, JOB_SECRET)
      .expect(200);

  /** 연결 시작 → (DEMO 즉시 인증) 콜백 → 후보 → 확정. 고르지 않을 상품명을 넘긴다 */
  async function connect(
    user: AuthUser,
    options: {
      skip?: string[];
      purpose?: string;
      reconnectConnectionId?: string;
    } = {},
  ) {
    const start = await request(server())
      .post('/api/payment-connections')
      .set(auth.headers(user))
      .send({
        provider: 'TOSS',
        purpose: options.purpose ?? 'SIGNUP',
        ...(options.reconnectConnectionId && {
          reconnectConnectionId: options.reconnectConnectionId,
        }),
      })
      .expect(201);
    const authUrl = new URL(start.body.authUrl);
    expect(authUrl.pathname).toBe('/api/payment-connections/callback/toss');
    const callback = await request(server())
      .get(authUrl.pathname + authUrl.search)
      .set(auth.headers(user))
      .expect(302);
    expect(callback.headers.location).toBe(
      `http://localhost:5173/wallet/connect/select?attempt=${start.body.attemptId}`,
    );
    const attempt = await request(server())
      .get(`/api/payment-connections/attempts/${start.body.attemptId}`)
      .set(auth.headers(user))
      .expect(200);
    expect(attempt.body.status).toBe('AUTHORIZED');
    const candidates = await request(server())
      .get(
        `/api/payment-connections/attempts/${start.body.attemptId}/candidates`,
      )
      .set(auth.headers(user))
      .expect(200);
    const chosen = (
      candidates.body as { candidateId: string; productName: string }[]
    )
      .filter((c) => !options.skip?.includes(c.productName))
      .map((c) => c.candidateId);
    const confirm = await request(server())
      .post(`/api/payment-connections/attempts/${start.body.attemptId}/confirm`)
      .set(auth.headers(user))
      .send({ candidateIds: chosen })
      .expect(201);
    return {
      attemptId: start.body.attemptId as string,
      candidates: candidates.body,
      confirm: confirm.body,
    };
  }

  const expensesOf = (tripId: string, payerMembershipId: string) =>
    prisma.expense.findMany({
      where: { tripId, payerMembershipId },
      orderBy: { occurredAt: 'asc' },
    });

  it('connect → select → list → PENDING import → manual sync → remove → last removal with purge (HF-05~08, FR-801~804·402·403·405)', async () => {
    const seed = await seedTrip(prisma, {
      members: [{ nickname: '준용' }],
      status: 'ONGOING',
    });
    seeds.push(seed);
    const [jy] = seed.users;
    const me = asUser(jy);
    for (const consentId of [
      'FIN_LINK',
      'FIN_PRIVACY',
      'THIRD_PARTY',
    ] as const) {
      await prisma.userConsent.create({
        data: {
          userId: me.id,
          userRefHash: DOC_HASH,
          consentId,
          version: 'test',
          agreed: true,
          ip: '127.0.0.1',
          ua: 'vitest',
          screen: 'WF-05',
          method: 'ALL',
          docHash: DOC_HASH,
        },
      });
    }

    const { candidates, confirm } = await connect(me, {
      skip: ['카카오뱅크 세이프박스'],
    });
    expect(candidates).toHaveLength(4);
    expect(
      candidates.every((c: { maskedNumber: string }) =>
        c.maskedNumber.includes('*'),
      ),
    ).toBe(true);
    expect(JSON.stringify(candidates)).not.toContain('demo.');
    expect(confirm).toEqual({ accounts: 1, cards: 2 });

    // 연결 직후 METHOD_ADDED 동기화: 기간 내 승인 6건이 미확정으로, 체크카드 출금 4건은 동일 사용자 중복으로 빠진다
    const pending = await expensesOf(seed.tripId, jy.membershipId!);
    expect(pending.map((e) => e.merchantName)).toEqual([
      '이치란 라멘 도톤보리점',
      '돈키호테 도톤보리점',
      '패밀리마트 난바역점',
      'MK택시',
      '551 호라이 난바본점',
      '야키니쿠 와규 이치 난바점',
    ]);
    expect(
      pending.every((e) => e.status === 'PENDING' && e.origin === 'AUTO'),
    ).toBe(true);
    expect(pending[2]).toMatchObject({
      krwAmount: 11770,
      originalCurrency: 'JPY',
    });
    expect(pending[2].originalAmount.toFixed(0)).toBe('1280');
    const txs = await prisma.transaction.findMany({ where: { userId: me.id } });
    // 기간 내 거래만 저장한다.
    expect(txs).toHaveLength(10);
    expect(txs.filter((t) => t.sameUserDuplicateOfId)).toHaveLength(4);
    expect(
      txs.every(
        (t) =>
          t.rawPayloadEnc &&
          !Buffer.from(t.rawPayloadEnc).toString().includes('demo'),
      ),
    ).toBe(true);
    const connection = await prisma.paymentConnection.findFirstOrThrow({
      where: { userId: me.id },
    });
    expect(connection).toMatchObject({
      provider: 'DEMO',
      status: 'ACTIVE',
      lastSyncStatus: 'OK',
    });
    expect(Buffer.from(connection.accessTokenEnc!).toString()).not.toContain(
      'demo-at',
    );
    const runs = await prisma.syncRun.findMany({
      where: { connectionId: connection.id },
    });
    expect(runs).toMatchObject([
      {
        trigger: 'METHOD_ADDED',
        status: 'OK',
        importedCount: 6,
        fetchedCount: 10,
      },
    ]);
    expect(runs[0].fromAt).toEqual(seed.startAt);

    const list = await request(server())
      .get('/api/payment-methods')
      .set(auth.headers(me))
      .expect(200);
    expect(
      list.body.methods.map((m: { productName: string }) => m.productName),
    ).toEqual(['토스뱅크 통장', '토스뱅크 체크카드', '신한카드 Deep Dream']);
    expect(list.body.methods[1]).toMatchObject({
      shortLabel: '토스뱅크 체크카드',
      maskedNumber: '**** **** **** 1934',
      last4: '1934',
      status: 'ACTIVE',
    });
    expect(list.body).toMatchObject({
      hasExpiredConnection: false,
      counts: { accounts: 1, cards: 2 },
    });
    expect(list.body.lastSyncedAt).not.toBeNull();

    // 수동 동기화 60초 1회, 주기 잡을 다시 돌려도 결제는 늘지 않는다(멱등)
    const manual = await request(server())
      .post('/api/payment-methods/sync')
      .set(auth.headers(me))
      .expect(202);
    expect(manual.body.syncRunIds).toHaveLength(1);
    expect(manual.body.skipped).toBeNull();
    await request(server())
      .post('/api/payment-methods/sync')
      .set(auth.headers(me))
      .expect(429)
      .expect((r) => expect(r.body.code).toBe('SYNC_RATE_LIMITED'));
    await runJob();
    expect(await expensesOf(seed.tripId, jy.membershipId!)).toHaveLength(6);
    expect(await prisma.transaction.count({ where: { userId: me.id } })).toBe(
      10,
    );

    // 마지막이 아닌 결제수단: purge 불가, 해제는 결제를 남긴다
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: me.id },
    });
    const byName = (name: string) =>
      methods.find((m) => m.productName === name)!;
    await request(server())
      .delete(
        `/api/payment-methods/${byName('신한카드 Deep Dream').id}?purgeImported=true`,
      )
      .set(auth.headers(me))
      .expect(400);
    await request(server())
      .delete(`/api/payment-methods/${byName('신한카드 Deep Dream').id}`)
      .set(auth.headers(me))
      .expect(204);
    expect(await expensesOf(seed.tripId, jy.membershipId!)).toHaveLength(6);
    await request(server())
      .delete(`/api/payment-methods/${byName('신한카드 Deep Dream').id}`)
      .set(auth.headers(me))
      .expect(404);

    // S2B-2가 할 일을 흉내: 이치란은 공동, 패밀리마트는 개인으로 확정
    const ichiran = pending[0];
    await prisma.expense.update({
      where: { id: ichiran.id },
      data: { status: 'SHARED', confirmedAt: new Date() },
    });
    await prisma.expenseShare.create({
      data: {
        expenseId: ichiran.id,
        membershipId: jy.membershipId!,
        amountKrw: ichiran.krwAmount,
      },
    });
    await prisma.expense.update({
      where: { id: pending[2].id },
      data: { status: 'PERSONAL' },
    });

    await request(server())
      .delete(`/api/payment-methods/${byName('토스뱅크 통장').id}`)
      .set(auth.headers(me))
      .expect(204);
    await request(server())
      .delete(
        `/api/payment-methods/${byName('토스뱅크 체크카드').id}?purgeImported=true`,
      )
      .set(auth.headers(me))
      .expect(204);

    const left = await prisma.expense.findMany({
      where: { tripId: seed.tripId },
    });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      id: ichiran.id,
      status: 'SHARED',
      transactionId: null,
      krwAmount: ichiran.krwAmount,
    });
    expect(await prisma.transaction.count({ where: { userId: me.id } })).toBe(
      0,
    );
    expect(await prisma.paymentMethod.count({ where: { userId: me.id } })).toBe(
      0,
    );
    expect(
      await prisma.paymentConnection.findUniqueOrThrow({
        where: { id: connection.id },
      }),
    ).toMatchObject({
      status: 'REVOKED',
      accessTokenEnc: null,
      refreshTokenEnc: null,
    });
    const consents = await prisma.userConsent.findMany({
      where: { userId: me.id },
      orderBy: { consentId: 'asc' },
    });
    expect(consents.map((c) => [c.consentId, c.withdrawChannel])).toEqual([
      ['FIN_LINK', 'WF-27'],
      ['FIN_PRIVACY', 'WF-27'],
      ['THIRD_PARTY', null],
    ]);
    const empty = await request(server())
      .get('/api/payment-methods')
      .set(auth.headers(me))
      .expect(200);
    expect(empty.body).toMatchObject({
      connections: [],
      methods: [],
      lastSyncedAt: null,
    });
    const actions = await prisma.accessLog.findMany({
      where: { userId: me.id },
      select: { action: true },
    });
    expect(new Set(actions.map((a) => a.action))).toEqual(
      new Set([
        'VIEW_CANDIDATES',
        'CONNECT',
        'VIEW_PAYMENT_METHODS',
        'SYNC',
        'DISCONNECT',
      ]),
    );
  });

  it('attaches a same-day cancel to its payment as a refund child (FR-406)', async () => {
    const seed = await seedTrip(prisma, {
      members: [{ nickname: '태현' }],
      status: 'ONGOING',
    });
    seeds.push(seed);
    const [th] = seed.users;
    await connect(asUser(th));
    const all = await expensesOf(seed.tripId, th.membershipId!);
    const parents = all.filter((e) => !e.refundOfExpenseId);
    expect(parents.map((e) => e.merchantName)).toEqual([
      '쿠시카츠 다루마 신세카이점',
      '오사카 주유패스 4매',
      '아베노 하루카스 300',
    ]);
    const pass = parents[1];
    expect(pass).toMatchObject({ krwAmount: 121330, netKrwAmount: 0 });
    const child = all.find((e) => e.refundOfExpenseId === pass.id)!;
    expect(child).toMatchObject({
      krwAmount: -121330,
      netKrwAmount: null,
      status: 'PENDING',
      payerMembershipId: th.membershipId,
    });
    expect(
      await prisma.expenseChangeLog.count({
        where: { expenseId: pass.id, action: 'REFUND_ATTACHED' },
      }),
    ).toBe(1);
    await runJob();
    expect(await prisma.expense.count({ where: { tripId: seed.tripId } })).toBe(
      4,
    );
  });

  it('SH-2: a failed trip.started backfill is caught up by the sync job without duplicates; events are idempotent (FR-404 AC1·AC3)', async () => {
    const seed = await seedTrip(prisma, {
      members: [{ nickname: '수빈' }, { nickname: '민지', member: false }],
      status: 'UPCOMING',
      // 샘플 마지막 결제(D4 12:10)가 실행 시각과 상관없이 이미 지난 결제가 되도록 4일 전에 시작한다
      startOffsetDays: -4,
    });
    seeds.push(seed);
    const [sb, mj] = seed.users;
    const listener = app.get(TripEventsListener);
    const events = app.get(EventEmitter2);

    // 시작 전에 연결: 진행 중 여정이 없어 제공자 조회를 하지 않는다(FR-401 AC2)
    await connect(asUser(sb));
    await connect(asUser(mj));
    const sbConn = await prisma.paymentConnection.findFirstOrThrow({
      where: { userId: sb.id },
    });
    expect(
      await prisma.syncRun.count({ where: { connectionId: sbConn.id } }),
    ).toBe(0);
    // 수동 동기화도 건너뛴다: 200 + skipped, 동기화 시각은 그대로
    const skipped = await request(server())
      .post('/api/payment-methods/sync')
      .set(auth.headers(asUser(sb)))
      .expect(200);
    expect(skipped.body).toMatchObject({
      syncRunIds: [],
      skipped: 'NO_ACTIVE_TRIP',
    });
    expect(
      (
        await prisma.paymentConnection.findUniqueOrThrow({
          where: { id: sbConn.id },
        })
      ).lastSyncedAt,
    ).toBeNull();

    // 여정 시작(S2A가 커밋) → trip.started 소급 리스너를 강제로 실패시킨다
    await prisma.trip.update({
      where: { id: seed.tripId },
      data: { status: 'ONGOING', startedAt: new Date() },
    });
    adapter.failList = 'UNAVAILABLE';
    await events.emitAsync('trip.started', {
      tripId: seed.tripId,
      groupId: seed.groupId,
      startAt: seed.startAt,
      eventSeq: 1n,
      occurredAt: new Date(),
    });
    await listener.drain();
    expect(
      await prisma.syncRun.findMany({
        where: { connectionId: sbConn.id },
        select: { trigger: true, status: true, errorCode: true },
      }),
    ).toEqual([
      { trigger: 'TRIP_START', status: 'FAILED', errorCode: 'UNAVAILABLE' },
    ]);
    expect(await prisma.expense.count({ where: { tripId: seed.tripId } })).toBe(
      0,
    );

    // 다음 주기 잡: 성공 SyncRun이 여정 기간을 덮지 못하므로 startAt부터 다시 가져와 2건 인입
    adapter.failList = null;
    await runJob();
    const sbExpenses = await expensesOf(seed.tripId, sb.membershipId!);
    expect(sbExpenses.map((e) => e.merchantName)).toEqual([
      '오사카성 천수각',
      '쿠로몬 시장',
    ]);
    const scheduled = await prisma.syncRun.findFirstOrThrow({
      where: { connectionId: sbConn.id, status: 'OK' },
    });
    expect(scheduled).toMatchObject({ trigger: 'SCHEDULED', importedCount: 2 });
    expect(scheduled.fromAt).toEqual(seed.startAt);

    // 잡을 한 번 더, 같은 이벤트를 다시(같은 eventSeq는 무시, 새 eventSeq도 멱등)
    await runJob();
    await events.emitAsync('trip.started', {
      tripId: seed.tripId,
      groupId: seed.groupId,
      eventSeq: 1n,
    });
    await listener.drain();
    expect(
      await prisma.syncRun.count({
        where: { connectionId: sbConn.id, trigger: 'TRIP_START' },
      }),
    ).toBe(1);
    await events.emitAsync('trip.started', {
      tripId: seed.tripId,
      groupId: seed.groupId,
      eventSeq: 2n,
    });
    await listener.drain();
    expect(
      await prisma.syncRun.count({
        where: { connectionId: sbConn.id, trigger: 'TRIP_START', status: 'OK' },
      }),
    ).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: sb.id } })).toBe(
      2,
    );
    expect(await expensesOf(seed.tripId, sb.membershipId!)).toHaveLength(2);

    // 진행 중 참여(membership.joined) → 늦게 들어온 멤버도 기간 전체를 소급, 두 번 와도 그대로
    const joined = await prisma.membership.create({
      data: { groupId: seed.groupId, userId: mj.id, joinOrder: 2 },
    });
    const payload = {
      tripId: seed.tripId,
      groupId: seed.groupId,
      membershipId: joined.id,
      userId: mj.id,
      tripStatus: 'ONGOING',
      rejoined: false,
      eventSeq: 3n,
    };
    await events.emitAsync('membership.joined', payload);
    await events.emitAsync('membership.joined', {
      ...payload,
      eventSeq: undefined,
    });
    await listener.drain();
    const mjExpenses = await expensesOf(seed.tripId, joined.id);
    expect(mjExpenses.map((e) => e.merchantName)).toEqual([
      '난카이 라피트 간사이공항역',
      '오사카성 천수각',
      '우메다 스카이빌딩 공중정원',
      '간사이공항 보테쥬',
    ]);

    // 중복 의심(인입이 부르는 DuplicateFlagger = S2B-2 flagDuplicates): 수빈 10:30 · 민지 10:31 오사카성 ¥4,800
    const pair = [sbExpenses[0].id, mjExpenses[1].id];
    await prisma.expense.updateMany({
      where: { id: { in: pair } },
      data: { status: 'SHARED' },
    });
    const flaggedIds = await prisma.$transaction((tx) =>
      app.get(DuplicateFlagger).flagDuplicates(tx, pair[1]),
    );
    expect([...flaggedIds].sort()).toEqual([...pair].sort());
    const flagged = await prisma.expense.findMany({
      where: { id: { in: pair } },
      select: { duplicateGroupId: true },
    });
    expect(flagged[0].duplicateGroupId).not.toBeNull();
    expect(flagged[1].duplicateGroupId).toBe(flagged[0].duplicateGroupId);

    // 나간 멤버: 이후 인입 대상에서 빠진다(기존 결제는 그대로)
    await prisma.membership.update({
      where: { id: joined.id },
      data: { leftAt: new Date(), leaveReason: 'LEFT' },
    });
    await prisma.expense.deleteMany({
      where: {
        tripId: seed.tripId,
        payerMembershipId: joined.id,
        status: 'PENDING',
      },
    });
    await runJob();
    expect(
      await prisma.expense.count({
        where: { tripId: seed.tripId, payerMembershipId: joined.id },
      }),
    ).toBe(1);
  });

  it('expires on auth errors and backfills the gap on reconnect; pre-trip transactions are fetched only on demand (FR-805·404 AC2·408)', async () => {
    const seed = await seedTrip(prisma, {
      members: [{ nickname: '준용' }],
      status: 'ONGOING',
    });
    seeds.push(seed);
    const [jy] = seed.users;
    const me = asUser(jy);

    adapter.failList = 'AUTH_EXPIRED';
    adapter.failRefresh = 'AUTH_EXPIRED';
    await connect(me, { skip: ['카카오뱅크 세이프박스'] });
    const conn = await prisma.paymentConnection.findFirstOrThrow({
      where: { userId: me.id },
    });
    expect(conn).toMatchObject({
      status: 'EXPIRED',
      accessTokenEnc: null,
      lastSyncStatus: 'EXPIRED',
    });
    expect(
      await prisma.paymentMethod.count({
        where: { connectionId: conn.id, status: 'EXPIRED' },
      }),
    ).toBe(3);
    expect(await prisma.expense.count({ where: { tripId: seed.tripId } })).toBe(
      0,
    );
    const wallet = await request(server())
      .get('/api/payment-methods')
      .set(auth.headers(me))
      .expect(200);
    expect(wallet.body.hasExpiredConnection).toBe(true);
    await request(server())
      .post('/api/payment-methods/sync')
      .set(auth.headers(me))
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('CONNECTION_EXPIRED'));

    adapter.failList = null;
    adapter.failRefresh = null;
    const { candidates } = await connect(me, {
      purpose: 'RECONNECT',
      reconnectConnectionId: conn.id,
      skip: ['카카오뱅크 세이프박스'],
    });
    expect(
      candidates.map((c: { productName: string; preselected: boolean }) => [
        c.productName,
        c.preselected,
      ]),
    ).toEqual([
      ['토스뱅크 통장', true],
      ['토스뱅크 체크카드', true],
      ['신한카드 Deep Dream', true],
      ['카카오뱅크 세이프박스', false],
    ]);
    expect(
      await prisma.paymentConnection.findUniqueOrThrow({
        where: { id: conn.id },
      }),
    ).toMatchObject({ status: 'ACTIVE', expiredAt: null });
    expect(await prisma.expense.count({ where: { tripId: seed.tripId } })).toBe(
      6,
    );
    expect(
      await prisma.syncRun.findFirst({
        where: { connectionId: conn.id, status: 'OK' },
      }),
    ).toMatchObject({ trigger: 'RECONNECT' });

    const before = await prisma.transaction.count({
      where: { userId: me.id, occurredAt: { lt: seed.startAt } },
    });
    expect(before).toBe(0);
    const membership = auth.addMembership({
      user: me,
      tripId: seed.tripId,
      groupId: seed.groupId,
    });
    membership.membership.id = jy.membershipId!;
    const response = await request(server())
      .get(`/api/trips/${seed.tripId}/out-of-period-candidates?side=BEFORE`)
      .set(auth.headers(me))
      .expect(200);
    expect(response.body.length).toBeGreaterThan(0);
    expect(
      await prisma.transaction.count({
        where: { userId: me.id, occurredAt: { lt: seed.startAt } },
      }),
    ).toBe(0);
    const candidateId = response.body[0].candidateId;
    await request(server())
      .post(`/api/trips/${seed.tripId}/out-of-period-expenses`)
      .set(auth.headers(me))
      .send({ candidateIds: [candidateId] })
      .expect(201)
      .expect((r) => expect(r.body.added).toBe(1));
    expect(
      await prisma.expense.count({
        where: { tripId: seed.tripId, origin: 'OUT_OF_PERIOD' },
      }),
    ).toBe(1);
    await request(server())
      .post(`/api/trips/${seed.tripId}/out-of-period-expenses`)
      .set(auth.headers(me))
      .send({ candidateIds: [candidateId] })
      .expect(400);
  });

  it('runs a FINAL sync on trip.auto-ending (FR-305)', async () => {
    const seed = await seedTrip(prisma, {
      members: [{ nickname: '민지' }],
      status: 'ONGOING',
    });
    seeds.push(seed);
    const [mj] = seed.users;
    adapter.failList = 'UNAVAILABLE';
    await connect(asUser(mj));
    adapter.failList = null;
    await app.get(EventEmitter2).emitAsync('trip.auto-ending', {
      tripId: seed.tripId,
      groupId: seed.groupId,
    });
    const conn = await prisma.paymentConnection.findFirstOrThrow({
      where: { userId: mj.id },
    });
    expect(
      await prisma.syncRun.findFirst({
        where: { connectionId: conn.id, status: 'OK' },
      }),
    ).toMatchObject({ trigger: 'FINAL' });
    expect(await prisma.expense.count({ where: { tripId: seed.tripId } })).toBe(
      4,
    );
  });
});
