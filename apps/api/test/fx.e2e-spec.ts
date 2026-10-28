import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TripFxView, UpdateFxPolicyResponse } from '@yeojeong/shared';
import request from 'supertest';
import { FxPolicyService } from './../src/fx/fx-policy.service.js';
import {
  FX_RATE_SOURCE,
  type FxRateSource,
} from './../src/fx/fx-rate-source.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestAuth, type TestAuth } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import {
  createDbTestApp,
  hasDatabase,
  INTERNAL_SECRET,
  LedgerFixture,
  type FixtureMember,
} from './settlements-fixtures.js';

const withDb = await hasDatabase();
const SECRET_HEADER = 'x-internal-job-secret';
/** ISO 4217 시험용 코드. 공유 로컬 DB의 실제 통화 고시와 섞이지 않는다 */
const TEST_CURRENCY = 'XTS';
const TEST_SOURCE = 'S2C 테스트 고시';

describe('FX guards (e2e, no DB)', () => {
  let app: NestExpressApplication;
  let auth: TestAuth;
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    trip: { findMany: vi.fn().mockResolvedValue([]) },
    exchangeRate: { createMany: vi.fn().mockResolvedValue({ count: 17 }) },
  };

  afterEach(async () => {
    await app?.close();
    delete process.env.INTERNAL_JOB_SECRET;
  });

  const start = async (secret?: string) => {
    if (secret) process.env.INTERNAL_JOB_SECRET = secret;
    auth = createTestAuth();
    app = await createTestApp([], { auth, prisma });
  };

  it('runs the fx job only with the internal job secret', async () => {
    await start(INTERNAL_SECRET);
    const server = app.getHttpServer();
    const post = () =>
      request(server).post('/api/internal/jobs/fx').set(auth.headers());

    expect((await post().expect(403)).body.code).toBe('FORBIDDEN');
    await post().set(SECRET_HEADER, `${INTERNAL_SECRET}x`).expect(403);
    const res = await post().set(SECRET_HEADER, INTERNAL_SECRET).expect(200);
    expect(res.body).toMatchObject({
      source: '데모 매매기준율',
      inserted: 17,
      recalculatedTrips: 0,
    });
    expect(res.body.currencies).toContain('JPY');
  });

  it('stays closed when INTERNAL_JOB_SECRET is not configured', async () => {
    await start();
    await request(app.getHttpServer())
      .post('/api/internal/jobs/fx')
      .set(auth.headers())
      .set(SECRET_HEADER, '')
      .expect(403);
  });

  it('enforces leader and phase on fx-policy before touching the DB (FR-807)', async () => {
    await start();
    const server = app.getHttpServer();
    const leader = auth.addUser();
    const member = auth.addUser();
    const { trip } = auth.addMembership({
      user: leader,
      role: 'LEADER',
      tripStatus: 'ONGOING',
    });
    auth.addMembership({
      user: member,
      tripId: trip!.id,
      groupId: trip!.groupId,
      tripStatus: 'ONGOING',
    });
    const ended = auth.addMembership({
      user: leader,
      role: 'LEADER',
      tripStatus: 'ENDED',
    });
    const patch = (tripId: string, who: typeof leader) =>
      request(server)
        .patch(`/api/trips/${tripId}/fx-policy`)
        .set(auth.headers(who));

    const notLeader = await patch(trip!.id, member)
      .send({ policy: 'FIXED', fixedRate: '900', version: 0 })
      .expect(403);
    expect(notLeader.body.code).toBe('NOT_LEADER');
    const locked = await patch(ended.trip!.id, leader)
      .send({ policy: 'FIXED', fixedRate: '900', version: 0 })
      .expect(409);
    expect(locked.body.code).toBe('FX_POLICY_LOCKED');

    const missing = await patch(trip!.id, leader)
      .send({ policy: 'FIXED', version: 0 })
      .expect(400);
    expect(
      missing.body.details.fields.map((f: { path: string }) => f.path),
    ).toContain('fixedRate');
    await patch(trip!.id, leader)
      .send({ policy: 'FIXED', fixedRate: '9.123', version: 0 })
      .expect(400);
    await patch(trip!.id, leader)
      .send({ policy: 'MAGIC', version: 0 })
      .expect(400);
  });

  it('validates the rate query', async () => {
    await start();
    const me = auth.addUser();
    const get = (query: string) =>
      request(app.getHttpServer()).get(`/api/fx${query}`).set(auth.headers(me));
    await get('?base=KRW').expect(400);
    await get('?base=JP').expect(400);
    await get('?base=JPY&date=yesterday').expect(400);
    await request(app.getHttpServer()).get('/api/fx?base=JPY').expect(401);
  });
});

describe.skipIf(!withDb)('FX (e2e, real DB)', () => {
  let app: NestExpressApplication;
  let auth: TestAuth;
  let fixture: LedgerFixture;
  let prisma: PrismaService;
  const source: FxRateSource = {
    id: 'test',
    sourceLabel: TEST_SOURCE,
    fetchLatest: () =>
      Promise.resolve([
        {
          currency: TEST_CURRENCY,
          ratePerUnit: '13',
          displayUnit: 1,
          effectiveAt: new Date('2031-02-01T02:00:00Z'),
        },
      ]),
  };

  beforeAll(async () => {
    auth = createTestAuth();
    app = await createDbTestApp(auth, (b) =>
      b.overrideProvider(FX_RATE_SOURCE).useValue(source),
    );
    fixture = LedgerFixture.from(app);
    prisma = app.get(PrismaService);
    await prisma.exchangeRate.createMany({
      data: [
        {
          quoteCurrency: TEST_CURRENCY,
          rate: '10',
          source: TEST_SOURCE,
          effectiveAt: new Date('2031-01-01T00:00:00Z'),
        },
        {
          quoteCurrency: TEST_CURRENCY,
          rate: '12',
          source: TEST_SOURCE,
          effectiveAt: new Date('2031-01-02T00:00:00Z'),
        },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await fixture?.cleanup();
    await prisma?.exchangeRate.deleteMany({
      where: { quoteCurrency: TEST_CURRENCY, source: TEST_SOURCE },
    });
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const patch = (tripId: string, who: FixtureMember, body: object) =>
    request(server())
      .patch(`/api/trips/${tripId}/fx-policy`)
      .set(auth.headers(who.user))
      .send(body);
  const view = async (tripId: string, who: FixtureMember) =>
    (
      await request(server())
        .get(`/api/trips/${tripId}/fx-policy`)
        .set(auth.headers(who.user))
        .expect(200)
    ).body as TripFxView;

  it('GET /api/fx returns the rate valid at that time with the display rule', async () => {
    const me = auth.addUser();
    const get = (query: string) =>
      request(server()).get(`/api/fx${query}`).set(auth.headers(me));
    const latest = (
      await get(`?base=${TEST_CURRENCY.toLowerCase()}`).expect(200)
    ).body;
    expect(latest).toMatchObject({
      currency: TEST_CURRENCY,
      rate: '12.000000',
      displayUnit: 1,
      label: '1XTS = 12.00원',
      source: TEST_SOURCE,
    });

    const onDay = (
      await get(`?base=${TEST_CURRENCY}&date=2031-01-01`).expect(200)
    ).body;
    expect(onDay).toMatchObject({
      rate: '10.000000',
      displayRate: '10.00',
      effectiveAt: '2031-01-01T09:00:00+09:00',
    });

    expect(
      (await get(`?base=${TEST_CURRENCY}&date=2030-12-31`).expect(503)).body
        .code,
    ).toBe('FX_RATE_UNAVAILABLE');
    await get('?base=QQQ').expect(503);
  });

  it('switches to a fixed rate, recalculates shares, logs and notifies (FR-807·808 #2)', async () => {
    const t = await fixture.createTrip({
      members: [{ nickname: '준용' }, { nickname: '민지' }],
      currency: 'JPY',
    });
    const [leader, member] = t.members;
    const taxi = await fixture.addShared(
      t.tripId,
      leader,
      26_290,
      [leader, member],
      {
        merchantName: 'MK택시',
        originalAmount: '2860',
        currency: 'JPY',
      },
    );

    const before = await view(t.tripId, leader);
    expect(before).toMatchObject({
      tripCurrency: 'JPY',
      currencyNameKo: '엔',
      displayUnit: 100,
      policy: 'SPOT_AT_PAYMENT',
      canEdit: true,
      isKrwTrip: false,
    });
    expect((await view(t.tripId, member)).canEdit).toBe(false);

    const res = await patch(t.tripId, leader, {
      policy: 'FIXED',
      fixedRate: '900',
      version: before.version,
    }).expect(200);
    const body = res.body as UpdateFxPolicyResponse;
    expect(body.recalculatedCount).toBe(1);
    expect(body.fx).toMatchObject({
      policy: 'FIXED',
      fixedRate: '900.00',
      version: before.version + 1,
    });

    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: taxi },
      include: { shares: true },
    });
    expect(expense).toMatchObject({
      krwAmount: 25_740,
      netKrwAmount: 25_740,
      fxPolicyApplied: 'FIXED',
      fxRateUnit: 100,
      fxRateSource: '고정 환율',
      changedAfterShared: false,
    });
    expect(expense.fxRate?.toFixed(6)).toBe('9.000000');
    expect(expense.shares.map((s) => s.amountKrw)).toEqual([12_870, 12_870]);
    expect(
      await prisma.expenseChangeLog.count({
        where: { expenseId: taxi, action: 'FX_RECALCULATED' },
      }),
    ).toBe(1);
    expect(
      await prisma.tripEvent.count({
        where: { tripId: t.tripId, type: 'FX_POLICY_CHANGED' },
      }),
    ).toBe(1);

    const stale = await patch(t.tripId, leader, {
      policy: 'SPOT_AT_PAYMENT',
      version: before.version,
    }).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(stale.body.details.current.version).toBe(before.version + 1);

    // 같은 값이면 멱등(version·이력 그대로)
    const same = (
      await patch(t.tripId, leader, {
        policy: 'FIXED',
        fixedRate: '900.00',
        version: before.version + 1,
      }).expect(200)
    ).body as UpdateFxPolicyResponse;
    expect(same).toMatchObject({
      recalculatedCount: 0,
      fx: { version: before.version + 1 },
    });

    await patch(t.tripId, leader, {
      policy: 'FIXED',
      fixedRate: '0',
      version: before.version + 1,
    }).expect(400);
  });

  it('recalculates each payment with the spot rate at its own payment time', async () => {
    const t = await fixture.createTrip({
      members: [{ nickname: 'L' }, { nickname: 'M' }],
      currency: TEST_CURRENCY,
      fxPolicy: 'FIXED',
      fxFixedRate: '5',
    });
    const [leader, member] = t.members;
    const first = await fixture.addShared(
      t.tripId,
      leader,
      500,
      [leader, member],
      {
        originalAmount: '100',
        currency: TEST_CURRENCY,
        occurredAt: '2031-01-01T21:00:00+09:00',
      },
    );
    const second = await fixture.addShared(
      t.tripId,
      member,
      280,
      [leader, member],
      {
        originalAmount: '55.5',
        currency: TEST_CURRENCY,
        occurredAt: '2031-01-02T21:00:00+09:00',
      },
    );

    const { version } = await view(t.tripId, leader);
    const body = (
      await patch(t.tripId, leader, {
        policy: 'SPOT_AT_PAYMENT',
        version,
      }).expect(200)
    ).body as UpdateFxPolicyResponse;
    expect(body.recalculatedCount).toBe(2);
    const rows = await prisma.expense.findMany({
      where: { id: { in: [first, second] } },
      include: { shares: true },
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[first]).toMatchObject({
      krwAmount: 1_000,
      fxRateSource: TEST_SOURCE,
    }); // 100 × 10
    expect(byId[second].krwAmount).toBe(670); // 55.5 × 12 = 666 → 670
    expect(byId[second].shares.map((s) => s.amountKrw).sort()).toEqual([
      335, 335,
    ]);
  });

  it('rejects fx-policy changes for KRW trips', async () => {
    const t = await fixture.createTrip({
      members: [{ nickname: 'K' }],
      currency: 'KRW',
    });
    const fx = await view(t.tripId, t.members[0]);
    expect(fx).toMatchObject({
      isKrwTrip: true,
      current: null,
      canEdit: false,
    });
    const res = await patch(t.tripId, t.members[0], {
      policy: 'FIXED',
      fixedRate: '1',
      version: fx.version,
    }).expect(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('stores collected rates once and re-applies them to ongoing trips', async () => {
    const t = await fixture.createTrip({
      members: [{ nickname: 'J' }],
      currency: TEST_CURRENCY,
    });
    // 공유 로컬 DB의 다른 여정은 다시 계산하지 않는다
    const recalc = vi
      .spyOn(app.get(FxPolicyService), 'recalculateOngoing')
      .mockResolvedValue(0);
    const post = () =>
      request(server())
        .post('/api/internal/jobs/fx')
        .set(auth.headers())
        .set(SECRET_HEADER, INTERNAL_SECRET);

    const first = await post().expect(200);
    expect(first.body).toMatchObject({
      source: TEST_SOURCE,
      fetched: 1,
      inserted: 1,
    });
    expect(first.body.currencies).toContain(TEST_CURRENCY);
    expect(recalc).toHaveBeenCalledWith(t.tripId);
    expect((await post().expect(200)).body.inserted).toBe(0); // 같은 고시는 한 번만
    recalc.mockRestore();
  });
});
