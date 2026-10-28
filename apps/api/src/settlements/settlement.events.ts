// 여정 종료 이벤트 계약. trips 모듈(S2A)이 종료 트랜잭션을 커밋한 뒤 발행하고, 정산 모듈이 구독해 스냅샷을 만든다.
// 발행은 반드시 커밋 후 `await eventEmitter.emitAsync(TRIP_ENDED_EVENT, payload)`로 한다.
// - 커밋 전에 발행하면 리스너가 Trip 행 잠금을 기다리며 교착한다.
// - 리스너는 실패를 삼키지 않고 다시 던진다(suppressErrors: false). emit()으로 발행하면 처리되지 않은 rejection이 된다.
// 리스너가 실패해도 GET …/settlement가 같은 함수(ensureSettlement)로 지연 생성하고, 내부 잡이 빠진 정산을 다시 만든다.

export const TRIP_ENDED_EVENT = 'trip.ended';

/** 정산은 tripId만 쓴다. 나머지는 trips 모듈(S2A)이 싣는 정보용 필드다 */
export interface TripEndedEvent {
  tripId: string;
  /** 정보용. 정산은 DB의 Trip.endedAt을 기준으로 만든다 */
  endedAt?: Date;
  reason?: 'MANUAL' | 'AUTO';
  /** 자동 종료 잡이 정산 없는 여정에 다시 발행한 경우 true. ensureSettlement가 멱등이라 처리는 같다 */
  redelivered?: boolean;
  eventSeq?: bigint;
  occurredAt?: Date;
}
