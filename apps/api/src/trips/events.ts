import type { EndReason, TripStatus } from '@yeojeong/shared';

// S2A가 발행하는 도메인 이벤트(다른 모듈과의 약속). 표와 순서 보장은 src/trips/README.md "도메인 이벤트".
// - 상태 변경 트랜잭션이 커밋된 뒤 EventEmitter2.emitAsync로 보낸다. 롤백되면 보내지 않는다.
// - 구독 예: @OnEvent(TRIP_EVENTS.ENDED) onEnded(event: TripEndedEvent) { ... }
// - 최소 1회(at-least-once) 전달이다. 구독자는 멱등이어야 하고, 같은 여정에서 이미 처리한 것보다
//   eventSeq가 작은 이벤트는 무시한다.
// - 구독자가 던진 예외는 @nestjs/event-emitter가 기본(suppressErrors)으로 삼키고 로그만 남긴다.
//   발행자의 응답·트랜잭션에는 영향이 없다. 오래 걸리는 일(동기화)은 큐에 넣고 바로 돌아온다.

export const TRIP_EVENTS = {
  STARTED: 'trip.started',
  ENDED: 'trip.ended',
  MEMBERSHIP_JOINED: 'membership.joined',
  MEMBERSHIP_LEFT: 'membership.left',
  /** 자동 종료 직전 훅(FR-305 FINAL 동기화용). 상태 변경이 아니라 eventSeq가 없다 */
  AUTO_ENDING: 'trip.auto-ending',
} as const;

export type TripEventName = (typeof TRIP_EVENTS)[keyof typeof TRIP_EVENTS];

interface OrderedEvent {
  /**
   * 순서 번호. trip_events.seq와 같은 시퀀스에서 상태 변경 트랜잭션 안(Trip 행 FOR UPDATE 뒤)에 받는다.
   * 같은 여정 안에서는 커밋 순서와 같고 단조 증가한다. 여정이 다르면 크기 비교에 의미가 없다.
   */
  eventSeq: bigint;
  /** 상태가 바뀐 시각(DB에 기록한 값과 같다) */
  occurredAt: Date;
}

/** 시작 전 → 진행 중(FR-303). 구독: S2B 소급 인입(TRIP_START, [startAt, now]) */
export interface TripStartedEvent extends OrderedEvent {
  tripId: string;
  groupId: string;
  startedByUserId: string;
  /** 인입 시작 기준 = 시작일 00:00 KST(Trip.startAt). 실제 시작 시각은 occurredAt */
  startAt: Date;
}

/**
 * 진행 중 → 종료(FR-304·305·306). 구독: S2B 미확정 → 개인 자동 처리, S2C 정산 스냅샷.
 * 받을 때 Trip.status는 이미 ENDED다(결제 변경은 모두 막혀 있다). 자동 처리·정산 쓰기는
 * "종료 후 변경 금지" 검사의 예외로 두고, 둘 다 멱등이어야 한다(redelivered로 다시 올 수 있다).
 */
export interface TripEndedEvent extends OrderedEvent {
  tripId: string;
  groupId: string;
  /** 자동 종료면 null */
  endedByUserId: string | null;
  endedAt: Date;
  reason: EndReason;
  /** 자동 종료 잡이 정산·자동 처리가 비어 있는 종료 여정에 다시 보낸 것 */
  redelivered: boolean;
}

/** 초대코드로 참여·재참여(FR-204). 구독: S2B 신규 멤버 소급 인입(진행 중일 때 JOIN) */
export interface MembershipJoinedEvent extends OrderedEvent {
  tripId: string;
  groupId: string;
  membershipId: string;
  userId: string;
  joinedAt: Date;
  /** 자진 이탈 후 같은 행을 되살린 재참여(Q-09). membershipId는 예전과 같고 joinOrder는 맨 뒤로 바뀐다 */
  rejoined: boolean;
  /** 참여 시점 여정 단계 */
  tripStatus: TripStatus;
}

export type MembershipLeftReason = 'LEFT' | 'KICKED' | 'ACCOUNT_DELETED' | 'GROUP_DELETED';

/**
 * 멤버가 빠짐(FR-207·208·209). GROUP_DELETED = 그룹 삭제로 활성 멤버 전원이 빠짐.
 * 구독: S2B 이후 인입 중단.
 */
export interface MembershipLeftEvent extends OrderedEvent {
  tripId: string;
  groupId: string;
  membershipId: string;
  /** 탈퇴한 멤버면 null */
  userId: string | null;
  reason: MembershipLeftReason;
}

/** 자동 종료 잡이 종료 트랜잭션 전에 보내고 최대 60초 기다린다(FR-305 AC3) */
export interface TripAutoEndingEvent {
  tripId: string;
  groupId: string;
  autoEndAt: Date;
}

export interface TripEventPayloads {
  [TRIP_EVENTS.STARTED]: TripStartedEvent;
  [TRIP_EVENTS.ENDED]: TripEndedEvent;
  [TRIP_EVENTS.MEMBERSHIP_JOINED]: MembershipJoinedEvent;
  [TRIP_EVENTS.MEMBERSHIP_LEFT]: MembershipLeftEvent;
  [TRIP_EVENTS.AUTO_ENDING]: TripAutoEndingEvent;
}

export type DomainEvent = {
  [K in TripEventName]: { name: K; payload: TripEventPayloads[K] };
}[TripEventName];
