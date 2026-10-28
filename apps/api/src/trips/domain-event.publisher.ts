import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEvent } from './events.js';

/**
 * 커밋된 상태 변경을 도메인 이벤트로 보낸다(src/trips/events.ts). 트랜잭션 안에서 부르지 않는다.
 * 구독자를 차례로 기다린다(emitAsync). 구독자 오류는 로그만 남기고 호출자에게 던지지 않는다
 * — 상태는 이미 커밋됐고, 빠진 후속 처리는 구독자의 멱등 재처리(종료는 자동 종료 잡의 재전송)로 메운다.
 */
@Injectable()
export class DomainEventPublisher {
  private readonly logger = new Logger(DomainEventPublisher.name);

  constructor(private readonly emitter: EventEmitter2) {}

  async publish(...events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.emitter.emitAsync(event.name, event.payload);
      } catch (error) {
        this.logger.error(
          {
            event: event.name,
            tripId: event.payload.tripId,
            err: error,
          },
          'domain event listener failed',
        );
      }
    }
  }

  hasListeners(name: DomainEvent['name']): boolean {
    return this.emitter.listenerCount(name) > 0;
  }

  /** 기다리는 시간을 제한한다. 시간이 지나면 구독자를 두고 돌아온다(구독자는 계속 돈다) */
  async publishWithin(timeoutMs: number, ...events: DomainEvent[]) {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    try {
      const result = await Promise.race([
        this.publish(...events).then(() => 'done' as const),
        timeout,
      ]);
      if (result === 'timeout') {
        this.logger.warn(
          { event: events[0]?.name, count: events.length, timeoutMs },
          'domain event listeners timed out',
        );
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
}
