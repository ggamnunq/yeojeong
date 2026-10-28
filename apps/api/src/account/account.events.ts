import type { AccountDeletionChannel } from '@yeojeong/shared';

// 탈퇴가 다른 모듈과 주고받는 도메인 이벤트(@nestjs/event-emitter). 다른 모듈의 서비스를 직접 부르지 않는다.

/** 멤버가 그룹에서 빠졌다(나가기·강퇴·탈퇴). 커밋 후 발행. 이름은 S2A TRIP_EVENTS.MEMBERSHIP_LEFT와 같다 */
export const MEMBERSHIP_LEFT_EVENT = 'membership.left';
/** 탈퇴 트랜잭션 직전. emitAsync로 리스너를 기다린다 */
export const ACCOUNT_DELETING_EVENT = 'account.deleting';
/** 탈퇴 커밋 후 */
export const ACCOUNT_DELETED_EVENT = 'account.deleted';

export type MembershipLeftReason = 'LEFT' | 'KICKED' | 'DELETED';

/**
 * S2A `src/trips/events.ts`의 MembershipLeftEvent와 같은 모양(통합 때 그쪽 타입으로 바꾼다).
 * 탈퇴는 reason DELETED, userId null로 보낸다. DB에는 leaveReason = LEFT로 남는다(enum에 DELETED가 없다).
 * eventSeq는 S2A와 같은 방식으로 Trip 행을 잠근 뒤 trip_events.seq 시퀀스에서 받는다.
 */
export interface MembershipLeftEvent {
  tripId: string;
  groupId: string;
  membershipId: string;
  /** 탈퇴한 멤버면 null */
  userId: string | null;
  reason: MembershipLeftReason;
  eventSeq: bigint;
  occurredAt: Date;
}

/**
 * 트랜잭션 전에 await로 기다린다. 외부 정리용:
 * - wallet: 제공기관 토큰 폐기 요청(FR-109 ②). 토큰 컬럼은 탈퇴 트랜잭션이 행째 지운다.
 * - auth: 카카오 연결 끊기 API(FR-109 ⑥). 카카오 회원번호는 리스너가 userId로 직접 읽는다(페이로드에 넣지 않는다).
 * 리스너가 실패해도 탈퇴는 진행한다(실패는 로그에 남는다). 같은 사용자로 다시 불릴 수 있으니 멱등하게 만든다.
 */
export interface AccountDeletingEvent {
  userId: string;
  channel: AccountDeletionChannel;
}

export interface AccountDeletedEvent {
  userId: string;
  accountDeletionId: string;
  channel: AccountDeletionChannel;
  completedAt: Date;
}
