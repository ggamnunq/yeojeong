import { Injectable, Optional } from '@nestjs/common';
import {
  EXPENSE_LIST_LIMIT,
  type ExpenseDetailResponse,
  type ExpenseListOrder,
  type ExpenseListResponse,
  type ExpenseRow,
  type ExpenseStatus,
  type TripStatus,
} from '@yeojeong/shared';
import {
  NotFoundError,
  ValidationFailedError,
} from '../common/errors/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { FeatureFlags } from '../common/features.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { afterCursor, decodeCursor, encodeCursor } from './cursor.js';
import { ExpenseLifecycleService } from './expense-lifecycle.service.js';
import { statusFilterWhere, visibleExpenseWhere } from './expense-rules.js';
import {
  EXPENSE_DETAIL_SELECT,
  EXPENSE_ROW_SELECT,
  MEMBER_SELECT,
  toExpenseDetail,
  toExpenseRow,
  type ViewContext,
} from './expense-view.js';
import {
  addDays,
  dateOnly,
  dayIndexOf,
  kstDate,
  kstDayRange,
  tripDays,
} from './kst.js';

type Db = PrismaService | Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID.test(value);

const TRIP_SELECT = {
  id: true,
  groupId: true,
  status: true,
  startDate: true,
  endDate: true,
  startAt: true,
  autoEndAt: true,
  currency: true,
  fxPolicy: true,
  fxFixedRate: true,
} satisfies Prisma.TripSelect;

export type TripRecord = Prisma.TripGetPayload<{ select: typeof TRIP_SELECT }>;

export interface ListOptions {
  cursor?: string;
  limit?: number;
  status?: ExpenseStatus;
  day?: number;
  order?: ExpenseListOrder;
}

/**
 * 결제 조회(FR-501~503). 모든 조회에 가시성 필터(visibleExpenseWhere, I-8)와 tripId 조건을 함께 건다.
 * 종료된 여정은 조회 전에 남은 미확정을 개인으로 바꾸고(지연 전환), 응답도 PENDING을 PERSONAL로 내보낸다.
 */
@Injectable()
export class ExpenseQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ExpenseLifecycleService,
    @Optional() private readonly features?: FeatureFlags,
  ) {}

  async loadContext(
    tripId: string,
    viewerMembershipId: string,
    db: Db = this.prisma,
  ): Promise<{ trip: TripRecord; ctx: ViewContext }> {
    const trip = await db.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: TRIP_SELECT,
    });
    if (!trip) throw new NotFoundError();
    const members = await db.membership.findMany({
      where: { groupId: trip.groupId },
      select: MEMBER_SELECT,
    });
    return {
      trip,
      ctx: {
        tripStatus: trip.status as TripStatus,
        period: {
          startDate: dateOnly(trip.startDate),
          endDate: dateOnly(trip.endDate),
        },
        viewerMembershipId,
        members: new Map(members.map((m) => [m.id, m])),
      },
    };
  }

  private async prepare(tripId: string, viewerMembershipId: string) {
    const loaded = await this.loadContext(tripId, viewerMembershipId);
    if (loaded.trip.status === 'ENDED') {
      await this.lifecycle.ensurePersonalizedAfterEnd(tripId);
    }
    return loaded;
  }

  async list(
    tripId: string,
    viewerMembershipId: string,
    options: ListOptions = {},
    now: Date = new Date(),
  ): Promise<ExpenseListResponse> {
    const { trip, ctx } = await this.prepare(tripId, viewerMembershipId);
    const order = options.order ?? 'desc';
    const limit = Math.min(
      Math.max(options.limit ?? EXPENSE_LIST_LIMIT.DEFAULT, 1),
      EXPENSE_LIST_LIMIT.MAX,
    );

    const and: Prisma.ExpenseWhereInput[] = [
      { tripId },
      visibleExpenseWhere(viewerMembershipId),
      statusFilterWhere(options.status, ctx.tripStatus),
    ];
    if (options.day !== undefined) {
      // 타임라인은 여정 기간 안의 Day만(기간 외 결제는 리스트에서만, FR-502)
      and.push(
        options.day > tripDays(ctx.period)
          ? { id: { in: [] } }
          : {
              occurredAt: kstDayRange(
                addDays(ctx.period.startDate, options.day - 1),
              ),
            },
      );
    }
    if (options.cursor !== undefined) {
      const cursor = decodeCursor(options.cursor);
      if (!cursor) {
        throw new ValidationFailedError([
          {
            path: 'cursor',
            code: 'invalid',
            message: '목록 위치가 올바르지 않아요',
          },
        ]);
      }
      and.push(afterCursor(cursor, order));
    }

    const [records, pendingCount] = await Promise.all([
      this.prisma.expense.findMany({
        where: { AND: and },
        orderBy: [{ occurredAt: order }, { id: order }],
        take: limit + 1,
        select: EXPENSE_ROW_SELECT,
      }),
      ctx.tripStatus === 'ENDED'
        ? Promise.resolve(0)
        : this.prisma.expense.count({
            where: {
              tripId,
              status: 'PENDING',
              payerMembershipId: viewerMembershipId,
              refundOfExpenseId: null,
            },
          }),
    ]);

    const page = records.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => toExpenseRow(r, ctx)),
      nextCursor:
        records.length > limit && last
          ? encodeCursor({ occurredAt: last.occurredAt, id: last.id })
          : null,
      pendingCount,
      // 기간 외 결제 추가는 연동 전용(FR-006)
      showOutOfPeriodEntry:
        trip.status === 'ONGOING' && (this.features?.accountLink ?? true),
      period: {
        tripStatus: ctx.tripStatus,
        startDate: ctx.period.startDate,
        endDate: ctx.period.endDate,
        days: tripDays(ctx.period),
        todayDayIndex: dayIndexOf(kstDate(now), ctx.period),
      },
    };
  }

  /** 남의 미확정·개인, 취소 자식, 다른 여정의 결제, 형식이 틀린 ID는 모두 404(4-2) */
  async detail(
    tripId: string,
    viewerMembershipId: string,
    expenseId: string,
  ): Promise<ExpenseDetailResponse> {
    if (!isUuid(expenseId)) throw new NotFoundError();
    const { ctx } = await this.prepare(tripId, viewerMembershipId);
    return this.findDetail(tripId, expenseId, ctx);
  }

  /** ID만으로 찾지 않는다: tripId + 가시성 조건을 함께 건다(IDOR) */
  async findDetail(
    tripId: string,
    expenseId: string,
    ctx: ViewContext,
    db: Db = this.prisma,
  ): Promise<ExpenseDetailResponse> {
    const record = await db.expense.findFirst({
      where: {
        AND: [
          { id: expenseId, tripId },
          visibleExpenseWhere(ctx.viewerMembershipId),
        ],
      },
      select: EXPENSE_DETAIL_SELECT,
    });
    if (!record) throw new NotFoundError();
    return toExpenseDetail(record, ctx);
  }

  /** 주어진 결제들을 목록 행으로(가시성 필터 적용, 시각 오름차순) */
  async rowsByIds(
    tripId: string,
    viewerMembershipId: string,
    expenseIds: readonly string[],
  ): Promise<ExpenseRow[]> {
    if (expenseIds.length === 0) return [];
    const { ctx } = await this.loadContext(tripId, viewerMembershipId);
    const records = await this.prisma.expense.findMany({
      where: {
        AND: [
          { tripId, id: { in: [...expenseIds] } },
          visibleExpenseWhere(viewerMembershipId),
        ],
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: EXPENSE_ROW_SELECT,
    });
    return records.map((r) => toExpenseRow(r, ctx));
  }

  /**
   * 정산 멤버별 결제 내역(FR-703, S2C용). 그 멤버가 결제한 공동 결제는 전원에게, 개인 결제 목록은 본인에게만.
   * 남의 개인 결제는 건수만(personalCount) — 가맹점·금액은 넘기지 않는다(충돌 C-02).
   */
  async paymentsByPayer(
    tripId: string,
    viewerMembershipId: string,
    payerMembershipId: string,
  ): Promise<{
    sharedPayments: ExpenseRow[];
    personalCount: number;
    personalPayments?: ExpenseRow[];
  }> {
    const { ctx } = await this.prepare(tripId, viewerMembershipId);
    const isMe = payerMembershipId === viewerMembershipId;
    const personalStatuses: ExpenseStatus[] =
      ctx.tripStatus === 'ENDED' ? ['PERSONAL', 'PENDING'] : ['PERSONAL'];
    const [records, personalCount] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          AND: [
            { tripId, payerMembershipId },
            visibleExpenseWhere(viewerMembershipId),
            isMe
              ? { status: { in: ['SHARED', ...personalStatuses] } }
              : { status: 'SHARED' },
          ],
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: EXPENSE_ROW_SELECT,
      }),
      this.prisma.expense.count({
        where: {
          tripId,
          payerMembershipId,
          refundOfExpenseId: null,
          status: { in: personalStatuses },
        },
      }),
    ]);
    const rows = records.map((r) => toExpenseRow(r, ctx));
    return {
      sharedPayments: rows.filter((r) => r.status === 'SHARED'),
      personalCount,
      ...(isMe && {
        personalPayments: rows.filter((r) => r.status === 'PERSONAL'),
      }),
    };
  }
}
