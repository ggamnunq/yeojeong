import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventSeqTracker } from './event-seq.js';
import { SyncService } from './sync.service.js';
import {
  MEMBERSHIP_JOINED,
  MEMBERSHIP_LEFT,
  TRIP_STARTED,
  type MembershipJoinedEvent,
  type MembershipLeftEvent,
  type TripStartedEvent,
} from './trip-events.js';

const LISTENER_OPTIONS = { async: true, promisify: true } as const;

/**
 * S2A 이벤트 구독(기능명세 1-3). 발행자는 커밋 뒤 emitAsync로 기다린다.
 * - 멱등: 인입 키(paymentMethodId, externalRef)·(tripId, transactionId)라 같은 이벤트가 두 번 와도 결제가 늘지 않는다.
 * - 실패: 상태 변경은 이미 커밋됐으므로 요청을 깨지 않는다. 예외를 잡아 error 로그(event, listener, tripId, errorCode)로 남기고,
 *   실패한 연결은 SyncRun(FAILED)으로 남는다 → 10분 주기 잡이 덮이지 않은 구간을 다시 가져온다(자가 복구).
 * - 순서: 처리 전에 DB 현재 상태(trip.status, membership.leftAt)를 다시 읽는다. eventSeq가 오면 오래된 것은 버린다.
 */
@Injectable()
export class TripEventsListener {
  private readonly logger = new Logger(TripEventsListener.name);
  private readonly seq = new EventSeqTracker();

  constructor(private readonly sync: SyncService) {}

  /** 여정 시작 → 전 멤버 소급 인입(FR-303 → FR-404, [startAt, now]) */
  @OnEvent(TRIP_STARTED, LISTENER_OPTIONS)
  async onTripStarted(event: TripStartedEvent): Promise<void> {
    if (!event?.tripId) return;
    if (!this.seq.accept(`trip:${event.tripId}`, event.eventSeq)) return;
    await this.guard(TRIP_STARTED, 'backfillTripStart', event.tripId, () =>
      this.sync.backfillTripStart(event.tripId),
    );
  }

  /** 진행 중 여정 참여 → 새 멤버 소급 인입(FR-204 → FR-404). tripStatus는 참고만 하고 DB로 다시 확인한다 */
  @OnEvent(MEMBERSHIP_JOINED, LISTENER_OPTIONS)
  async onMembershipJoined(event: MembershipJoinedEvent): Promise<void> {
    if (!event?.membershipId) return;
    if (!this.seq.accept(`membership:${event.membershipId}`, event.eventSeq)) return;
    await this.guard(MEMBERSHIP_JOINED, 'backfillJoin', event.tripId, () =>
      this.sync.backfillJoin(event.membershipId),
    );
  }

  /**
   * 나감·강퇴 → 이 여정으로의 인입만 멈춘다(연결은 유지). 인입 판정이 Membership.leftAt을 보므로 할 일이 없다.
   * 기존 결제·ExpenseShare는 건드리지 않는다(나간 멤버의 부담은 정산에 남는다).
   */
  @OnEvent(MEMBERSHIP_LEFT, LISTENER_OPTIONS)
  onMembershipLeft(event: MembershipLeftEvent): Promise<void> {
    if (event?.membershipId) {
      this.seq.accept(`membership:${event.membershipId}`, event.eventSeq);
    }
    return Promise.resolve();
  }

  private async guard(
    event: string,
    listener: string,
    tripId: string | undefined,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      const errorCode =
        (error as { code?: unknown } | null)?.code?.toString().slice(0, 40) ?? 'INTERNAL';
      this.logger.error(
        { event, listener, tripId, errorCode },
        '이벤트 리스너 실패(다음 sync 잡이 따라잡는다)',
      );
    }
  }
}
