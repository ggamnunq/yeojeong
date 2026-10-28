import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventSeqTracker } from './event-seq.js';
import { SyncService } from './sync.service.js';
import {
  MEMBERSHIP_JOINED,
  MEMBERSHIP_LEFT,
  TRIP_AUTO_ENDING,
  TRIP_STARTED,
  type MembershipJoinedEvent,
  type MembershipLeftEvent,
  type TripAutoEndingEvent,
  type TripStartedEvent,
} from './trip-events.js';
import { waitAtMost } from './wait.js';

const LISTENER_OPTIONS = { async: true, promisify: true } as const;
/** trip.auto-ending 발행자가 최대 60초 기다리므로 그 안에 끝낸다 */
const FINAL_SYNC_BUDGET_MS = 55_000;

/**
 * S2A 이벤트 구독(기능명세 1-3, S2A src/trips/events.ts).
 * - 멱등: 인입 키(paymentMethodId, externalRef)·(tripId, transactionId)라 같은 이벤트가 두 번 와도 결제가 늘지 않는다.
 * - 소급(trip.started·membership.joined)은 오래 걸릴 수 있어 백그라운드로 돌리고 바로 돌아온다(발행 요청을 붙잡지 않는다).
 * - 실패: 예외를 잡아 error 로그(event, listener, tripId, errorCode)로 남기고, 실패한 연결은 SyncRun(FAILED)으로 남는다.
 *   10분 주기 잡이 성공 SyncRun 구간이 여정 기간을 덮는지 보고 덮이지 않은 구간부터 다시 가져온다(자가 복구, SH-2).
 * - 순서: 처리 전에 DB 현재 상태를 다시 읽고, eventSeq가 이미 본 것 이하인 이벤트는 버린다.
 */
@Injectable()
export class TripEventsListener {
  private readonly logger = new Logger(TripEventsListener.name);
  private readonly seq = new EventSeqTracker();
  private readonly inflight = new Set<Promise<void>>();

  constructor(private readonly sync: SyncService) {}

  /** 여정 시작 → 전 멤버 소급 인입(FR-303 → FR-404, [startAt, now]) */
  @OnEvent(TRIP_STARTED, LISTENER_OPTIONS)
  onTripStarted(event: TripStartedEvent): Promise<void> {
    if (!event?.tripId || !this.seq.accept(`trip.started:${event.tripId}`, event.eventSeq)) {
      return Promise.resolve();
    }
    this.background(TRIP_STARTED, 'backfillTripStart', event.tripId, () =>
      this.sync.backfillTripStart(event.tripId),
    );
    return Promise.resolve();
  }

  /** 진행 중 여정 참여·재참여 → 새 멤버 소급 인입(FR-204 → FR-404). tripStatus는 참고만 하고 DB로 다시 확인한다 */
  @OnEvent(MEMBERSHIP_JOINED, LISTENER_OPTIONS)
  onMembershipJoined(event: MembershipJoinedEvent): Promise<void> {
    if (!event?.membershipId || !this.seq.accept(`membership:${event.membershipId}`, event.eventSeq)) {
      return Promise.resolve();
    }
    this.background(MEMBERSHIP_JOINED, 'backfillJoin', event.tripId, () =>
      this.sync.backfillJoin(event.membershipId),
    );
    return Promise.resolve();
  }

  /**
   * 나감·강퇴·그룹 삭제 → 이 여정으로의 인입만 멈춘다(연결은 유지). 인입 판정이 Membership.leftAt·Group.deletedAt을
   * 보므로 할 일이 없다. 기존 결제·ExpenseShare는 건드리지 않는다(나간 멤버의 부담은 정산에 남는다).
   * 순서 번호만 기록해 뒤늦게 온 이전 참여 이벤트가 소급을 다시 돌리지 않게 한다.
   */
  @OnEvent(MEMBERSHIP_LEFT, LISTENER_OPTIONS)
  onMembershipLeft(event: MembershipLeftEvent): Promise<void> {
    if (event?.membershipId) {
      this.seq.accept(`membership:${event.membershipId}`, event.eventSeq);
    }
    return Promise.resolve();
  }

  /** 자동 종료 직전 → FINAL 동기화(FR-305, 종료 전 마지막 인입). 발행자가 기다리므로 끝날 때까지(최대 55초) 기다린다 */
  @OnEvent(TRIP_AUTO_ENDING, LISTENER_OPTIONS)
  async onTripAutoEnding(event: TripAutoEndingEvent): Promise<void> {
    if (!event?.tripId) return;
    await waitAtMost(
      this.guard(TRIP_AUTO_ENDING, 'finalSync', event.tripId, () =>
        this.sync.finalSync(event.tripId),
      ),
      FINAL_SYNC_BUDGET_MS,
    );
  }

  /** 백그라운드 작업이 모두 끝날 때까지 기다린다(테스트·종료 시) */
  async drain(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled(this.inflight);
    }
  }

  private background(
    event: string,
    listener: string,
    tripId: string | undefined,
    fn: () => Promise<unknown>,
  ): void {
    const task = this.guard(event, listener, tripId, fn).finally(() => {
      this.inflight.delete(task);
    });
    this.inflight.add(task);
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
