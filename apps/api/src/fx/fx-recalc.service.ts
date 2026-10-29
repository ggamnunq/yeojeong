import { Injectable, Logger } from '@nestjs/common';
import { splitEvenly, type FxPolicy } from '@yeojeong/shared';
import type { Prisma } from '../generated/prisma/client.js';
import {
  convertToKrw,
  effectiveFxPolicy,
  FxRateMissingError,
  type ConvertResult,
} from './convert.js';
import { KRW } from './currencies.js';
import { FxRatesService, type SpotRateTable } from './fx-rates.service.js';

export interface RecalcTrip {
  id: string;
  groupId: string;
  /** 여정 통화. FIXED 여정에서 이 통화도 KRW도 아닌 결제는 시장 환율(C-32, effectiveFxPolicy) */
  currency: string;
  fxPolicy: FxPolicy;
  fxFixedRate: Prisma.Decimal | null;
  fxPolicyChangedAt: Date | null;
}

type ExpenseRow = Awaited<ReturnType<typeof loadExpenses>>[number];

function loadExpenses(tx: Prisma.TransactionClient, tripId: string) {
  return tx.expense.findMany({
    where: { tripId },
    select: {
      id: true,
      refundOfExpenseId: true,
      status: true,
      payerMembershipId: true,
      occurredAt: true,
      originalAmount: true,
      originalCurrency: true,
      krwAmount: true,
      netKrwAmount: true,
      fxPolicyApplied: true,
      fxRate: true,
      fxRateUnit: true,
      fxRateSource: true,
      fxRateAt: true,
      transaction: {
        select: {
          billedKrwAmount: true,
          billedAt: true,
          providerKrwAmount: true,
        },
      },
      shares: {
        select: {
          membershipId: true,
          amountKrw: true,
          isRemainderHolder: true,
        },
        orderBy: { membershipId: 'asc' },
      },
    },
  });
}

interface ShareRow {
  membershipId: string;
  amountKrw: number;
  isRemainderHolder: boolean;
}

function sameShares(a: readonly ShareRow[], b: readonly ShareRow[]) {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((s) => [s.membershipId, s]));
  return a.every((s) => {
    const other = byId.get(s.membershipId);
    return (
      other !== undefined &&
      other.amountKrw === s.amountKrw &&
      other.isRemainderHolder === s.isRemainderHolder
    );
  });
}

function sameSnapshot(row: ExpenseRow, next: ConvertResult) {
  return (
    row.krwAmount === next.krwAmount &&
    row.fxPolicyApplied === next.policyApplied &&
    (row.fxRate?.toFixed(6) ?? null) === next.rate &&
    row.fxRateUnit === next.rateUnit &&
    row.fxRateSource === next.rateSource &&
    (row.fxRateAt?.getTime() ?? null) === (next.rateAt?.getTime() ?? null)
  );
}

/**
 * 환율 재계산(기능명세 4-5 "재계산 시점", FR-808). 정책·고정값 변경, 청구 확정 도착 때 여정의 모든 결제(취소 자식 포함)를 다시 환산하고
 * 부모 순액·부담 인원 몫(ExpenseShare)을 다시 쓴다. "변경됨"은 붙이지 않고 FX_RECALCULATED 이력만 남긴다.
 * 호출자가 같은 트랜잭션에서 Trip 행을 FOR UPDATE로 잠근 뒤 부른다(8-3). 종료된 여정에는 부르지 않는다(I-6).
 */
@Injectable()
export class FxRecalcService {
  private readonly logger = new Logger(FxRecalcService.name);

  constructor(private readonly rates: FxRatesService) {}

  /** @returns 원화가 바뀐 결제 수 */
  async recalculateTrip(
    tx: Prisma.TransactionClient,
    trip: RecalcTrip,
    actorMembershipId: string | null,
  ): Promise<number> {
    const expenses = await loadExpenses(tx, trip.id);
    const foreign = expenses.filter((e) => e.originalCurrency !== KRW);
    if (foreign.length === 0) return 0;

    const policyOf = (e: ExpenseRow) =>
      effectiveFxPolicy(trip.fxPolicy, trip.currency, e.originalCurrency);
    const table = await this.spotTable(
      tx,
      foreign.filter((e) => policyOf(e) !== 'FIXED'),
    );
    const fixedRate = trip.fxFixedRate?.toFixed(6) ?? null;

    // 1) 건별 원화
    const converted = new Map<string, ConvertResult>();
    let missing = 0;
    for (const expense of foreign) {
      try {
        converted.set(
          expense.id,
          convertToKrw({
            amount: expense.originalAmount.toFixed(4),
            currency: expense.originalCurrency,
            policy: policyOf(expense),
            spot: table?.find(expense.originalCurrency, expense.occurredAt),
            fixedRate,
            fixedAt: trip.fxPolicyChangedAt,
            billedKrwAmount: expense.transaction?.billedKrwAmount,
            billedAt: expense.transaction?.billedAt,
            providerKrwAmount: expense.transaction?.providerKrwAmount,
          }),
        );
      } catch (error) {
        if (!(error instanceof FxRateMissingError)) throw error;
        missing += 1; // 고시가 없으면 지금 값을 그대로 둔다
      }
    }
    if (missing > 0) {
      this.logger.warn(
        { tripId: trip.id, missing },
        '고시가 없어 일부 결제는 다시 계산하지 않았습니다',
      );
    }
    const krwOf = (e: ExpenseRow) =>
      converted.get(e.id)?.krwAmount ?? e.krwAmount;

    // 2) 부모 순액 = max(0, 부모 + Σ자식)
    const childrenOf = new Map<string, ExpenseRow[]>();
    for (const e of expenses) {
      if (!e.refundOfExpenseId) continue;
      childrenOf.set(e.refundOfExpenseId, [
        ...(childrenOf.get(e.refundOfExpenseId) ?? []),
        e,
      ]);
    }
    const joinOrders = new Map(
      (
        await tx.membership.findMany({
          where: { groupId: trip.groupId },
          select: { id: true, joinOrder: true },
        })
      ).map((m) => [m.id, m.joinOrder]),
    );

    let changedCount = 0;
    for (const expense of expenses) {
      const next = converted.get(expense.id);
      const data: Prisma.ExpenseUpdateInput = {};
      if (next && !sameSnapshot(expense, next)) {
        if (expense.krwAmount !== next.krwAmount) changedCount += 1;
        Object.assign(data, {
          krwAmount: next.krwAmount,
          fxPolicyApplied: next.policyApplied,
          fxRate: next.rate,
          fxRateUnit: next.rateUnit,
          fxRateSource: next.rateSource,
          fxRateAt: next.rateAt,
        });
      }

      let shares: ShareRow[] | null = null;
      let netBefore: number | null = null;
      let netAfter: number | null = null;
      if (!expense.refundOfExpenseId) {
        const net = Math.max(
          0,
          krwOf(expense) +
            (childrenOf.get(expense.id) ?? []).reduce(
              (sum, c) => sum + krwOf(c),
              0,
            ),
        );
        if (net !== expense.netKrwAmount) {
          data.netKrwAmount = net;
          netBefore = expense.netKrwAmount;
          netAfter = net;
        }
        if (expense.status === 'SHARED' && expense.shares.length > 0) {
          const split = splitEvenly(
            net,
            expense.shares.map((s) => ({
              membershipId: s.membershipId,
              joinOrder:
                joinOrders.get(s.membershipId) ?? Number.MAX_SAFE_INTEGER,
            })),
            expense.payerMembershipId,
          );
          if (!sameShares(split.shares, expense.shares)) shares = split.shares;
        }
      }

      if (Object.keys(data).length === 0 && !shares) continue;
      await tx.expense.update({
        where: { id: expense.id },
        data: { ...data, version: { increment: 1 } },
      });
      if (shares) {
        await tx.expenseShare.deleteMany({ where: { expenseId: expense.id } });
        await tx.expenseShare.createMany({
          data: shares.map((s) => ({ expenseId: expense.id, ...s })),
        });
      }
      if (netAfter !== null) {
        const n = expense.shares.length;
        const participantIds = expense.shares.map((s) => s.membershipId);
        const perPerson = (value: number | null) =>
          expense.status === 'SHARED' && n > 0 && value !== null
            ? Math.floor(value / n)
            : null;
        await tx.expenseChangeLog.create({
          data: {
            expenseId: expense.id,
            tripId: trip.id,
            actorMembershipId,
            action: 'FX_RECALCULATED',
            before: {
              status: expense.status,
              participantIds,
              netKrwAmount: netBefore,
              perPersonKrw: perPerson(netBefore),
            },
            after: {
              status: expense.status,
              participantIds,
              netKrwAmount: netAfter,
              perPersonKrw: perPerson(netAfter),
            },
          },
        });
      }
    }
    return changedCount;
  }

  /** 매매기준율이 필요할 수 있는 결제(FIXED가 아닌 것)의 고시 표. 없으면 null */
  private async spotTable(
    tx: Prisma.TransactionClient,
    needsSpot: readonly ExpenseRow[],
  ): Promise<SpotRateTable | null> {
    if (needsSpot.length === 0) return null;
    const times = needsSpot.map((e) => e.occurredAt.getTime());
    return this.rates.loadSpotTable(
      needsSpot.map((e) => e.originalCurrency),
      new Date(Math.min(...times)),
      new Date(Math.max(...times)),
      tx,
    );
  }
}
