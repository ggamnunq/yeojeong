import { Injectable, Logger } from '@nestjs/common';
import type {
  AutoEndJobResponse,
  EndPreviewResponse,
  EndTripResponse,
} from '@yeojeong/shared';
import type { MembershipContext } from '../common/auth/index.js';
import { NotFoundError } from '../common/errors/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DomainEventPublisher } from './domain-event.publisher.js';
import { TRIP_EVENTS, type TripEndedEvent } from './events.js';
import { toKstIso } from './kst.js';
import { TripVersionMismatch, versionConflict } from './prisma-errors.js';
import { TripDetailService } from './trip-detail.service.js';
import {
  assertStatus,
  lockTrip,
  nextEventSeqs,
  requireActiveMembership,
  type Tx,
} from './trip-locks.js';
import { isAutoEndDue } from './trip-rules.js';

/** 자동 종료 잡 한 번에 처리하는 여정 수. 남으면 다음 실행(1분 뒤)이 이어서 한다 */
const AUTO_END_BATCH = 50;
/** 자동 종료 직전 훅(FINAL 동기화)을 기다리는 최대 시간(FR-305 AC3) */
const AUTO_ENDING_HOOK_TIMEOUT_MS = 60_000;
/** 종료됐는데 정산이 없거나 미확정이 남은 여정에 trip.ended를 다시 보내는 범위 */
const REDELIVERY_MIN_AGE_MS = 5 * 60_000;
const REDELIVERY_MAX_AGE_MS = 7 * 86_400_000;
const REDELIVERY_BATCH = 20;

type EndActor =
  | { reason: 'MANUAL'; membershipId: string; userId: string; version: number }
  | { reason: 'AUTO' };

/**
 * 여정 종료(FR-304·305·306). 순서는 src/trips/README.md "종료 처리 순서".
 * 1) 트랜잭션: Trip 행 FOR UPDATE → 단계·권한·version 재확인 → 미확정 건수 → status = ENDED → eventSeq
 * 2) 커밋 뒤 trip.ended → S2B(미확정 → 개인), S2C(정산 스냅샷)가 구독해 처리
 * 커밋 시점부터 결제를 바꾸는 모든 트랜잭션은 Trip 행을 잠근 뒤 ENDED를 보고 막히므로(I-6),
 * 구독자가 보는 결제 집합은 종료 시점 그대로다.
 */
@Injectable()
export class TripEndService {
  private readonly logger = new Logger(TripEndService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly detail: TripDetailService,
    private readonly events: DomainEventPublisher,
  ) {}

  /** FR-304: 종료 확인 다이얼로그용. 그룹 전체 미확정 건수(미결 Q-10 추천안) */
  async preview(tripId: string): Promise<EndPreviewResponse> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: { autoEndAt: true },
    });
    if (!trip) throw new NotFoundError();
    return {
      pendingCount: await countPending(this.prisma, tripId),
      autoEndAt: toKstIso(trip.autoEndAt),
    };
  }

  /** FR-304·306: 그룹장 수동 종료 */
  async endManually(
    tripId: string,
    me: MembershipContext,
    version: number,
    now = new Date(),
  ): Promise<EndTripResponse> {
    let ended: { event: TripEndedEvent; pendingCount: number } | null;
    try {
      ended = await this.endInTransaction(
        tripId,
        { reason: 'MANUAL', membershipId: me.id, userId: me.userId, version },
        now,
      );
    } catch (error) {
      if (error instanceof TripVersionMismatch) {
        throw versionConflict(await this.detail.build(tripId, me.id, now));
      }
      throw error;
    }
    // MANUAL은 조건이 안 맞으면 예외라 여기서는 항상 값이 있다
    await this.events.publish({
      name: TRIP_EVENTS.ENDED,
      payload: ended!.event,
    });

    const settlement = await this.prisma.settlement.findUnique({
      where: { tripId },
      select: { id: true },
    });
    return {
      trip: await this.detail.build(tripId, me.id, now),
      settlementId: settlement?.id ?? null,
      autoPersonalizedCount: ended!.pendingCount,
    };
  }

  /**
   * FR-305: 종료일 23:59:59 KST가 지난 진행 중 여정을 끝낸다. 여러 인스턴스가 동시에 돌아도
   * 여정마다 Trip 행 잠금 후 재확인하므로 한 번만 종료되고 trip.ended도 한 번만 나간다.
   */
  async runAutoEnd(now = new Date()): Promise<AutoEndJobResponse> {
    const due = await this.prisma.trip.findMany({
      where: {
        status: 'ONGOING',
        deletedAt: null,
        autoEndAt: { lte: now },
        group: { deletedAt: null },
      },
      orderBy: { autoEndAt: 'asc' },
      take: AUTO_END_BATCH,
      select: { id: true, groupId: true, autoEndAt: true },
    });

    if (due.length > 0) {
      // FINAL 동기화 훅. 실패하거나 60초가 지나도 종료는 그대로 진행한다
      await this.events.publishWithin(
        AUTO_ENDING_HOOK_TIMEOUT_MS,
        ...due.map((trip) => ({
          name: TRIP_EVENTS.AUTO_ENDING,
          payload: {
            tripId: trip.id,
            groupId: trip.groupId,
            autoEndAt: trip.autoEndAt,
          },
        })),
      );
    }

    const endedTripIds: string[] = [];
    for (const trip of due) {
      // 훅을 기다린 만큼 시각을 다시 잡는다(테스트가 미래 시각을 넘기면 그 값)
      const at = new Date(Math.max(Date.now(), now.getTime()));
      try {
        const ended = await this.endInTransaction(
          trip.id,
          { reason: 'AUTO' },
          at,
        );
        if (!ended) continue;
        await this.events.publish({
          name: TRIP_EVENTS.ENDED,
          payload: ended.event,
        });
        endedTripIds.push(trip.id);
      } catch (error) {
        // 한 여정이 실패해도 나머지는 계속한다. 다음 실행이 다시 시도한다
        this.logger.error({ tripId: trip.id, err: error }, 'auto end failed');
      }
    }

    const redeliveredTripIds = await this.redeliverIncompleteEnds(now);
    if (endedTripIds.length > 0 || redeliveredTripIds.length > 0) {
      this.logger.log(
        { ended: endedTripIds.length, redelivered: redeliveredTripIds.length },
        'auto end job done',
      );
    }
    return { endedTripIds, redeliveredTripIds };
  }

  /** 자동 종료면 조건이 안 맞을 때(이미 종료·기간 변경) null */
  private async endInTransaction(
    tripId: string,
    actor: EndActor,
    now: Date,
  ): Promise<{ event: TripEndedEvent; pendingCount: number } | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockTrip(tx, { tripId });
      if (actor.reason === 'MANUAL') {
        assertStatus(locked, ['ONGOING']);
        await requireActiveMembership(tx, actor.membershipId, locked.groupId, {
          leader: true,
        });
        if (locked.version !== actor.version) throw new TripVersionMismatch();
      } else if (!isAutoEndDue(locked, now)) {
        return null;
      }

      const pendingCount = await countPending(tx, tripId);
      await tx.trip.update({
        where: { id: tripId },
        data: {
          status: 'ENDED',
          endedAt: now,
          endedByMembershipId:
            actor.reason === 'MANUAL' ? actor.membershipId : null,
          endReason: actor.reason,
          version: { increment: 1 },
        },
      });
      const [eventSeq] = await nextEventSeqs(tx, 1);
      return {
        pendingCount,
        event: {
          tripId,
          groupId: locked.groupId,
          endedByUserId: actor.reason === 'MANUAL' ? actor.userId : null,
          endedAt: now,
          reason: actor.reason,
          redelivered: false,
          eventSeq,
          occurredAt: now,
        },
      };
    });
  }

  /**
   * 커밋 뒤 trip.ended 처리가 빠진 여정(프로세스 종료, 구독자 오류)을 메운다: 종료 5분~7일 사이인데
   * 정산이 없거나 미확정이 남았으면 다시 보낸다. 구독자가 하나도 없으면(모듈 미배포) 보내지 않는다.
   */
  private async redeliverIncompleteEnds(now: Date): Promise<string[]> {
    if (!this.events.hasListeners(TRIP_EVENTS.ENDED)) return [];
    const trips = await this.prisma.trip.findMany({
      where: {
        status: 'ENDED',
        deletedAt: null,
        endedAt: {
          gte: new Date(now.getTime() - REDELIVERY_MAX_AGE_MS),
          lte: new Date(now.getTime() - REDELIVERY_MIN_AGE_MS),
        },
        OR: [
          { settlement: { is: null } },
          {
            expenses: { some: { status: 'PENDING', refundOfExpenseId: null } },
          },
        ],
      },
      orderBy: { endedAt: 'asc' },
      take: REDELIVERY_BATCH,
      select: {
        id: true,
        groupId: true,
        endedAt: true,
        endReason: true,
        endedBy: { select: { userId: true } },
      },
    });
    if (trips.length === 0) return [];

    const seqs = await this.prisma.$transaction((tx) =>
      nextEventSeqs(tx, trips.length),
    );
    for (const [i, trip] of trips.entries()) {
      await this.events.publish({
        name: TRIP_EVENTS.ENDED,
        payload: {
          tripId: trip.id,
          groupId: trip.groupId,
          endedByUserId: trip.endedBy?.userId ?? null,
          endedAt: trip.endedAt!,
          reason: trip.endReason ?? 'AUTO',
          redelivered: true,
          eventSeq: seqs[i],
          occurredAt: trip.endedAt!,
        },
      });
    }
    this.logger.warn({ count: trips.length }, 'trip.ended redelivered');
    return trips.map((trip) => trip.id);
  }
}

/** 그룹 전체 미확정(취소 자식 제외) 건수 */
function countPending(db: Tx | PrismaService, tripId: string) {
  return db.expense.count({
    where: { tripId, status: 'PENDING', refundOfExpenseId: null },
  });
}
