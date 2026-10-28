import { Injectable } from '@nestjs/common';
import type {
  FxPolicy,
  TripFxView,
  UpdateFxPolicyResponse,
} from '@yeojeong/shared';
import type { MembershipContext } from '../common/auth/index.js';
import {
  AppException,
  NotFoundError,
  ValidationFailedError,
} from '../common/errors/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeFixedRate } from './convert.js';
import { currencyMeta, KRW } from './currencies.js';
import { FxRatesService } from './fx-rates.service.js';
import { FxRecalcService } from './fx-recalc.service.js';
import { toKstIso } from './kst.js';

const TRIP_FX_SELECT = {
  id: true,
  groupId: true,
  currency: true,
  status: true,
  fxPolicy: true,
  fxFixedRate: true,
  fxPolicyChangedAt: true,
  version: true,
} as const satisfies Prisma.TripSelect;

type TripFxRow = Prisma.TripGetPayload<{ select: typeof TRIP_FX_SELECT }>;

export interface UpdateFxPolicyInput {
  policy: FxPolicy;
  fixedRate?: string;
  version: number;
}

/** 이 트랜잭션이 끝날 때까지 Trip 행을 잠근다(기능명세 8-3). 없으면 false */
export async function lockTripForUpdate(
  tx: Prisma.TransactionClient,
  tripId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${tripId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  return rows.length > 0;
}

/** 여정 환율 적용 기준(FR-806·807·808) */
@Injectable()
export class FxPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: FxRatesService,
    private readonly recalc: FxRecalcService,
  ) {}

  async getView(tripId: string, me: MembershipContext): Promise<TripFxView> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: TRIP_FX_SELECT,
    });
    if (!trip) throw new NotFoundError();
    return this.toView(trip, me.role === 'LEADER');
  }

  /**
   * 그룹장이 환율 기준을 바꾼다. Trip 행을 잠그고 단계·역할·version을 다시 확인한 뒤 진행 중이면 여정 전체를 다시 환산한다.
   * 같은 값이면 아무것도 바꾸지 않는다(멱등, version 그대로).
   */
  async update(
    tripId: string,
    me: MembershipContext,
    input: UpdateFxPolicyInput,
  ): Promise<UpdateFxPolicyResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        if (!(await lockTripForUpdate(tx, tripId))) throw new NotFoundError();
        const trip = await tx.trip.findUniqueOrThrow({
          where: { id: tripId },
          select: TRIP_FX_SELECT,
        });
        const membership = await tx.membership.findFirst({
          where: { id: me.id, groupId: trip.groupId, leftAt: null },
          select: { role: true },
        });
        if (!membership) throw new NotFoundError();
        if (membership.role !== 'LEADER') throw AppException.of('NOT_LEADER');
        if (trip.status === 'ENDED') throw AppException.of('FX_POLICY_LOCKED');
        if (trip.currency === KRW) {
          throw AppException.of('BAD_REQUEST', {
            message: '원화 여정은 환율 기준이 없어요',
          });
        }
        if (input.version !== trip.version) {
          throw AppException.of('VERSION_CONFLICT', {
            details: { current: await this.toView(trip, true) },
          });
        }

        const storedFixed = trip.fxFixedRate?.toFixed(2) ?? null;
        let fixedRate = storedFixed;
        if (input.policy === 'FIXED') {
          fixedRate = normalizeFixedRate(input.fixedRate ?? '');
          if (!fixedRate) {
            throw new ValidationFailedError([
              {
                path: 'fixedRate',
                code: 'positive',
                message: '0보다 큰 환율을 소수 둘째 자리까지 입력해 주세요',
              },
            ]);
          }
        }
        if (trip.fxPolicy === input.policy && fixedRate === storedFixed) {
          return { fx: await this.toView(trip, true), recalculatedCount: 0 };
        }

        const updated = await tx.trip.update({
          where: { id: tripId },
          data: {
            fxPolicy: input.policy,
            fxFixedRate: fixedRate,
            fxPolicyChangedAt: new Date(),
            version: { increment: 1 },
          },
          select: TRIP_FX_SELECT,
        });
        const recalculatedCount = await this.recalc.recalculateTrip(
          tx,
          updated,
          me.id,
        );
        // 다른 멤버는 다음 진입 때 토스트 "새 환율로 다시 계산했어요" 1회(FR-004)
        await tx.tripEvent.create({
          data: {
            tripId,
            type: 'FX_POLICY_CHANGED',
            payload: { policy: input.policy },
            actorMembershipId: me.id,
          },
        });
        return { fx: await this.toView(updated, true), recalculatedCount };
      },
      { timeout: 30_000 },
    );
  }

  /**
   * 수집 잡용: 진행 중 여정 하나를 잠그고 지금 정책으로 다시 환산한다(CARD_BILLED 청구 확정 반영 등).
   * 진행 중이 아니거나 FIXED면 0.
   */
  async recalculateOngoing(tripId: string): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        if (!(await lockTripForUpdate(tx, tripId))) return 0;
        const trip = await tx.trip.findUniqueOrThrow({
          where: { id: tripId },
          select: TRIP_FX_SELECT,
        });
        if (trip.status !== 'ONGOING' || trip.fxPolicy === 'FIXED') return 0;
        return this.recalc.recalculateTrip(tx, trip, null);
      },
      { timeout: 30_000 },
    );
  }

  private async toView(
    trip: TripFxRow,
    isLeader: boolean,
  ): Promise<TripFxView> {
    const meta = currencyMeta(trip.currency);
    const isKrwTrip = meta.code === KRW;
    return {
      baseCurrency: 'KRW',
      tripCurrency: meta.code,
      currencyNameKo: meta.nameKo,
      displayUnit: meta.displayUnit,
      isKrwTrip,
      current: isKrwTrip ? null : await this.rates.findLatest(meta.code),
      policy: trip.fxPolicy,
      fixedRate: trip.fxFixedRate?.toFixed(2) ?? null,
      policyChangedAt: trip.fxPolicyChangedAt
        ? toKstIso(trip.fxPolicyChangedAt)
        : null,
      canEdit: isLeader && trip.status !== 'ENDED' && !isKrwTrip,
      version: trip.version,
    };
  }
}
