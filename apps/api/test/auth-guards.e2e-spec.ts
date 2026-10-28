import { randomUUID } from 'node:crypto';
import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERRORS, FIN_LINK_REQUIRED_CONSENTS } from '@yeojeong/shared';
import request from 'supertest';
import {
  CurrentMembership,
  CurrentTrip,
  CurrentUser,
  Public,
  RequireConsents,
  RequireRole,
  RequireTripStatus,
  SkipConsentCheck,
  type AuthUser,
  type MembershipContext,
  type TripContext,
} from './../src/common/auth/index.js';
import { createTestAuth, TEST_ORIGIN, type TestAuth } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';

// 테스트에서만 등록하는 컨트롤러. 가드 체인(CSRF → 인증 → 동의 → 멤버십 → 여정 단계)을 확인한다.
@Controller('guard-probe')
class GuardProbeController {
  @Public()
  @Get('public')
  open(@CurrentUser({ optional: true }) user?: AuthUser) {
    return { userId: user?.id ?? null };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { userId: user.id };
  }

  @Post('me')
  change(@CurrentUser() user: AuthUser) {
    return { userId: user.id };
  }

  @SkipConsentCheck()
  @Post('reconsent')
  reconsent() {
    return { ok: true };
  }

  @RequireConsents(FIN_LINK_REQUIRED_CONSENTS)
  @Post('connect')
  connect() {
    return { ok: true };
  }

  @Get('trips/:tripId')
  trip(
    @Param('tripId') _tripId: string,
    @CurrentMembership() membership: MembershipContext,
    @CurrentTrip() trip: TripContext,
  ) {
    return { membershipId: membership.id, status: trip.status };
  }

  @RequireRole('LEADER')
  @RequireTripStatus(['UPCOMING', 'ONGOING'])
  @Delete('groups/:groupId/members/:membershipId')
  kick(@CurrentMembership() membership: MembershipContext) {
    return { by: membership.id };
  }

  @RequireTripStatus('ONGOING', { code: 'EXPENSE_LOCKED' })
  @Post('trips/:tripId/expenses')
  classify() {
    return { ok: true };
  }
}

describe('Auth guards (e2e)', () => {
  let app: NestExpressApplication;
  let auth: TestAuth;

  beforeEach(async () => {
    auth = createTestAuth();
    app = await createTestApp([GuardProbeController], { auth });
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('requires a session by default and keeps @Public() routes open', async () => {
    const res = await request(server()).get('/api/guard-probe/me').expect(401);
    expect(res.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: ERRORS.UNAUTHENTICATED.message,
      requestId: res.headers['x-request-id'],
    });
    await request(server())
      .get('/api/guard-probe/public')
      .expect(200)
      .expect({ userId: null });
    await request(server()).get('/api/health').expect(200);
  });

  it('attaches the signed-in user', async () => {
    const me = auth.addUser();
    await request(server())
      .get('/api/guard-probe/me')
      .set(auth.headers(me))
      .expect(200)
      .expect({ userId: me.id });
    await request(server())
      .get('/api/guard-probe/public')
      .set(auth.headers(me))
      .expect(200)
      .expect({ userId: me.id });
  });

  it('rejects state changes from another origin before authentication', async () => {
    const me = auth.addUser();
    const { Cookie } = auth.headers(me);
    const res = await request(server())
      .post('/api/guard-probe/me')
      .set('Cookie', Cookie)
      .set('Origin', 'https://evil.example.com')
      .expect(403);
    expect(res.body.code).toBe('CSRF_REJECTED');

    await request(server())
      .post('/api/guard-probe/me')
      .set('Cookie', Cookie)
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('CSRF_REJECTED'));

    // 비로그인이어도 CSRF가 먼저다
    await request(server())
      .post('/api/guard-probe/me')
      .set('Origin', 'https://evil.example.com')
      .expect(403);

    await request(server())
      .post('/api/guard-probe/me')
      .set(auth.headers(me))
      .expect(201)
      .expect({ userId: me.id });
    await request(server())
      .post('/api/guard-probe/me')
      .set('Cookie', Cookie)
      .set('Sec-Fetch-Site', 'same-origin')
      .expect(201);
  });

  describe('consents', () => {
    it('returns 403 CONSENT_REQUIRED with the missing items', async () => {
      const me = auth.addUser();
      auth.withoutConsent(me, 'TOS');
      const res = await request(server())
        .get('/api/guard-probe/me')
        .set(auth.headers(me))
        .expect(403);
      expect(res.body).toEqual({
        code: 'CONSENT_REQUIRED',
        message: ERRORS.CONSENT_REQUIRED.message,
        details: {
          missing: ['TOS'],
          required: [{ id: 'TOS', version: 'test' }],
        },
        requestId: res.headers['x-request-id'],
      });
    });

    it('still allows @Public() and @SkipConsentCheck() routes', async () => {
      const me = auth.addUser();
      auth.withoutConsent(me, 'PRIVACY');
      await request(server())
        .get('/api/guard-probe/public')
        .set(auth.headers(me))
        .expect(200);
      await request(server())
        .post('/api/guard-probe/reconsent')
        .set(auth.headers(me))
        .expect(201);
    });

    it('checks route consents with @RequireConsents()', async () => {
      const me = auth.addUser();
      auth.withoutConsent(me, 'THIRD_PARTY');
      const res = await request(server())
        .post('/api/guard-probe/connect')
        .set(auth.headers(me))
        .expect(403);
      expect(res.body.details.missing).toEqual(['THIRD_PARTY']);

      const other = auth.addUser();
      await request(server())
        .post('/api/guard-probe/connect')
        .set(auth.headers(other))
        .expect(201);
    });
  });

  describe('membership', () => {
    it('attaches the membership and trip for an active member', async () => {
      const me = auth.addUser();
      const { membership, trip } = auth.addMembership({
        user: me,
        tripStatus: 'UPCOMING',
      });
      await request(server())
        .get(`/api/guard-probe/trips/${trip!.id}`)
        .set(auth.headers(me))
        .expect(200)
        .expect({ membershipId: membership.id, status: 'UPCOMING' });
    });

    it('returns 404 to non-members and for malformed IDs', async () => {
      const owner = auth.addUser();
      const stranger = auth.addUser();
      const { trip } = auth.addMembership({ user: owner });

      const res = await request(server())
        .get(`/api/guard-probe/trips/${trip!.id}`)
        .set(auth.headers(stranger))
        .expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
      await request(server())
        .get(`/api/guard-probe/trips/${randomUUID()}`)
        .set(auth.headers(owner))
        .expect(404);
      await request(server())
        .get('/api/guard-probe/trips/1')
        .set(auth.headers(owner))
        .expect(404);
    });

    it('returns 403 NOT_LEADER to members on leader routes', async () => {
      const leader = auth.addUser();
      const member = auth.addUser();
      const groupId = randomUUID();
      auth.addMembership({ user: leader, groupId, role: 'LEADER' });
      auth.addMembership({ user: member, groupId });
      const path = `/api/guard-probe/groups/${groupId}/members/${randomUUID()}`;

      const res = await request(server())
        .delete(path)
        .set(auth.headers(member))
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'NOT_LEADER',
        message: ERRORS.NOT_LEADER.message,
      });
      await request(server())
        .delete(path)
        .set(auth.headers(leader))
        .expect(200);
    });

    it('rejects the wrong trip phase with the configured code', async () => {
      const me = auth.addUser();
      const { trip } = auth.addMembership({ user: me, tripStatus: 'ENDED' });
      const res = await request(server())
        .post(`/api/guard-probe/trips/${trip!.id}/expenses`)
        .set(auth.headers(me))
        .expect(409);
      expect(res.body.code).toBe('EXPENSE_LOCKED');

      const groupId = randomUUID();
      auth.addMembership({
        user: me,
        groupId,
        role: 'LEADER',
        tripStatus: 'ENDED',
      });
      await request(server())
        .delete(`/api/guard-probe/groups/${groupId}/members/${randomUUID()}`)
        .set(auth.headers(me))
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('TRIP_PHASE_INVALID'));
    });
  });

  it('uses the configured web origin for CSRF', () => {
    expect(TEST_ORIGIN).toBe(process.env.WEB_BASE_URL);
  });
});
