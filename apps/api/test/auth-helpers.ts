import { randomUUID } from 'node:crypto';
import type {
  ConsentId,
  ConsentRequirement,
  MemberRole,
  TripStatus,
} from '@yeojeong/shared';
import type { Request } from 'express';
import type { AuthUser } from './../src/common/auth/auth-context.js';
import {
  ConsentChecker,
  MembershipLookup,
  SESSION_COOKIE,
  SessionResolver,
  readCookie,
  type MembershipLookupResult,
  type MembershipQuery,
  type SessionState,
} from './../src/common/auth/index.js';

/** vitest.config*.ts의 WEB_BASE_URL. 상태 변경 요청(POST 등)에는 이 Origin을 붙여야 CSRF 가드를 통과한다 */
export const TEST_ORIGIN = 'http://localhost:5173';

/** 쿠키 yj_session=<토큰> → 사용자. DB 없이 로그인한 상태를 흉내 낸다 */
export class StubSessionResolver extends SessionResolver {
  private readonly users = new Map<string, AuthUser>();

  signIn(user: AuthUser): string {
    const token = `test-session-${user.id}`;
    this.users.set(token, user);
    return token;
  }

  resolve(req: Request): Promise<SessionState> {
    const token = readCookie(req, SESSION_COOKIE);
    const user = token ? this.users.get(token) : undefined;
    return Promise.resolve(
      user
        ? {
            status: 'AUTHENTICATED',
            user,
            session: {
              id: `session-${user.id}`,
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          }
        : { status: 'ANONYMOUS' },
    );
  }
}

/** 동의 상태. 기본은 모두 동의함. missing에 넣은 항목은 CONSENT_REQUIRED가 된다 */
export class StubConsentChecker extends ConsentChecker {
  /** userId → 동의하지 않은 항목 */
  readonly missing = new Map<string, Set<ConsentId>>();

  findMissing(
    userId: string,
    consentIds: readonly ConsentId[],
  ): Promise<ConsentRequirement[]> {
    const missing = this.missing.get(userId) ?? new Set();
    return Promise.resolve(
      consentIds
        .filter((id) => missing.has(id))
        .map((id) => ({ id, version: 'test' })),
    );
  }
}

export interface TestMembershipInput {
  user: AuthUser;
  tripId?: string;
  groupId?: string;
  role?: MemberRole;
  joinOrder?: number;
  tripStatus?: TripStatus;
}

/** (사용자, 여정/그룹) → 활성 멤버십. 넣지 않은 조합은 404가 된다 */
export class StubMembershipLookup extends MembershipLookup {
  private readonly rows: MembershipLookupResult[] = [];

  add(input: TestMembershipInput): MembershipLookupResult {
    const groupId = input.groupId ?? randomUUID();
    const row: MembershipLookupResult = {
      membership: {
        id: randomUUID(),
        groupId,
        userId: input.user.id,
        role: input.role ?? 'MEMBER',
        joinOrder:
          input.joinOrder ??
          this.rows.filter((r) => r.membership.groupId === groupId).length + 1,
        joinedAt: new Date(),
      },
      trip: {
        id: input.tripId ?? randomUUID(),
        groupId,
        status: input.tripStatus ?? 'ONGOING',
        version: 0,
      },
    };
    this.rows.push(row);
    return row;
  }

  find({
    userId,
    tripId,
    groupId,
  }: MembershipQuery): Promise<MembershipLookupResult | null> {
    const row = this.rows.find(
      (r) =>
        r.membership.userId === userId &&
        (tripId === undefined || r.trip?.id === tripId) &&
        (groupId === undefined || r.membership.groupId === groupId),
    );
    return Promise.resolve(row ?? null);
  }
}

/**
 * e2e 테스트용 인증 상태. createTestApp(controllers, { auth })로 넘기면 전역 가드가 이 스텁을 쓴다.
 * @example
 *   const auth = createTestAuth();
 *   const me = auth.addUser({ nickname: '준용' });
 *   const { trip } = auth.addMembership({ user: me, role: 'LEADER', tripStatus: 'ONGOING' });
 *   app = await createTestApp([TripsController], { auth });
 *   await request(app.getHttpServer()).post(`/api/trips/${trip!.id}/start`).set(auth.headers(me)).expect(200);
 */
export function createTestAuth() {
  const sessions = new StubSessionResolver();
  const consents = new StubConsentChecker();
  const memberships = new StubMembershipLookup();

  return {
    sessions,
    consents,
    memberships,
    addUser(overrides: Partial<AuthUser> = {}): AuthUser {
      return {
        id: randomUUID(),
        nickname: '테스트',
        profileImageUrl: null,
        ...overrides,
      };
    },
    addMembership: (input: TestMembershipInput) => memberships.add(input),
    /** 이 사용자에게 이 동의가 없는 것으로 만든다 */
    withoutConsent(user: AuthUser, ...ids: ConsentId[]) {
      consents.missing.set(user.id, new Set(ids));
    },
    /** 로그인 쿠키 + 허용 Origin. 비로그인 요청이면 user 없이 부른다 */
    headers(user?: AuthUser): Record<string, string> {
      const headers: Record<string, string> = { Origin: TEST_ORIGIN };
      if (user) headers.Cookie = `${SESSION_COOKIE}=${sessions.signIn(user)}`;
      return headers;
    },
  };
}

export type TestAuth = ReturnType<typeof createTestAuth>;
