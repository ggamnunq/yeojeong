import type { MemberRole } from '@yeojeong/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SettlementExpenseInput } from './compute.js';

// 현황·정산이 읽는 여정 장부. 가시성(I-8): SHARED는 누구에게나, PENDING·PERSONAL은 결제자 본인 것만 금액을 읽는다.
// 다른 멤버의 개인 결제는 종료 후 건수만 쓴다.

export type Db = PrismaService | Prisma.TransactionClient;

export interface LedgerMember {
  id: string;
  /** 탈퇴하면 null → "탈퇴한 멤버" */
  userId: string | null;
  nickname: string | null;
  profileImageUrl: string | null;
  role: MemberRole;
  joinOrder: number;
  leftAt: Date | null;
}

export interface LedgerSharedExpense extends SettlementExpenseInput {
  id: string;
}

/** 그룹의 모든 멤버십(나간 멤버 포함), 가입 순 */
export async function loadMembers(
  db: Db,
  groupId: string,
): Promise<LedgerMember[]> {
  const rows = await db.membership.findMany({
    where: { groupId },
    orderBy: { joinOrder: 'asc' },
    select: {
      id: true,
      userId: true,
      role: true,
      joinOrder: true,
      leftAt: true,
      user: { select: { nickname: true, profileImageUrl: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    nickname: row.user?.nickname ?? null,
    profileImageUrl: row.user?.profileImageUrl ?? null,
    role: row.role,
    joinOrder: row.joinOrder,
    leftAt: row.leftAt,
  }));
}

/** SHARED 부모 결제(환불 묶음 = 1건)와 부담 몫 */
export async function loadSharedExpenses(
  db: Db,
  tripId: string,
): Promise<LedgerSharedExpense[]> {
  const rows = await db.expense.findMany({
    where: { tripId, status: 'SHARED', refundOfExpenseId: null },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      payerMembershipId: true,
      netKrwAmount: true,
      krwAmount: true,
      shares: { select: { membershipId: true, amountKrw: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    payerMembershipId: row.payerMembershipId,
    netKrw: row.netKrwAmount ?? Math.max(0, row.krwAmount),
    shares: row.shares,
  }));
}

/** 본인 개인 결제 순액 합(미확정 제외). 현황 "내 지출"용 */
export async function sumMyPersonal(
  db: Db,
  tripId: string,
  membershipId: string,
): Promise<number> {
  const result = await db.expense.aggregate({
    where: {
      tripId,
      payerMembershipId: membershipId,
      status: 'PERSONAL',
      refundOfExpenseId: null,
    },
    _sum: { netKrwAmount: true },
  });
  return result._sum.netKrwAmount ?? 0;
}

/**
 * 멤버별 개인 결제 건수(정산 스냅샷의 personalCount). 종료 때 미확정은 개인이 되므로(FR-306) PENDING도 센다.
 * 금액은 읽지 않는다.
 */
export async function countPersonalByMember(
  db: Db,
  tripId: string,
): Promise<Map<string, number>> {
  const rows = await db.expense.groupBy({
    by: ['payerMembershipId'],
    where: {
      tripId,
      status: { in: ['PERSONAL', 'PENDING'] },
      refundOfExpenseId: null,
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.payerMembershipId, r._count._all]));
}
