import type { TripStatus } from '@yeojeong/shared';

// S2A(trips·groups)가 발행하는 도메인 이벤트. 계약은 S2A의 src/trips/events.ts(PR #17)와 같다.
// 그 파일이 이 브랜치에 아직 없어 필요한 모양만 여기 두고 이벤트 이름 문자열로 구독한다.
// 합칠 때 `import { TRIP_EVENTS, type TripStartedEvent, ... } from '../trips/events.js'`로 바꾸고 이 파일은 지운다.
//
// - 최소 1회 전달: 리스너는 멱등이다(인입 키 (paymentMethodId, externalRef)·(tripId, transactionId)).
// - 리스너는 페이로드를 믿지 않고 처리 전에 DB 현재 상태(trip.status, membership.leftAt)를 다시 읽는다.
// - eventSeq(같은 여정 안 단조 증가)가 이미 본 것 이하면 버린다.

export const TRIP_STARTED = 'trip.started';
export const MEMBERSHIP_JOINED = 'membership.joined';
export const MEMBERSHIP_LEFT = 'membership.left';
/** 자동 종료 직전 훅. 발행자가 최대 60초 기다린다 → FINAL 동기화 */
export const TRIP_AUTO_ENDING = 'trip.auto-ending';

/** 순서 번호. S2A는 bigint로 보낸다(테스트·다른 발행자를 위해 number·string도 받는다) */
export type EventSeq = bigint | number | string;

interface OrderedEvent {
  eventSeq?: EventSeq;
  occurredAt?: Date;
}

export interface TripStartedEvent extends OrderedEvent {
  tripId: string;
  groupId: string;
  startedByUserId?: string;
  /** 인입 시작 기준 = 시작일 00:00 KST(Trip.startAt) */
  startAt?: Date;
}

export interface MembershipJoinedEvent extends OrderedEvent {
  tripId: string;
  groupId: string;
  membershipId: string;
  userId: string;
  joinedAt?: Date;
  rejoined?: boolean;
  tripStatus?: TripStatus;
}

export interface MembershipLeftEvent extends OrderedEvent {
  tripId: string;
  groupId: string;
  membershipId: string;
  userId?: string | null;
  reason?: 'LEFT' | 'KICKED' | 'DELETED';
}

export interface TripAutoEndingEvent {
  tripId: string;
  groupId: string;
  autoEndAt?: Date;
}
