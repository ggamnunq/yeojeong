import type {
  ExpenseListItem,
  ExpenseOrigin,
  ExpenseStatus,
  MemberSummary,
} from '@yeojeong/shared';
import { dateOnly, daysBetween, kstDate, toKstIso } from '../fx/kst.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { LedgerMember } from './ledger.js';

/** 탈퇴(FR-109)로 userId가 없어진 멤버의 표시 이름 */
export const WITHDRAWN_MEMBER_NAME = '탈퇴한 멤버';

export function toMemberSummary(
  member: LedgerMember,
  meId: string,
): MemberSummary {
  return {
    membershipId: member.id,
    nickname: member.nickname ?? WITHDRAWN_MEMBER_NAME,
    profileImageUrl: member.userId ? member.profileImageUrl : null,
    role: member.role,
    joinOrder: member.joinOrder,
    isMe: member.id === meId,
    isLeft: member.leftAt !== null,
    isWithdrawn: member.userId === null && member.leaveReason === 'ACCOUNT_DELETED',
  };
}

/** 정렬: 나 먼저 → 가입 순(화면명세 0-8) */
export function compareMeFirst(
  meId: string,
): (
  a: { membershipId: string; joinOrder: number },
  b: { membershipId: string; joinOrder: number },
) => number {
  return (a, b) =>
    Number(b.membershipId === meId) - Number(a.membershipId === meId) ||
    a.joinOrder - b.joinOrder;
}

export interface DayPosition {
  localDate: string;
  /** (결제일 KST − 시작일) + 1. 기간 밖이면 null */
  dayIndex: number | null;
  periodSide: 'BEFORE' | 'AFTER' | null;
}

/** Day N(기능명세 4-9). startDate·endDate는 Prisma @db.Date 값 */
export function dayPosition(
  occurredAt: Date,
  startDate: Date,
  endDate: Date,
): DayPosition {
  const localDate = kstDate(occurredAt);
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  if (localDate < start) {
    return { localDate, dayIndex: null, periodSide: 'BEFORE' };
  }
  if (localDate > end) {
    return { localDate, dayIndex: null, periodSide: 'AFTER' };
  }
  return {
    localDate,
    dayIndex: daysBetween(start, localDate) + 1,
    periodSide: null,
  };
}

/** 정산 멤버별 내역 행에 필요한 컬럼 */
export const EXPENSE_ITEM_SELECT = {
  id: true,
  occurredAt: true,
  merchantName: true,
  payerMembershipId: true,
  status: true,
  krwAmount: true,
  netKrwAmount: true,
  originalAmount: true,
  originalCurrency: true,
  changedAfterShared: true,
  duplicateGroupId: true,
  duplicateDismissedAt: true,
  origin: true,
  version: true,
  shares: { select: { membershipId: true } },
  refunds: {
    select: { id: true, occurredAt: true, krwAmount: true },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.ExpenseSelect;

export type ExpenseItemRow = Prisma.ExpenseGetPayload<{
  select: typeof EXPENSE_ITEM_SELECT;
}>;

export interface ExpenseItemContext {
  meId: string;
  members: ReadonlyMap<string, LedgerMember>;
  startDate: Date;
  endDate: Date;
}

/**
 * 결제 행(ExpenseListItem, 부록 B). 정산 멤버별 내역(WF-26)에 쓴다.
 * 호출자가 가시성을 지킨다: 남의 PENDING·PERSONAL 행은 넘기지 않는다(I-8).
 */
export function toExpenseListItem(
  row: ExpenseItemRow,
  ctx: ExpenseItemContext,
): ExpenseListItem {
  const memberOf = (id: string) => {
    const member = ctx.members.get(id);
    if (!member) throw new Error(`여정 멤버가 아닌 멤버십: ${id}`);
    return toMemberSummary(member, ctx.meId);
  };
  const status = row.status as ExpenseStatus;
  const position = dayPosition(row.occurredAt, ctx.startDate, ctx.endDate);
  return {
    id: row.id,
    occurredAt: toKstIso(row.occurredAt),
    localDate: position.localDate,
    dayIndex: position.dayIndex,
    periodSide: position.periodSide,
    merchantName: row.merchantName,
    payer: memberOf(row.payerMembershipId),
    status,
    krwAmount: row.netKrwAmount ?? row.krwAmount,
    originalAmount: row.originalAmount.toString(),
    originalCurrency: row.originalCurrency,
    participants:
      status === 'SHARED'
        ? row.shares
            .map((s) => memberOf(s.membershipId))
            .sort(compareMeFirst(ctx.meId))
        : null,
    flags: {
      changed: row.changedAfterShared && row.payerMembershipId !== ctx.meId,
      duplicateSuspected:
        row.duplicateGroupId !== null && row.duplicateDismissedAt === null,
      hasRefund: row.refunds.length > 0,
    },
    refunds: row.refunds.map((r) => ({
      id: r.id,
      occurredAt: toKstIso(r.occurredAt),
      krwAmount: r.krwAmount,
    })),
    origin: row.origin as ExpenseOrigin,
    version: row.version,
  };
}
