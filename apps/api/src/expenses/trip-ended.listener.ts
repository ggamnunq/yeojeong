import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TRIP_EVENTS, type TripEndedEvent } from '../trips/events.js';
import { errorCodeOf } from './access-log.js';
import { ExpenseLifecycleService } from './expense-lifecycle.service.js';

/**
 * 종료된 여정의 미확정 → 개인(FR-306). 시스템 경로라 HTTP 가드(ENDED면 변경 금지)를 타지 않고 서비스 내부 메서드를 부른다.
 * S2A가 종료 트랜잭션에서 이미 바꿨거나 재발행(redelivered)이면 아무것도 하지 않는다(멱등).
 * 실패해도 조회 시점 재확인(ExpenseLifecycleService.ensurePersonalizedAfterEnd)이 메운다.
 */
@Injectable()
export class TripEndedListener {
  private readonly logger = new Logger(TripEndedListener.name);

  constructor(private readonly lifecycle: ExpenseLifecycleService) {}

  @OnEvent(TRIP_EVENTS.ENDED, { async: true, promisify: true })
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
