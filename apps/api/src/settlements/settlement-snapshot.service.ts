import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  SettlementRecomputeResult,
  SettlementSweepResult,
} from '@yeojeong/shared';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  computeSettlement,
  SETTLEMENT_ALGORITHM_VERSION,
  type SettlementResult,
} from './compute.js';
import {
  countPersonalByMember,
  loadMembers,
  loadSharedExpenses,
  type Db,
} from './ledger.js';
import { TRIP_ENDED_EVENT, type TripEndedEvent } from './settlement.events.js';

const TRIP_SELECT = {
  id: true,
  groupId: true,
  status: true,
  endedAt: true,
  fxPolicy: true,
} as const satisfies Prisma.TripSelect;

export type SnapshotTrip = Prisma.TripGetPayload<{
  select: typeof TRIP_SELECT;
}>;

export interface EnsureSettlementResult {
  settlementId: string;
  /** 이번 호출이 만들었으면 true, 이미 있었으면 false(no-op) */
  created: boolean;
}

const TX_OPTIONS = { timeout: 30_000 } as const;

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * 종료 정산 스냅샷(기능명세 4-4, FR-306·701). 여정당 정확히 1건이고 한 번 만들면 다시 계산하지 않는다.
 * 만드는 길은 ensureSettlement 하나다: trip.ended 리스너, GET …/settlement(지연 생성), 내부 잡(빠진 정산 복구)이 모두 이걸 부른다.
 * 다시 계산은 recompute(그룹장 또는 내부 잡)로만 한다.
 */
@Injectable()
export class SettlementSnapshotService {
  private readonly logger = new Logger(SettlementSnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * trips 모듈의 종료 커밋 뒤 이벤트. 실패는 로그를 남기고 다시 던진다(발행자 emitAsync가 받는다).
   * 놓쳐도 GET 지연 생성과 POST /api/internal/jobs/settlements가 같은 함수로 복구한다.
   */
  @OnEvent(TRIP_ENDED_EVENT, { suppressErrors: false })
  async onTripEnded(event: TripEndedEvent): Promise<void> {
    try {
      const result = await this.ensureSettlement(event.tripId);
      this.logger.log(
        { tripId: event.tripId, ...result },
        result.created ? '정산 스냅샷 생성' : '정산 스냅샷이 이미 있음',
      );
    } catch (error) {
      this.logger.error(
        { err: error, tripId: event.tripId },
        '정산 스냅샷 생성 실패(GET 지연 생성·내부 잡으로 다시 시도됨)',
      );
      throw error;
    }
  }

  /**
   * 종료된 여정의 정산을 보장한다(멱등). 있으면 그대로 돌려주고, 없으면 Trip 행을 FOR UPDATE로 잠근 트랜잭션에서
   * 다시 확인한 뒤 만든다. 동시에 여러 번 불러도 1건만 생긴다(행 잠금 + settlements.trip_id UNIQUE).
   * @throws NotFoundError 여정이 없거나 삭제됨
   * @throws AppException TRIP_PHASE_INVALID 아직 종료되지 않음
   * @throws SettlementImbalanceError 검산 실패(롤백, 아무것도 저장하지 않음)
   */
  async ensureSettlement(tripId: string): Promise<EnsureSettlementResult> {
    const existing = await this.findSettlementId(this.prisma, tripId);
    if (existing) return { settlementId: existing, created: false };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const trip = await this.lockEndedTrip(tx, tripId);
        const again = await this.findSettlementId(tx, tripId);
        if (again) return { settlementId: again, created: false };
        return {
          settlementId: await this.writeSnapshot(tx, trip),
          created: true,
        };
      }, TX_OPTIONS);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const winner = await this.findSettlementId(this.prisma, tripId);
        if (winner) return { settlementId: winner, created: false };
      }
      throw error;
    }
  }

  /**
   * 명시적 재계산(그룹장 POST …/settlement/recompute, 내부 잡). 기존 스냅샷을 지우고 같은 트랜잭션에서 다시 만든다.
   * 종료 후 결제는 바뀌지 않으므로(I-6) 보통 같은 값이 나온다. 알고리즘 버전을 올렸을 때 쓴다.
   */
  async recompute(tripId: string): Promise<SettlementRecomputeResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const trip = await this.lockEndedTrip(tx, tripId);
      const { count } = await tx.settlement.deleteMany({ where: { tripId } });
      const settlementId = await this.writeSnapshot(tx, trip);
      return { tripId, settlementId, replaced: count > 0 };
    }, TX_OPTIONS);
    this.logger.log(result, '정산 스냅샷 재계산');
    return result;
  }

  /** 종료됐는데 정산이 없는 여정을 찾아 만든다(리스너 실패 복구). 실패가 있으면 다 돌고 나서 500 */
  async sweepMissing(limit = 50): Promise<SettlementSweepResult> {
    const trips = await this.prisma.trip.findMany({
      where: { status: 'ENDED', deletedAt: null, settlement: { is: null } },
      orderBy: { endedAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    const result: SettlementSweepResult = {
      checked: trips.length,
      created: 0,
      failed: 0,
    };
    for (const trip of trips) {
      try {
        if ((await this.ensureSettlement(trip.id)).created) result.created += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          { err: error, tripId: trip.id },
          '빠진 정산 생성 실패',
        );
      }
    }
    if (result.failed > 0) {
      throw AppException.of('INTERNAL_ERROR', { details: { ...result } });
    }
    return result;
  }

  /**
   * 종료 미리보기(trips end-preview 등). 저장하지 않고 지금 장부로 계산한다. 나간 멤버 = 지금 나가 있는 멤버.
   * 미확정은 종료 때 개인이 되므로 personalCount에 넣는다.
   */
  async preview(tripId: string): Promise<SettlementResult> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: TRIP_SELECT,
    });
    if (!trip) throw new NotFoundError();
    return this.computeFor(this.prisma, trip, null);
  }

  /** 스냅샷 쓰기. 호출자가 Trip 행을 잠근 트랜잭션에서 부른다 */
  async writeSnapshot(
    tx: Prisma.TransactionClient,
    trip: SnapshotTrip,
  ): Promise<string> {
    const endedAt = trip.endedAt;
    if (!endedAt) throw AppException.of('TRIP_PHASE_INVALID');
    const result = await this.computeFor(tx, trip, endedAt);
    if (result.memberCount === 0) {
      throw new Error(`정산 대상 멤버가 없습니다(trip ${trip.id})`);
    }
    const settlement = await tx.settlement.create({
      data: {
        tripId: trip.id,
        totalSharedKrw: result.totalSharedKrw,
        sharedCount: result.sharedCount,
        memberCount: result.memberCount,
        perCapitaKrw: result.perCapitaKrw,
        fxPolicy: trip.fxPolicy,
        algorithmVersion: SETTLEMENT_ALGORITHM_VERSION,
        // 정산 확정 시각 = Trip.endedAt(스키마 주석)
        createdAt: endedAt,
      },
      select: { id: true },
    });
    await tx.settlementMember.createMany({
      data: result.members.map((m) => ({
        settlementId: settlement.id,
        membershipId: m.membershipId,
        paidKrw: m.paidKrw,
        paidCount: m.paidCount,
        burdenKrw: m.burdenKrw,
        netKrw: m.netKrw,
        personalCount: m.personalCount,
        isLeft: m.isLeft,
      })),
    });
    if (result.transfers.length > 0) {
      await tx.settlementTransfer.createMany({
        data: result.transfers.map((t) => ({
          settlementId: settlement.id,
          seq: t.seq,
          fromMembershipId: t.fromMembershipId,
          toMembershipId: t.toMembershipId,
          amountKrw: t.amountKrw,
        })),
      });
    }
    return settlement.id;
  }

  /** @param asOf 나간 멤버 판정 시각(종료 시각). null이면 지금 */
  private async computeFor(
    db: Db,
    trip: SnapshotTrip,
    asOf: Date | null,
  ): Promise<SettlementResult> {
    const members = await loadMembers(db, trip.groupId);
    const sharedExpenses = await loadSharedExpenses(db, trip.id);
    const personal = await countPersonalByMember(db, trip.id);
    return computeSettlement({
      members: members.map((m) => ({
        membershipId: m.id,
        joinOrder: m.joinOrder,
        isLeft:
          m.leftAt !== null &&
          (asOf === null || m.leftAt.getTime() <= asOf.getTime()),
        personalCount: personal.get(m.id) ?? 0,
      })),
      sharedExpenses,
    });
  }

  private async lockEndedTrip(
    tx: Prisma.TransactionClient,
    tripId: string,
  ): Promise<SnapshotTrip> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM trips WHERE id = ${tripId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundError();
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: TRIP_SELECT,
    });
    if (trip.status !== 'ENDED' || !trip.endedAt) {
      throw AppException.of('TRIP_PHASE_INVALID');
    }
    return trip;
  }

  private async findSettlementId(db: Db, tripId: string) {
    const row = await db.settlement.findUnique({
      where: { tripId },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
