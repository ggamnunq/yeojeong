import type {
  MemberSummary,
  Profile,
  TripListItem,
  TripStatus,
} from '@yeojeong/shared';
import type { MemberRole } from '../generated/prisma/client.js';
import { dateOnly } from './kst.js';

// DB 행 → 응답 타입 변환과 그에 필요한 select. 그룹원·여정 목록이 같은 모양을 쓰게 모은다.

/** 탈퇴(FR-109)로 userId가 NULL이 된 멤버의 표시 이름 */
export const WITHDRAWN_NICKNAME = '탈퇴한 멤버';

export const memberSelect = {
  id: true,
  role: true,
  joinOrder: true,
  leftAt: true,
  userId: true,
  user: { select: { nickname: true, profileImageUrl: true } },
} as const;

export interface MemberRow {
  id: string;
  role: MemberRole;
  joinOrder: number;
  leftAt: Date | null;
  userId: string | null;
  user: { nickname: string; profileImageUrl: string | null } | null;
}

export function toProfile(row: Pick<MemberRow, 'user'>): Profile {
  return {
    nickname: row.user?.nickname ?? WITHDRAWN_NICKNAME,
    profileImageUrl: row.user?.profileImageUrl ?? null,
  };
}

export function toMemberSummary(
  row: MemberRow,
  meMembershipId: string | null,
): MemberSummary {
  return {
    membershipId: row.id,
    ...toProfile(row),
    // 나간 멤버는 그룹 역할이 없다. 나갈 때 MEMBER로 내리지만 옛 행을 대비해 한 번 더 막는다
    role: row.leftAt ? 'MEMBER' : row.role,
    joinOrder: row.joinOrder,
    isMe: row.id === meMembershipId,
    isLeft: row.leftAt !== null,
  };
}

export interface TripListRow {
  id: string;
  groupId: string;
  status: TripStatus;
  startDate: Date;
  endDate: Date;
  group: { name: string };
}

export function toTripListItem(
  trip: TripListRow,
  memberCount: number,
  role: MemberRole,
): TripListItem {
  return {
    tripId: trip.id,
    groupId: trip.groupId,
    groupName: trip.group.name,
    status: trip.status,
    startDate: dateOnly(trip.startDate),
    endDate: dateOnly(trip.endDate),
    memberCount,
    isLeader: role === 'LEADER',
  };
}

const STATUS_RANK: Record<TripStatus, number> = {
  ONGOING: 0,
  UPCOMING: 1,
  ENDED: 2,
};

/** 내 여정 정렬(FR-205): 진행 중 → 시작 전(시작일 빠른 순) → 종료(종료일 늦은 순) */
export function compareTripListItems(a: TripListItem, b: TripListItem) {
  const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rank !== 0) return rank;
  if (a.status === 'ENDED') {
    return (
      b.endDate.localeCompare(a.endDate) || a.tripId.localeCompare(b.tripId)
    );
  }
  return (
    a.startDate.localeCompare(b.startDate) || a.tripId.localeCompare(b.tripId)
  );
}
