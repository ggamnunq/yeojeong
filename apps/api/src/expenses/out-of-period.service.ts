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
/** 후보 목록 상한(화면은 체크 목록 한 장) */
const CANDIDATE_LIST_MAX = 300;

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

/** 본인 승인 거래 중 후보가 될 수 있는 것(동일 사용자 중복·해제된 결제수단·이미 이 여정에 있는 거래 제외) */
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
 * 기간 외 결제 추가(FR-408, 4-1-6). 후보는 저장된 Transaction(본인 것)만 본다 —
 * 범위 밖 거래를 제공자에서 가져와 보관하는 일은 인입(S2B-1)이 맡는다.
 */
@Injectable()
export class OutOfPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: ExpenseQueryService,
  ) {}

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
    const window = outOfPeriodWindow(trip, side, now);
    if (!window) return [];

    const records = await this.prisma.transaction.findMany({
      where: { ...candidateWhere(me.userId, tripId), occurredAt: window },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: CANDIDATE_LIST_MAX,
      select: CANDIDATE_SELECT,
    });
    const items: OutOfPeriodCandidate[] = [];
    for (const record of records) {
      if (isFullyCancelled(record.originalAmount, record.cancels)) continue;
      const krw = await this.krwOf(this.prisma, record, trip);
      items.push({
        candidateId: record.id,
        occurredAt: toKstIso(record.occurredAt),
        localDate: kstDate(record.occurredAt),
        merchantName: record.merchantNameRaw,
        krwAmount: krw?.krwAmount ?? null,
        originalAmount: formatOriginalAmount(
          record.originalAmount,
          record.originalCurrency,
        ),
        currency: record.originalCurrency,
        paymentMethodLabel: `${record.paymentMethod.shortLabel} ${record.paymentMethod.last4}`,
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

        await lockTransactions(tx, candidateIds);
        const windows = (['BEFORE', 'AFTER'] as const)
          .map((side) => outOfPeriodWindow(trip, side, now))
          .filter((w): w is Prisma.DateTimeFilter => w !== null);
        const records = await tx.transaction.findMany({
          where: {
            ...candidateWhere(me.userId, tripId),
            id: { in: [...candidateIds] },
            OR: windows.map((w) => ({ occurredAt: w })),
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          select: CANDIDATE_SELECT,
        });
        const valid = records.filter(
          (r) => !isFullyCancelled(r.originalAmount, r.cancels),
        );
        const validIds = new Set(valid.map((r) => r.id));
        const invalid = candidateIds.filter((id) => !validIds.has(id));
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
