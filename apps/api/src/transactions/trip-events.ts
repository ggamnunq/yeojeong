import type { LeaveReason, TripStatus } from '@yeojeong/shared';

// S2A(trips·groups)가 발행하는 도메인 이벤트(기능명세 1-3, v0.4.1).
// S2A의 src/trips/events.ts가 이 브랜치에 아직 없어 같은 모양을 여기 두고 이벤트 이름 문자열로 구독한다.
// 합칠 때 S2A 쪽 정의로 import를 바꾸고 이 파일의 타입은 지운다.
//
// 리스너는 페이로드를 믿지 않고 처리 전에 DB 현재 상태(trip.status, membership.leftAt)를 다시 읽는다.
// eventSeq는 명세상 없지만(MVP는 발행 순서 = 처리 순서), 붙어 오면 같은 대상의 오래된 이벤트를 버린다.

export const TRIP_STARTED = 'trip.started';
export const MEMBERSHIP_JOINED = 'membership.joined';
export const MEMBERSHIP_LEFT = 'membership.left';

/** 이벤트 순서 번호(선택). 숫자·문자열·bigint 어느 것이든 받는다 */
export type EventSeq = number | string | bigint;

export interface TripStartedEvent {
  tripId: string;
  groupId: string;
  startAt: Date | string;
  startedAt: Date | string;
  startedByMembershipId: string | null;
  eventSeq?: EventSeq;
}

export interface MembershipJoinedEvent {
  tripId: string;
  groupId: string;
  membershipId: string;
  userId: string;
  joinOrder: number;
  joinedAt: Date | string;
  tripStatus: TripStatus;
  eventSeq?: EventSeq;
}

export interface MembershipLeftEvent {
  tripId: string;
  groupId: string;
  membershipId: string;
  leaveReason: LeaveReason;
  leftAt: Date | string;
  newLeaderMembershipId?: string | null;
  eventSeq?: EventSeq;
}
