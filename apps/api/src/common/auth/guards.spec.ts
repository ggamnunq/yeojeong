import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../errors/app-exception.js';
import { InternalJob } from '../internal-job/index.js';
import type { AuthContext } from './auth-context.js';
import type { ConsentChecker } from './consent-checker.js';
import {
  Public,
  RequireConsents,
  RequireRole,
  RequireTripStatus,
  SkipConsentCheck,
} from './decorators.js';
import {
  AuthGuard,
  ConsentGuard,
  CsrfGuard,
  MembershipGuard,
  TripStatusGuard,
} from './guards.js';
import type {
  MembershipLookup,
  MembershipLookupResult,
} from './membership-lookup.js';
import type { SessionResolver, SessionState } from './session-resolver.js';
import { WebConfig } from './web-config.js';

const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const AUTH: AuthContext = {
  user: { id: 'user-1', nickname: '준용', profileImageUrl: null },
  session: { id: 'session-1', expiresAt: new Date(Date.now() + 1000) },
};

// 데코레이터를 붙인 가짜 핸들러로 ExecutionContext를 만든다
function context(
  req: Partial<Request>,
  ...decorators: MethodDecorator[]
): { ctx: ExecutionContext; req: Request } {
  class Probe {
    handler() {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    Probe.prototype,
    'handler',
  )!;
  for (const decorate of decorators) {
    decorate(Probe.prototype, 'handler', descriptor);
  }
  const request = { headers: {}, params: {}, method: 'GET', ...req } as Request;
  const ctx = {
    getType: () => 'http',
    getHandler: () => descriptor.value as () => void,
    getClass: () => Probe,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
  return { ctx, req: request };
}

async function expectCode(promise: unknown, code: string) {
  await expect(Promise.resolve().then(() => promise)).rejects.toSatisfy(
    (error) => error instanceof AppException && error.code === code,
  );
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard(
    new WebConfig(
      new ConfigService({
        WEB_BASE_URL: 'https://jinyeojeong.com',
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    ),
    new Reflector(),
  );
  const run = (req: Partial<Request>) => () =>
    guard.canActivate(context(req).ctx);

  it('lets safe methods through without an Origin', () => {
    expect(run({ method: 'GET' })()).toBe(true);
  });

  it.each(['https://jinyeojeong.com', 'http://localhost:5173'])(
    'accepts POST from %s',
    (origin) => {
      expect(run({ method: 'POST', headers: { origin } })()).toBe(true);
    },
  );

  it.each([
    { origin: 'https://evil.example.com' },
    { origin: 'null' },
    { origin: 'https://jinyeojeong.com.evil.com' },
    {},
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'cross-site' },
  ])('rejects state changes with headers %o', (headers) => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(run({ method, headers })).toThrow(
        expect.objectContaining({ code: 'CSRF_REJECTED' }),
      );
    }
  });

  it('accepts a same-origin request without an Origin header', () => {
    expect(
      run({ method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } })(),
    ).toBe(true);
  });

  it('leaves @InternalJob authentication to the internal job guard', () => {
    expect(
      guard.canActivate(
        context({ method: 'POST', headers: {} }, InternalJob()).ctx,
      ),
    ).toBe(true);
  });
});

describe('AuthGuard', () => {
  const resolver = (state: SessionState) =>
    ({ resolve: vi.fn().mockResolvedValue(state) }) as SessionResolver;
  const authenticated: SessionState = { status: 'AUTHENTICATED', ...AUTH };

  it('attaches the user on any route when the session is valid', async () => {
    const guard = new AuthGuard(new Reflector(), resolver(authenticated));
    const { ctx, req } = context({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.auth).toEqual(AUTH);
  });

  it('rejects anonymous requests with 401 by default', async () => {
    const guard = new AuthGuard(
      new Reflector(),
      resolver({ status: 'ANONYMOUS' }),
    );
    await expectCode(guard.canActivate(context({}).ctx), 'UNAUTHENTICATED');
  });

  it('tells a pending signup apart with 403 SIGNUP_REQUIRED', async () => {
    const guard = new AuthGuard(
      new Reflector(),
      resolver({ status: 'SIGNUP_REQUIRED' }),
    );
    await expectCode(guard.canActivate(context({}).ctx), 'SIGNUP_REQUIRED');
  });

  it('lets anonymous requests through on @Public() routes', async () => {
    const guard = new AuthGuard(
      new Reflector(),
      resolver({ status: 'ANONYMOUS' }),
    );
    const { ctx, req } = context({}, Public());
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.auth).toBeUndefined();
  });
});

describe('ConsentGuard', () => {
  const checker = (missing: Record<string, string>) => {
    const findMissing = vi.fn((_userId: string, ids: readonly string[]) =>
      Promise.resolve(
        ids
          .filter((id) => id in missing)
          .map((id) => ({ id, version: missing[id] })),
      ),
    );
    return Object.assign({ findMissing } as unknown as ConsentChecker, {
      calls: findMissing,
    });
  };

  it('passes when every required consent is valid', async () => {
    const guard = new ConsentGuard(new Reflector(), checker({}));
    await expect(guard.canActivate(context({ auth: AUTH }).ctx)).resolves.toBe(
      true,
    );
  });

  it('requires the signup consents first', async () => {
    const guard = new ConsentGuard(
      new Reflector(),
      checker({ TOS: '2026-12-01', FIN_LINK: '2026-12-01' }),
    );
    const { ctx } = context(
      { auth: AUTH },
      RequireConsents(['FIN_LINK', 'FIN_PRIVACY']),
    );
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
      details: {
        missing: ['TOS'],
        required: [{ id: 'TOS', version: '2026-12-01' }],
      },
    });
  });

  it('then checks consents required by the route', async () => {
    const guard = new ConsentGuard(
      new Reflector(),
      checker({ FIN_PRIVACY: '2026-12-01' }),
    );
    const { ctx } = context(
      { auth: AUTH },
      RequireConsents(['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY']),
    );
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
      details: { missing: ['FIN_PRIVACY'] },
    });
  });

  it('skips anonymous, @Public() and @SkipConsentCheck() requests', async () => {
    const missing = checker({ TOS: '2026-12-01' });
    const guard = new ConsentGuard(new Reflector(), missing);
    await expect(guard.canActivate(context({}).ctx)).resolves.toBe(true);
    await expect(
      guard.canActivate(context({ auth: AUTH }, Public()).ctx),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context({ auth: AUTH }, SkipConsentCheck()).ctx),
    ).resolves.toBe(true);
    expect(missing.calls).not.toHaveBeenCalled();
  });
});

describe('MembershipGuard', () => {
  const found = (
    role: 'LEADER' | 'MEMBER' = 'MEMBER',
  ): MembershipLookupResult => ({
    membership: {
      id: 'membership-1',
      groupId: GROUP_ID,
      userId: AUTH.user.id,
      role,
      joinOrder: 1,
      joinedAt: new Date(),
    },
    trip: { id: TRIP_ID, groupId: GROUP_ID, status: 'ONGOING', version: 3 },
  });
  const lookup = (result: MembershipLookupResult | null) => {
    const find = vi.fn().mockResolvedValue(result);
    return Object.assign({ find } as unknown as MembershipLookup, {
      calls: find,
    });
  };

  it('does nothing on routes without :tripId or :groupId', async () => {
    const memberships = lookup(null);
    const guard = new MembershipGuard(new Reflector(), memberships);
    await expect(guard.canActivate(context({ auth: AUTH }).ctx)).resolves.toBe(
      true,
    );
    expect(memberships.calls).not.toHaveBeenCalled();
  });

  it('attaches the membership and the trip for an active member', async () => {
    const memberships = lookup(found());
    const guard = new MembershipGuard(new Reflector(), memberships);
    const { ctx, req } = context({ auth: AUTH, params: { tripId: TRIP_ID } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(memberships.calls).toHaveBeenCalledWith({
      userId: AUTH.user.id,
      tripId: TRIP_ID,
      groupId: undefined,
    });
    expect(req.membership?.id).toBe('membership-1');
    expect(req.trip).toEqual(found().trip);
  });

  it('hides trips of other groups, left members and malformed IDs with 404', async () => {
    const guard = new MembershipGuard(new Reflector(), lookup(null));
    await expectCode(
      guard.canActivate(
        context({ auth: AUTH, params: { tripId: TRIP_ID } }).ctx,
      ),
      'NOT_FOUND',
    );
    await expectCode(
      guard.canActivate(
        context({ auth: AUTH, params: { groupId: 'not-a-uuid' } }).ctx,
      ),
      'NOT_FOUND',
    );
  });

  it('rejects non-leaders on @RequireRole("LEADER") routes', async () => {
    const memberGuard = new MembershipGuard(new Reflector(), lookup(found()));
    await expectCode(
      memberGuard.canActivate(
        context(
          { auth: AUTH, params: { groupId: GROUP_ID } },
          RequireRole('LEADER'),
        ).ctx,
      ),
      'NOT_LEADER',
    );
    const leaderGuard = new MembershipGuard(
      new Reflector(),
      lookup(found('LEADER')),
    );
    await expect(
      leaderGuard.canActivate(
        context(
          { auth: AUTH, params: { groupId: GROUP_ID } },
          RequireRole('LEADER'),
        ).ctx,
      ),
    ).resolves.toBe(true);
  });

  it('fails loudly when @RequireRole() is used without a trip or group', async () => {
    const guard = new MembershipGuard(new Reflector(), lookup(found()));
    await expect(
      guard.canActivate(context({ auth: AUTH }, RequireRole('LEADER')).ctx),
    ).rejects.toThrow('@RequireRole()');
  });
});

describe('TripStatusGuard', () => {
  const guard = new TripStatusGuard(new Reflector());
  const withTrip = (status: 'UPCOMING' | 'ONGOING' | 'ENDED') => ({
    membership: found().membership,
    trip: { id: TRIP_ID, groupId: GROUP_ID, status, version: 0 },
  });
  function found() {
    return {
      membership: {
        id: 'm',
        groupId: GROUP_ID,
        userId: 'u',
        role: 'MEMBER' as const,
        joinOrder: 1,
        joinedAt: new Date(),
      },
    };
  }

  it('passes routes without @RequireTripStatus()', () => {
    expect(guard.canActivate(context(withTrip('ENDED')).ctx)).toBe(true);
  });

  it('accepts listed statuses and rejects others with TRIP_PHASE_INVALID', () => {
    const decorator = RequireTripStatus(['UPCOMING', 'ONGOING']);
    expect(guard.canActivate(context(withTrip('ONGOING'), decorator).ctx)).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(context(withTrip('ENDED'), decorator).ctx),
    ).toThrow(expect.objectContaining({ code: 'TRIP_PHASE_INVALID' }));
  });

  it('uses the custom code when given', () => {
    expect(() =>
      guard.canActivate(
        context(
          withTrip('ENDED'),
          RequireTripStatus('ONGOING', { code: 'EXPENSE_LOCKED' }),
        ).ctx,
      ),
    ).toThrow(expect.objectContaining({ code: 'EXPENSE_LOCKED' }));
  });
});
