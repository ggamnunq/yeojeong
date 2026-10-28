import { DELETED_MEMBER_NICKNAME, type MemberRole } from '@yeojeong/shared';

// 탈퇴 파이프라인의 순수 규칙. DB를 만지지 않아 단위 테스트로 확인한다(account-deletion.plan.spec.ts).

export interface ActiveMember {
  id: string;
  role: MemberRole;
  joinOrder: number;
}

export interface LeavePlan {
  wasLeader: boolean;
  /** 승계받을 멤버. 그룹장이 아니었거나 남는 활성 멤버가 없으면 null */
  successor: ActiveMember | null;
  /** 남는 활성 멤버가 없다 → 그룹·여정 소프트 삭제(미결 Q-25 추천안, 처리방침 "모든 멤버가 나간 그룹은 30일 이내 파기") */
  groupBecomesEmpty: boolean;
}

/**
 * 한 그룹에서 활성 멤버 하나가 빠질 때 할 일(기능명세 4-7, FR-208과 같은 규칙).
 * 그룹장이면 남는 활성 멤버 중 joinOrder가 가장 작은 사람이 그룹장이 된다.
 * @param activeMembers 그 그룹의 활성 멤버 전부(나가는 사람 포함, 순서 무관)
 */
export function planLeave(
  activeMembers: readonly ActiveMember[],
  leavingId: string,
): LeavePlan {
  const leaving = activeMembers.find((m) => m.id === leavingId);
  if (!leaving) {
    throw new Error('나가는 멤버가 활성 멤버 목록에 없습니다');
  }
  const remaining = activeMembers
    .filter((m) => m.id !== leavingId)
    .sort((a, b) => a.joinOrder - b.joinOrder);
  const wasLeader = leaving.role === 'LEADER';
  return {
    wasLeader,
    successor: wasLeader ? (remaining[0] ?? null) : null,
    groupBecomesEmpty: remaining.length === 0,
  };
}

/**
 * 탈퇴한 회원의 멤버십에 쓰는 값. 계정 연결을 끊어(userId = NULL → 화면 "탈퇴한 멤버", 기본 프사)
 * 공동 결제·부담·정산 행은 Membership ID로 그대로 남긴다. 활성 멤버였으면 나간 멤버로 만든다
 * (정산 N에서 빠지고, 결제 잠금, 새 부담 인원 후보에서 빠진다). DB enum에 DELETED가 없어 사유는 LEFT로 둔다.
 */
export function anonymizedMembership(
  leftAt: Date | null,
  now: Date,
): { userId: null; leftAt?: Date; leaveReason?: 'LEFT' } {
  return leftAt
    ? { userId: null }
    : { userId: null, leftAt: now, leaveReason: 'LEFT' };
}

/** TripEvent(LEADER_CHANGED) 페이로드 {newLeaderMembershipId, nickname}에서 지울 닉네임 자리에 넣는 값 */
export const SCRUBBED_LEADER_NICKNAME = DELETED_MEMBER_NICKNAME;

/** UserConsent.withdrawChannel(탈퇴로 철회, docs/legal/consents.md 5절) */
export const ACCOUNT_DELETED_WITHDRAW_CHANNEL = 'ACCOUNT_DELETED';
