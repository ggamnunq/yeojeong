import type { AccountDeletionChannel } from '@yeojeong/shared';

// 탈퇴가 다른 모듈과 주고받는 도메인 이벤트(@nestjs/event-emitter). 다른 모듈의 서비스를 직접 부르지 않는다.

/** 멤버가 그룹에서 빠졌다(나가기·강퇴·탈퇴). 커밋 후 발행 */
export const MEMBERSHIP_LEFT_EVENT = 'membership.left';
/** 탈퇴 트랜잭션 직전. emitAsync로 리스너를 기다린다 */
export const ACCOUNT_DELETING_EVENT = 'account.deleting';
/** 탈퇴 커밋 후 */
export const ACCOUNT_DELETED_EVENT = 'account.deleted';

/** DB의 LeaveReason(LEFT·KICKED)에 탈퇴(DELETED)를 더한 이벤트용 사유 */
export type MembershipLeaveReason = 'LEFT' | 'KICKED' | 'DELETED';

/**
 * groups 모듈(S2A)의 membership.left와 같은 모양으로 맞춘다. 통합할 때 한쪽 정의로 합친다.
 * 탈퇴는 DB에 leaveReason = LEFT로 남기고(enum에 DELETED가 없다) userId = NULL로 구분한다.
 */
export interface MembershipLeftEvent {
  membershipId: string;
  groupId: string;
  tripId: string | null;
  /** 나간 사용자. 탈퇴면 이미 지워진 ID다(조회하지 않는다) */
  userId: string;
  reason: MembershipLeaveReason;
  leftAt: Date;
  /** 그룹장이 나가 승계가 일어났으면 새 그룹장 Membership ID */
  newLeaderMembershipId: string | null;
  /** 마지막 활성 멤버가 나가 그룹·여정을 소프트 삭제했으면 true(미결 Q-25 추천안) */
  groupDeleted: boolean;
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
