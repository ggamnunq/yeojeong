import type {
  ExpenseDetailResponse,
  ExpenseFxSnapshot,
  ExpenseRefundLine,
  ExpenseRow,
  MemberRole,
  MemberSummary,
  TripStatus,
} from '@yeojeong/shared';
import { Prisma } from '../generated/prisma/client.js';
import {
  computePermissions,
  effectiveStatus,
  splitFromShares,
} from './expense-rules.js';
import {
  dayIndexOf,
  kstDate,
  periodSideOf,
  toKstIso,
  type TripPeriod,
} from './kst.js';

// DB 행 → 응답(ExpenseRow·ExpenseDetailResponse). 가시성 필터를 통과한 행만 넘긴다.

export const MEMBER_SELECT = {
  id: true,
  role: true,
  joinOrder: true,
  leftAt: true,
  user: { select: { nickname: true, profileImageUrl: true } },
} satisfies Prisma.MembershipSelect;

export type MemberRow = Prisma.MembershipGetPayload<{
  select: typeof MEMBER_SELECT;
}>;

export const EXPENSE_ROW_SELECT = {
  id: true,
  tripId: true,
  transactionId: true,
  payerMembershipId: true,
  status: true,
  origin: true,
  occurredAt: true,
  merchantName: true,
  originalAmount: true,
  originalCurrency: true,
  krwAmount: true,
  netKrwAmount: true,
  refundOfExpenseId: true,
  duplicateGroupId: true,
  duplicateDismissedAt: true,
  changedAfterShared: true,
  firstSharedAt: true,
  confirmedAt: true,
  version: true,
  shares: {
    select: { membershipId: true, amountKrw: true, isRemainderHolder: true },
  },
  refunds: {
    select: {
      id: true,
      occurredAt: true,
      krwAmount: true,
      originalAmount: true,
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ExpenseSelect;

export type ExpenseRowRecord = Prisma.ExpenseGetPayload<{
  select: typeof EXPENSE_ROW_SELECT;
}>;

export const EXPENSE_DETAIL_SELECT = {
  ...EXPENSE_ROW_SELECT,
  fxPolicyApplied: true,
  fxRate: true,
  fxRateUnit: true,
  fxRateSource: true,
  fxRateAt: true,
  transaction: {
    select: { paymentMethod: { select: { shortLabel: true, last4: true } } },
  },
} satisfies Prisma.ExpenseSelect;

export type ExpenseDetailRecord = Prisma.ExpenseGetPayload<{
  select: typeof EXPENSE_DETAIL_SELECT;
}>;

/** 응답 조립에 필요한 여정·보는 사람 정보 */
export interface ViewContext {
  tripStatus: TripStatus;
  period: TripPeriod;
  viewerMembershipId: string;
  /** 그룹의 모든 멤버(나간 멤버 포함) */
  members: ReadonlyMap<string, MemberRow>;
}

/** 탈퇴(userId NULL)한 멤버의 표시 이름(용어집 "탈퇴한 멤버") */
export const WITHDRAWN_NICKNAME = '탈퇴한 멤버';

export function toMemberSummary(
  member: MemberRow,
  viewerMembershipId: string,
): MemberSummary {
  return {
    membershipId: member.id,
    nickname: member.user?.nickname ?? WITHDRAWN_NICKNAME,
    profileImageUrl: member.user?.profileImageUrl ?? null,
    role: member.role as MemberRole,
    joinOrder: member.joinOrder,
    isMe: member.id === viewerMembershipId,
    isLeft: member.leftAt !== null,
  };
}

/** 스택·토글 정렬: 나 먼저 → 가입 순(화면명세 0-8, 충돌 C-05) */
export function meFirstByJoinOrder<
  T extends { isMe: boolean; joinOrder: number },
>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => Number(b.isMe) - Number(a.isMe) || a.joinOrder - b.joinOrder,
  );
}

function memberOf(ctx: ViewContext, membershipId: string): MemberRow {
  const member = ctx.members.get(membershipId);
  if (!member) {
    throw new Error(`결제의 멤버가 그룹에 없습니다: ${membershipId}`);
  }
  return member;
}

const fractionDigitsCache = new Map<string, number>();

/** ISO 4217 소수 자리(JPY·KRW 0, USD 2). 모르는 통화는 2 */
export function currencyFractionDigits(currency: string): number {
  let digits = fractionDigitsCache.get(currency);
  if (digits === undefined) {
    try {
      digits =
        new Intl.NumberFormat('en', {
          style: 'currency',
          currency,
        }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      digits = 2;
    }
    fractionDigitsCache.set(currency, digits);
  }
  return digits;
}

/** 원통화 금액을 문자열 decimal로("13200", "12.50"). 통화 소수 자리보다 정밀하면 그대로 둔다 */
export function formatOriginalAmount(
  amount: Prisma.Decimal,
  currency: string,
): string {
  const digits = currencyFractionDigits(currency);
  return amount.decimalPlaces() > digits
    ? amount.toFixed()
    : amount.toFixed(digits);
}

function netOriginal(record: ExpenseRowRecord): Prisma.Decimal {
  const sum = record.refunds.reduce(
    (acc, r) => acc.plus(r.originalAmount),
    new Prisma.Decimal(record.originalAmount),
  );
  return sum.isNegative() ? new Prisma.Decimal(0) : sum;
}

export function toExpenseRow(
  record: ExpenseRowRecord,
  ctx: ViewContext,
): ExpenseRow {
  const payer = memberOf(ctx, record.payerMembershipId);
  const isPayer = record.payerMembershipId === ctx.viewerMembershipId;
  const status = effectiveStatus(record.status, ctx.tripStatus);
  const localDate = kstDate(record.occurredAt);
  const refunds: ExpenseRefundLine[] = record.refunds.map((r) => ({
    id: r.id,
    occurredAt: toKstIso(r.occurredAt),
    krwAmount: r.krwAmount,
    originalAmount: formatOriginalAmount(
      r.originalAmount,
      record.originalCurrency,
    ),
  }));
  const participants =
    status === 'SHARED'
      ? meFirstByJoinOrder(
          record.shares.map((s) =>
            toMemberSummary(
              memberOf(ctx, s.membershipId),
              ctx.viewerMembershipId,
            ),
          ),
        )
      : null;

  return {
    id: record.id,
    occurredAt: toKstIso(record.occurredAt),
    localDate,
    dayIndex: dayIndexOf(localDate, ctx.period),
    periodSide: periodSideOf(localDate, ctx.period),
    merchantName: record.merchantName,
    payer: toMemberSummary(payer, ctx.viewerMembershipId),
    status,
    krwAmount: record.netKrwAmount ?? record.krwAmount,
    grossKrwAmount: record.krwAmount,
    originalAmount: formatOriginalAmount(
      record.originalAmount,
      record.originalCurrency,
    ),
    netOriginalAmount: formatOriginalAmount(
      netOriginal(record),
      record.originalCurrency,
    ),
    originalCurrency: record.originalCurrency,
    participants,
    flags: {
      // "변경됨"은 공동 + changedAfterShared, 결제자가 아닌 사람에게만(FR-510)
      changed: status === 'SHARED' && record.changedAfterShared && !isPayer,
      duplicateSuspected: isDuplicateActive(record, status),
      hasRefund: refunds.length > 0,
    },
    refunds,
    origin: record.origin,
    version: record.version,
  };
}

function isDuplicateActive(
  record: Pick<ExpenseRowRecord, 'duplicateGroupId' | 'duplicateDismissedAt'>,
  status: string,
): boolean {
  return (
    status === 'SHARED' &&
    record.duplicateGroupId !== null &&
    record.duplicateDismissedAt === null
  );
}

function toFx(record: ExpenseDetailRecord): ExpenseFxSnapshot | null {
  if (!record.fxPolicyApplied || record.fxRate === null) return null;
  return {
    rate: record.fxRate.toFixed(),
    displayUnit: record.fxRateUnit ?? 1,
    source: record.fxRateSource ?? '',
    rateAt: toKstIso(record.fxRateAt ?? record.occurredAt),
    policy: record.fxPolicyApplied,
  };
}

export function toExpenseDetail(
  record: ExpenseDetailRecord,
  ctx: ViewContext,
): ExpenseDetailResponse {
  const row = toExpenseRow(record, ctx);
  const payer = memberOf(ctx, record.payerMembershipId);
  const isPayer = row.payer.isMe;
  const permissions = computePermissions({
    tripStatus: ctx.tripStatus,
    isPayer,
    payerLeft: payer.leftAt !== null,
  });
  const shares = row.status === 'SHARED' ? record.shares : [];
  const split = splitFromShares(row.krwAmount, shares);
  const method = record.transaction?.paymentMethod;
  const shareIds = shares.map((s) => s.membershipId);

  let participantCandidates: MemberSummary[] | null = null;
  let defaultParticipantMembershipIds: string[] | null = null;
  if (permissions.canEdit) {
    participantCandidates = meFirstByJoinOrder(
      [...ctx.members.values()]
        .filter((m) => m.leftAt === null || shareIds.includes(m.id))
        .map((m) => toMemberSummary(m, ctx.viewerMembershipId)),
    );
    defaultParticipantMembershipIds =
      row.status === 'SHARED'
        ? shareIds
        : participantCandidates
            .filter((m) => !m.isLeft)
            .map((m) => m.membershipId);
  }

  return {
    ...row,
    // 결제수단 표기는 결제자에게만(4-2)
    paymentMethodLabel:
      isPayer && method ? `${method.shortLabel} ${method.last4}` : null,
    fx: toFx(record),
    shares: meFirstByJoinOrder(
      shares.map((s) => ({
        membershipId: s.membershipId,
        amountKrw: s.amountKrw,
        isRemainderHolder: s.isRemainderHolder,
        isMe: s.membershipId === ctx.viewerMembershipId,
        joinOrder: memberOf(ctx, s.membershipId).joinOrder,
      })),
    ).map(({ membershipId, amountKrw, isRemainderHolder }) => ({
      membershipId,
      amountKrw,
      isRemainderHolder,
    })),
    perPersonKrw: split.perPersonKrw,
    remainderKrw: split.remainderKrw,
    remainderHolderMembershipId: split.remainderHolderMembershipId,
    permissions,
    duplicate:
      row.flags.duplicateSuspected && record.duplicateGroupId
        ? {
            groupId: record.duplicateGroupId,
            canDismiss: isPayer && permissions.canEdit,
          }
        : null,
    participantCandidates,
    defaultParticipantMembershipIds,
  };
}
