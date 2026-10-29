import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TripStatus } from '@yeojeong/shared';
import request from 'supertest';
import { addDays, kstDate } from './../src/trips/kst.js';
import { createTestAuth, TEST_ORIGIN, type TestAuth } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';

// DB 없이(CI) 도는 S2A e2e: 가드·검증·내부 잡 시크릿처럼 서비스가 DB에 닿기 전에 끝나는 경로.
// 트랜잭션·제약·전체 흐름은 trips-flow.e2e-spec.ts(실제 DB)가 맡는다.
describe('S2A trips·groups guards (e2e)', () => {
  let app: NestExpressApplication;
  let auth: TestAuth;
  const internalJobSecret = 'a'.repeat(40);
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    trip: { findMany: vi.fn().mockResolvedValue([]) },
  };

  beforeEach(async () => {
    vi.stubEnv('INTERNAL_JOB_SECRET', internalJobSecret);
    auth = createTestAuth();
    app = await createTestApp([], { auth, prisma });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const server = () => app.getHttpServer();
  const today = kstDate(new Date());
  const validTrip = {
    groupName: '오사카 3박 4일',
    place: { label: '오사카' },
    currency: 'JPY',
    startDate: today,
    endDate: addDays(today, 3),
    budgetKrw: 1_200_000,
  };

  function member(role: 'LEADER' | 'MEMBER', tripStatus: TripStatus) {
    const user = auth.addUser();
    const { membership, trip } = auth.addMembership({ user, role, tripStatus });
    return { user, membership, trip: trip! };
  }

  it('requires a session', async () => {
    await request(server()).get('/api/me/trips').expect(401);
    await request(server())
      .post('/api/trips')
      .set(auth.headers())
      .send(validTrip)
      .expect(401);
    await request(server()).get('/api/invites/K7M2QX').expect(401);
  });

  describe('POST /api/trips validation', () => {
    const post = (body: object) =>
      request(server())
        .post('/api/trips')
        .set(auth.headers(auth.addUser()))
        .send(body);
    const codes = (res: request.Response) =>
      (res.body.details.fields as { path: string; code: string }[]).map(
        (f) => `${f.path}:${f.code}`,
      );

    it('reports every invalid field', async () => {
      const res = await post({
        groupName: '',
        place: { countryCode: 'jp' },
        startDate: '11/12',
        budgetKrw: 0,
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(codes(res)).toEqual(
        expect.arrayContaining([
          'groupName:isLength',
          'place.countryCode:matches',
          'place.label:isLength',
          'currency:isIn',
          'startDate:matches',
          'endDate:matches',
          'budgetKrw:min',
        ]),
      );
      await post({ ...validTrip, extra: 1 }).expect(400);
      await post({ ...validTrip, groupName: '가'.repeat(21) }).expect(400);
      await post({ ...validTrip, budgetKrw: 1_000_000_001 }).expect(400);
    });

    it('requires a free-text place and a supported currency', async () => {
      const fields = (res: request.Response) =>
        res.body.details.fields as {
          path: string;
          code: string;
          message: string;
        }[];
      const { currency: _omit, ...noCurrency } = validTrip;
      expect(fields(await post(noCurrency).expect(400))).toEqual([
        { path: 'currency', code: 'isIn', message: '통화를 골라 주세요' },
      ]);
      expect(
        fields(await post({ ...validTrip, currency: 'ZZZ' }).expect(400)),
      ).toEqual([
        { path: 'currency', code: 'isIn', message: '지원하지 않는 통화예요' },
      ]);
      // 지원 목록 밖(환율 표에 없는 통화)도 400
      await post({ ...validTrip, currency: 'MOP' }).expect(400);
      expect(
        fields(
          await post({ ...validTrip, place: { label: '   ' } }).expect(400),
        ),
      ).toEqual([
        {
          path: 'place.label',
          code: 'isLength',
          message: '여행 장소를 입력해 주세요',
        },
      ]);
      expect(
        fields(
          await post({
            ...validTrip,
            place: { label: '가'.repeat(41) },
          }).expect(400),
        ),
      ).toEqual([
        {
          path: 'place.label',
          code: 'isLength',
          message: '여행 장소는 40자까지예요',
        },
      ]);
      expect(
        codes(await post({ ...validTrip, place: undefined }).expect(400)),
      ).toContain('place:isObject');
    });

    it('checks the period before touching the DB', async () => {
      expect(
        codes(
          await post({ ...validTrip, endDate: addDays(today, -1) }).expect(400),
        ),
      ).toEqual(['endDate:endBeforeStart']);
      expect(
        codes(
          await post({ ...validTrip, endDate: addDays(today, 31) }).expect(400),
        ),
      ).toEqual(['endDate:maxDays']);
      expect(
        codes(
          await post({
            ...validTrip,
            startDate: addDays(today, -31),
            endDate: addDays(today, -30),
          }).expect(400),
        ),
      ).toEqual(['startDate:startTooEarly']);
      expect(
        codes(
          await post({ ...validTrip, startDate: '2026-02-30' }).expect(400),
        ),
      ).toContain('startDate:isDate');
    });
  });

  it('hides trips and groups from non-members with 404', async () => {
    const { trip } = member('LEADER', 'UPCOMING');
    const stranger = auth.addUser();
    const h = auth.headers(stranger);
    await request(server()).get(`/api/trips/${trip.id}`).set(h).expect(404);
    await request(server())
      .patch(`/api/trips/${trip.id}`)
      .set(h)
      .send({ version: 0 })
      .expect(404);
    await request(server())
      .post(`/api/trips/${trip.id}/start`)
      .set(h)
      .send({ version: 0 })
      .expect(404);
    await request(server())
      .get(`/api/groups/${trip.groupId}/members`)
      .set(h)
      .expect(404);
    await request(server())
      .post(`/api/groups/${trip.groupId}/leave`)
      .set(h)
      .expect(404);
    await request(server())
      .delete(`/api/groups/${trip.groupId}`)
      .set(h)
      .expect(404);
    await request(server()).get('/api/trips/not-a-uuid').set(h).expect(404);
  });

  it('returns 403 NOT_LEADER on leader-only routes', async () => {
    const { user, trip } = member('MEMBER', 'ONGOING');
    const h = auth.headers(user);
    const upcoming = member('MEMBER', 'UPCOMING');
    const uh = auth.headers(upcoming.user);
    const expectNotLeader = (r: request.Response) =>
      expect(r.body.code).toBe('NOT_LEADER');

    await request(server())
      .patch(`/api/trips/${trip.id}`)
      .set(h)
      .send({ version: 0 })
      .expect(403)
      .expect(expectNotLeader);
    await request(server())
      .get(`/api/trips/${trip.id}/end-preview`)
      .set(h)
      .expect(403)
      .expect(expectNotLeader);
    await request(server())
      .post(`/api/trips/${trip.id}/end`)
      .set(h)
      .send({ version: 0 })
      .expect(403)
      .expect(expectNotLeader);
    await request(server())
      .delete(`/api/groups/${trip.groupId}/members/${randomUUID()}`)
      .set(h)
      .expect(403)
      .expect(expectNotLeader);
    await request(server())
      .post(`/api/trips/${upcoming.trip.id}/start`)
      .set(uh)
      .send({ version: 0 })
      .expect(403)
      .expect(expectNotLeader);
    await request(server())
      .delete(`/api/groups/${upcoming.trip.groupId}`)
      .set(uh)
      .expect(403)
      .expect(expectNotLeader);
  });

  it('returns 409 TRIP_PHASE_INVALID for the wrong phase', async () => {
    const ongoing = member('LEADER', 'ONGOING');
    const upcoming = member('LEADER', 'UPCOMING');
    const ended = member('LEADER', 'ENDED');
    const phase = (r: request.Response) =>
      expect(r.body.code).toBe('TRIP_PHASE_INVALID');

    await request(server())
      .post(`/api/trips/${ongoing.trip.id}/start`)
      .set(auth.headers(ongoing.user))
      .send({ version: 0 })
      .expect(409)
      .expect(phase);
    await request(server())
      .delete(`/api/groups/${ongoing.trip.groupId}`)
      .set(auth.headers(ongoing.user))
      .expect(409)
      .expect(phase);
    await request(server())
      .get(`/api/trips/${upcoming.trip.id}/end-preview`)
      .set(auth.headers(upcoming.user))
      .expect(409)
      .expect(phase);
    await request(server())
      .post(`/api/trips/${upcoming.trip.id}/end`)
      .set(auth.headers(upcoming.user))
      .send({ version: 0 })
      .expect(409)
      .expect(phase);
    await request(server())
      .patch(`/api/trips/${ended.trip.id}`)
      .set(auth.headers(ended.user))
      .send({ version: 0 })
      .expect(409)
      .expect(phase);
    await request(server())
      .delete(`/api/groups/${ended.trip.groupId}/members/${randomUUID()}`)
      .set(auth.headers(ended.user))
      .expect(409)
      .expect(phase);
  });

  it('validates kick targets and bodies before the DB', async () => {
    const { user, membership, trip } = member('LEADER', 'ONGOING');
    const h = auth.headers(user);
    await request(server())
      .delete(`/api/groups/${trip.groupId}/members/123`)
      .set(h)
      .expect(404);
    await request(server())
      .delete(`/api/groups/${trip.groupId}/members/${membership.id}`)
      .set(h)
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('CANNOT_KICK_SELF'));
    await request(server())
      .post(`/api/trips/${trip.id}/end`)
      .set(h)
      .send({})
      .expect(400);
    await request(server())
      .post(`/api/trips/${trip.id}/events/ack`)
      .set(h)
      .send({ lastEventId: 'x' })
      .expect(400);
    await request(server())
      .get(`/api/groups/${trip.groupId}/members?includeLeft=maybe`)
      .set(h)
      .expect(400);
  });

  it('rejects malformed invite codes with INVITE_CODE_INVALID', async () => {
    const h = auth.headers(auth.addUser());
    for (const code of ['ABC', 'K7M2QXX', 'O0I1LZ']) {
      await request(server())
        .get(`/api/invites/${code}`)
        .set(h)
        .expect(404)
        .expect((r) => expect(r.body.code).toBe('INVITE_CODE_INVALID'));
    }
    await request(server()).post('/api/invites/ABC/join').set(h).expect(404);
  });

  it('lists the supported currencies with KRW first', async () => {
    const h = auth.headers(auth.addUser());
    await request(server()).get('/api/currencies').expect(401);
    const res = await request(server())
      .get('/api/currencies')
      .set(h)
      .expect(200);
    expect(res.body[0]).toEqual({
      code: 'KRW',
      name: '대한민국 원',
      unitName: '원',
      displayUnit: 1,
    });
    expect(res.body).toContainEqual({
      code: 'JPY',
      name: '일본 엔',
      unitName: '엔',
      displayUnit: 100,
    });
    expect(
      (res.body as { code: string }[]).filter((c) => c.code === 'KRW'),
    ).toHaveLength(1);
  });

  it('searches places', async () => {
    const h = auth.headers(auth.addUser());
    const res = await request(server())
      .get('/api/places')
      .query({ query: '오사카' })
      .set(h)
      .expect(200);
    expect(res.body).toEqual([
      {
        countryCode: 'JP',
        countryName: '일본',
        city: '오사카',
        label: '일본 오사카',
        currency: 'JPY',
      },
    ]);
    const all = await request(server()).get('/api/places').set(h).expect(200);
    expect(all.body).toHaveLength(20);
  });

  describe('POST /api/internal/jobs/auto-end', () => {
    const job = () =>
      request(server())
        .post('/api/internal/jobs/auto-end')
        .set('Origin', TEST_ORIGIN);

    it('requires the matching secret header', async () => {
      await job().expect(403);
      await job()
        .set('x-internal-job-secret', `${internalJobSecret}x`)
        .expect(403);
      await job()
        .set('x-internal-job-secret', internalJobSecret)
        .expect(200)
        .expect({ endedTripIds: [], redeliveredTripIds: [] });
      // @InternalJob은 CSRF 대신 내부 잡 인증으로 방어한다.
      await request(server())
        .post('/api/internal/jobs/auto-end')
        .set('x-internal-job-secret', internalJobSecret)
        .expect(200);
    });
  });
});
