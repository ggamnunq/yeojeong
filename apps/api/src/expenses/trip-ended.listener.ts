import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { errorCodeOf } from './access-log.js';
import { ExpenseLifecycleService } from './expense-lifecycle.service.js';

/** S2A가 종료 트랜잭션 커밋 뒤 발행한다(기능명세 1-3) */
export const TRIP_ENDED_EVENT = 'trip.ended';

/**
 * S2A 계약 payload. 이 모듈은 tripId만 쓴다.
 * 자동 종료 잡이 처리 누락 여정에 redelivered: true로 다시 낼 수 있다 — 처리는 멱등이라 그대로 받는다.
 */
export interface TripEndedEvent {
  tripId: string;
  groupId?: string;
  endedByUserId?: string | null;
  endedAt?: Date | string;
  reason?: 'MANUAL' | 'AUTO';
  redelivered?: boolean;
  eventSeq?: string | number | bigint;
  occurredAt?: Date | string;
}

/**
 * 종료된 여정의 미확정 → 개인(FR-306). 시스템 경로라 HTTP 가드(ENDED면 변경 금지)를 타지 않고 서비스 내부 메서드를 부른다.
 * S2A가 종료 트랜잭션에서 이미 바꿨거나 재발행(redelivered)이면 아무것도 하지 않는다(멱등).
 * 실패해도 조회 시점 재확인(ExpenseLifecycleService.ensurePersonalizedAfterEnd)이 메운다.
 */
@Injectable()
export class TripEndedListener {
  private readonly logger = new Logger(TripEndedListener.name);

  constructor(private readonly lifecycle: ExpenseLifecycleService) {}

  @OnEvent(TRIP_ENDED_EVENT, { async: true, promisify: true })
  async handleTripEnded(event: TripEndedEvent): Promise<void> {
    try {
      const changed = await this.lifecycle.personalizePendingOnTripEnd(
        event.tripId,
      );
      if (changed > 0) {
        this.logger.log(
          { tripId: event.tripId, changed },
          '종료된 여정의 미확정을 개인으로 바꿨습니다',
        );
      }
    } catch (error) {
      this.logger.error(
        { tripId: event.tripId, errorCode: errorCodeOf(error) },
        'trip.ended 처리에 실패했습니다(조회 시점에 다시 처리)',
      );
    }
  }
}
