import type { MemberRole, TripStatus } from '@yeojeong/shared';

/** 로그인한 사용자. 카카오 회원번호는 담지 않는다(로그·응답에 섞이지 않게) */
export interface AuthUser {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
}

export interface AuthSession {
  id: string;
  expiresAt: Date;
}

/** AuthGuard가 요청마다 붙인다. @CurrentUser()로 꺼낸다 */
export interface AuthContext {
  user: AuthUser;
  session: AuthSession;
}

/** MembershipGuard가 :tripId/:groupId 라우트에서 붙인다. @CurrentMembership()으로 꺼낸다 */
export interface MembershipContext {
  id: string;
  groupId: string;
  userId: string;
  role: MemberRole;
  joinOrder: number;
  joinedAt: Date;
}

/**
 * MembershipGuard가 함께 붙이는 여정 요약(그룹 1 : 여정 1). @CurrentTrip()으로 꺼낸다.
 * 가드 시점의 값이다. 상태를 바꾸는 서비스는 트랜잭션 안에서 Trip 행을 잠그고 다시 확인한다(기능명세 8-3).
 */
export interface TripContext {
  id: string;
  groupId: string;
  status: TripStatus;
  version: number;
}

// express Request는 http.IncomingMessage를 확장한다(pino-http의 req.id·req.log와 같은 방식)
declare module 'http' {
  interface IncomingMessage {
    auth?: AuthContext;
    membership?: MembershipContext;
    trip?: TripContext;
  }
}
