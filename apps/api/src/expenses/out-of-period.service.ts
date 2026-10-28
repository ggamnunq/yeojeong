import { Injectable } from '@nestjs/common';
import {
  OUT_OF_PERIOD_LOOKBACK_DAYS,
  type AddOutOfPeriodExpensesResponse,
  type FxPolicy,
  type OutOfPeriodCandidate,
  type OutOfPeriodSide,
} from '@yeojeong/shared';
import type { MembershipContext } from '../common/auth/index.js';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  OutOfPeriodLookupService,
  type LiveCandidate,
  type TimeRange,
} from '../transactions/out-of-period-lookup.service.js';
import { ImportService } from '../transactions/import.service.js';
import { ExpenseQueryService } from './expense-query.service.js';
import { changeSnapshot } from './expense-rules.js';
import { formatOriginalAmount } from './expense-view.js';
import { kstDate, toKstIso } from './kst.js';
import {
  refundKrw,
  resolveKrw,
  type KrwResult,
  type RateQuote,
  type TripFx,
} from './krw.js';
import {
  lockActiveMembership,
  lockTransactions,
  lockTripExpenses,
  lockTripForShare,
} from './locks.js';

type Db = PrismaService | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIP_SELECT = {
  status: true,
  startAt: true,
  autoEndAt: true,
  currency: true,
  fxPolicy: true,
  fxFixedRate: true,
} satisfies Prisma.TripSelect;

const CANDIDATE_SELECT = {
  id: true,
  paymentMethodId: true,
  externalRef: true,
  occurredAt: true,
  merchantNameRaw: true,
  originalAmount: true,
  originalCurrency: true,
  providerKrwAmount: true,
  billedKrwAmount: true,
  spotKrwAmount: true,
  spotRate: {
    select: { rate: true, displayUnit: true, source: true, effectiveAt: true },
  },
  paymentMethod: { select: { shortLabel: true, last4: true } },
  cancels: {
    where: { kind: 'CANCEL' },
    select: {
      id: true,
      occurredAt: true,
      merchantNameRaw: true,
      originalAmount: true,
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.TransactionSelect;

type CandidateRecord = Prisma.TransactionGetPayload<{
  select: typeof CANDIDATE_SELECT;
}>;

type TripRecord = Prisma.TripGetPayload<{ select: typeof TRIP_SELECT }>;

/** 여정 전 [startAt − 60일, startAt) · 여정 후 (autoEndAt, now] (4-1-6) */
export function outOfPeriodWindow(
  trip: { startAt: Date; autoEndAt: Date },
  side: OutOfPeriodSide,
  now: Date,
): Prisma.DateTimeFilter | null {
  if (side === 'BEFORE') {
    return {
      gte: new Date(
        trip.startAt.getTime() - OUT_OF_PERIOD_LOOKBACK_DAYS * DAY_MS,
      ),
      lt: trip.startAt,
    };
  }
  return now > trip.autoEndAt ? { gt: trip.autoEndAt, lte: now } : null;
}

/** 저장 직전에도 본인 승인·활성 결제수단·여정 미추가를 다시 확인한다. */
function candidateWhere(
  userId: string,
  tripId: string,
): Prisma.TransactionWhereInput {
  return {
    userId,
    kind: 'APPROVAL',
    sameUserDuplicateOfId: null,
    paymentMethod: { status: { not: 'REMOVED' } },
    expenses: { none: { tripId } },
  };
}

/** 전액 취소된 거래는 후보에서 뺀다 */
export function isFullyCancelled(
  originalAmount: Prisma.Decimal,
  cancels: readonly { originalAmount: Prisma.Decimal }[],
): boolean {
  if (cancels.length === 0) return false;
  const cancelled = cancels.reduce(
    (sum, c) => sum.plus(c.originalAmount.abs()),
    new Prisma.Decimal(0),
  );
  return cancelled.gte(originalAmount.abs());
}

const tripFx = (trip: TripRecord): TripFx => ({
  currency: trip.currency,
  fxPolicy: trip.fxPolicy as FxPolicy,
  fxFixedRate: trip.fxFixedRate,
});

/**
 * 기간 외 결제 추가(FR-408, I-11). 후보 조회는 제공자 응답만 사용하고, 선택한 건만
 * Transaction + Expense(PENDING)를 같은 DB 트랜잭션에서 저장한다.
 */
@Injectable()
export class OutOfPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: ExpenseQueryService,
    private readonly lookup: OutOfPeriodLookupService,
    private readonly importer: ImportService,
  ) {}

  private range(
    trip: { startAt: Date; autoEndAt: Date },
    side: OutOfPeriodSide,
    now: Date,
  ): TimeRange | null {
    if (side === 'BEFORE') {
      return {
        fromAt: new Date(
          trip.startAt.getTime() - OUT_OF_PERIOD_LOOKBACK_DAYS * DAY_MS,
        ),
        toAt: new Date(trip.startAt.getTime() - 1),
      };
    }
    return now > trip.autoEndAt
      ? { fromAt: new Date(trip.autoEndAt.getTime() + 1), toAt: now }
      : null;
  }

  private async rateFor(
    db: Db,
    currency: string,
    at: Date,
  ): Promise<RateQuote | null> {
    const rate = await db.exchangeRate.findFirst({
      where: { quoteCurrency: currency, effectiveAt: { lte: at } },
      orderBy: { effectiveAt: 'desc' },
      select: {
        rate: true,
        displayUnit: true,
        source: true,
        effectiveAt: true,
      },
    });
    return rate;
  }

  private async krwOf(
    db: Db,
    record: CandidateRecord,
    trip: TripRecord,
  ): Promise<KrwResult | null> {
    const source = {
      originalAmount: record.originalAmount,
      originalCurrency: record.originalCurrency,
      providerKrwAmount: record.providerKrwAmount,
      billedKrwAmount: record.billedKrwAmount,
      spotKrwAmount: record.spotKrwAmount,
      spotRate: record.spotRate,
    };
    return (
      resolveKrw(source, tripFx(trip)) ??
      resolveKrw(
        source,
        tripFx(trip),
        await this.rateFor(db, record.originalCurrency, record.occurredAt),
      )
    );
  }

  private async liveKrwOf(
    candidate: LiveCandidate,
    trip: TripRecord,
  ): Promise<KrwResult | null> {
    const source = {
      originalAmount: new Prisma.Decimal(candidate.originalAmount),
      originalCurrency: candidate.originalCurrency,
      providerKrwAmount: candidate.providerKrwAmount,
      billedKrwAmount: candidate.billedKrwAmount,
      spotKrwAmount: null,
      spotRate: null,
    };
    return (
      resolveKrw(source, tripFx(trip)) ??
      resolveKrw(
        source,
        tripFx(trip),
        await this.rateFor(
          this.prisma,
          candidate.originalCurrency,
          candidate.occurredAt,
        ),
      )
    );
  }

  async candidates(
    tripId: string,
    me: MembershipContext,
    side: OutOfPeriodSide,
    now: Date = new Date(),
  ): Promise<OutOfPeriodCandidate[]> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: TRIP_SELECT,
    });
    if (!trip) throw new NotFoundError();
    const range = this.range(trip, side, now);
    if (!range) return [];
    const records = await this.lookup.list(me.userId, tripId, range, now);
    const items: OutOfPeriodCandidate[] = [];
    for (const record of records) {
      const krw = await this.liveKrwOf(record, trip);
      items.push({
        candidateId: record.candidateId,
        occurredAt: toKstIso(record.occurredAt),
        localDate: kstDate(record.occurredAt),
        merchantName: record.merchantName,
        krwAmount: krw?.krwAmount ?? null,
        originalAmount: formatOriginalAmount(
          new Prisma.Decimal(record.originalAmount),
          record.originalCurrency,
        ),
        currency: record.originalCurrency,
        paymentMethodLabel: record.paymentMethodLabel,
      });
    }
    return items;
  }

  async add(
    tripId: string,
    me: MembershipContext,
    candidateIds: readonly string[],
    now: Date = new Date(),
  ): Promise<AddOutOfPeriodExpensesResponse> {
    const currentTrip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: TRIP_SELECT,
    });
    if (!currentTrip) throw new NotFoundError();
    if (currentTrip.status !== 'ONGOING') {
      throw AppException.of('TRIP_PHASE_INVALID');
    }
    const ranges = (['BEFORE', 'AFTER'] as const)
      .map((side) => this.range(currentTrip, side, now))
      .filter((range): range is TimeRange => range !== null);
    const confirmed = await this.lookup.confirm(
      me.userId,
      tripId,
      candidateIds,
      ranges,
      now,
    );

    let createdIds: string[];
    try {
      createdIds = await this.prisma.$transaction(async (tx) => {
        const locked = await lockTripForShare(tx, tripId);
        if (!locked) throw new NotFoundError();
        if (locked.status !== 'ONGOING') {
          throw AppException.of('TRIP_PHASE_INVALID');
        }
        await lockTripExpenses(tx, tripId);
        if (!(await lockActiveMembership(tx, me.id))) throw new NotFoundError();
        const trip = await tx.trip.findUniqueOrThrow({
          where: { id: tripId },
          select: TRIP_SELECT,
        });
        for (const batch of confirmed.batches) {
          await this.importer.upsertProviderTransactions(
            me.userId,
            batch.paymentMethodId,
            batch.items,
            tx,
          );
        }
        await this.importer.matchCancels(me.userId, tx);
        const windows = (['BEFORE', 'AFTER'] as const)
          .map((side) => outOfPeriodWindow(trip, side, now))
          .filter((w): w is Prisma.DateTimeFilter => w !== null);
        const selectedWhere = confirmed.selected.map((item) => ({
          paymentMethodId: item.paymentMethodId,
          externalRef: item.externalRef,
        }));
        const selectedIds = await tx.transaction.findMany({
          where: { userId: me.userId, OR: selectedWhere },
          select: { id: true },
        });
        await lockTransactions(
          tx,
          selectedIds.map((item) => item.id),
        );
        const records = await tx.transaction.findMany({
          where: {
            ...candidateWhere(me.userId, tripId),
            AND: [
              { OR: selectedWhere },
              { OR: windows.map((window) => ({ occurredAt: window })) },
            ],
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          select: CANDIDATE_SELECT,
        });
        const valid = records.filter(
          (r) => !isFullyCancelled(r.originalAmount, r.cancels),
        );
        const validKeys = new Set(
          valid.map(
            (record) => `${record.paymentMethodId}:${record.externalRef}`,
          ),
        );
        const invalid = confirmed.selected
          .filter(
            (item) =>
              !validKeys.has(`${item.paymentMethodId}:${item.externalRef}`),
          )
          .map((item) => item.candidateId);
        if (invalid.length > 0) {
          throw AppException.of('OUT_OF_PERIOD_CANDIDATE_INVALID', {
            details: { invalidCandidateIds: invalid },
          });
        }

        const ids: string[] = [];
        for (const record of valid) {
          ids.push(await this.createExpense(tx, tripId, me.id, record, trip));
        }
        return ids;
      });
    } catch (error) {
      // 같은 거래를 동시에 추가(UNIQUE(tripId, transactionId), I-3)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw AppException.of('OUT_OF_PERIOD_CANDIDATE_INVALID', {
          cause: error,
        });
      }
      throw error;
    }
    const items = await this.query.rowsByIds(tripId, me.id, createdIds);
    return { added: items.length, items };
  }

  /** 미확정(OUT_OF_PERIOD) 부모 + 부분 취소 자식(4-1-4 7단계 "나중에 원 결제를 추가하면 그때 자식으로 붙는다") */
  private async createExpense(
    tx: Prisma.TransactionClient,
    tripId: string,
    payerMembershipId: string,
    record: CandidateRecord,
    trip: TripRecord,
  ): Promise<string> {
    const krw = await this.krwOf(tx, record, trip);
    if (!krw) throw AppException.of('FX_RATE_UNAVAILABLE');
    const parentKrw = krw.krwAmount;
    const children = record.cancels.map((cancel) => ({
      cancel,
      krwAmount: refundKrw(
        {
          krwAmount: parentKrw,
          originalAmount: record.originalAmount,
          originalCurrency: record.originalCurrency,
        },
        cancel.originalAmount,
      ),
    }));
    const net = Math.max(
      0,
      parentKrw + children.reduce((sum, c) => sum + c.krwAmount, 0),
    );
    const fx = krw.fx ?? {
      fxPolicyApplied: null,
      fxRate: null,
      fxRateUnit: null,
      fxRateSource: null,
      fxRateAt: null,
    };

    const parent = await tx.expense.create({
      data: {
        tripId,
        transactionId: record.id,
        payerMembershipId,
        status: 'PENDING',
        origin: 'OUT_OF_PERIOD',
        occurredAt: record.occurredAt,
        merchantName: record.merchantNameRaw,
        originalAmount: record.originalAmount,
        originalCurrency: record.originalCurrency,
        krwAmount: parentKrw,
        netKrwAmount: net,
        ...fx,
      },
      select: { id: true },
    });
    for (const child of children) {
      await tx.expense.create({
        data: {
          tripId,
          transactionId: child.cancel.id,
          payerMembershipId,
          status: 'PENDING',
          origin: 'OUT_OF_PERIOD',
          occurredAt: child.cancel.occurredAt,
          merchantName: child.cancel.merchantNameRaw,
          originalAmount: child.cancel.originalAmount,
          originalCurrency: record.originalCurrency,
          krwAmount: child.krwAmount,
          netKrwAmount: null,
          refundOfExpenseId: parent.id,
          ...fx,
        },
      });
    }
    await tx.expenseChangeLog.createMany({
      data: [
        {
          expenseId: parent.id,
          tripId,
          actorMembershipId: payerMembershipId,
          action: 'OUT_OF_PERIOD_ADDED' as const,
          after: changeSnapshot('PENDING', [], net),
        },
        ...children.map((child) => ({
          expenseId: parent.id,
          tripId,
          actorMembershipId: null,
          action: 'REFUND_ATTACHED' as const,
          after: { refundTransactionId: child.cancel.id, netKrwAmount: net },
        })),
      ],
    });
    return parent.id;
  }
}
