import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { normalizeMerchantKey } from '../payment-methods/masking.js';
import {
  NEAR_WINDOW_MS,
  isSuspectedDuplicate,
  type SuspectExpense,
} from './import-rules.js';

type Tx = Prisma.TransactionClient;

const SELECT = {
  id: true,
  status: true,
  payerMembershipId: true,
  merchantName: true,
  originalAmount: true,
  originalCurrency: true,
  occurredAt: true,
  refundOfExpenseId: true,
  duplicateGroupId: true,
  duplicateDismissedAt: true,
} as const;

/**
 * 멤버 간 중복 의심(기능명세 4-1-5, FR-407). 판정 시점은 결제가 SHARED가 될 때와 SHARED 순액이 바뀔 때다.
 * - 인입 중 환불이 공동 결제에 붙으면 이 모듈이 부른다.
 * - 공동 확정·개인→공동(S2B-2 expenses)도 같은 트랜잭션 안에서 evaluate(tx, expenseId)를 부르면 된다.
 * 해제(공동→개인, 표시 해제)는 S2B-2 몫이다.
 */
@Injectable()
export class DuplicateSuspicionService {
  /**
   * 이 결제와 중복 의심인 같은 여정의 공동 결제를 찾아 같은 duplicateGroupId로 묶는다.
   * 이미 묶인 쪽이 있으면 그 묶음 ID를 쓴다. 새로 묶인 결제마다 ExpenseChangeLog(DUPLICATE_FLAGGED, 시스템).
   * @returns 묶음 ID. 해당 없으면 null
   */
  async evaluate(tx: Tx, expenseId: string): Promise<string | null> {
    const target = await tx.expense.findUnique({
      where: { id: expenseId },
      select: { ...SELECT, tripId: true },
    });
    if (!target || target.status !== 'SHARED' || target.refundOfExpenseId) {
      return null;
    }
    const around = await tx.expense.findMany({
      where: {
        tripId: target.tripId,
        id: { not: target.id },
        status: 'SHARED',
        refundOfExpenseId: null,
        payerMembershipId: { not: target.payerMembershipId },
        originalCurrency: target.originalCurrency,
        originalAmount: target.originalAmount,
        occurredAt: {
          gte: new Date(target.occurredAt.getTime() - NEAR_WINDOW_MS),
          lte: new Date(target.occurredAt.getTime() + NEAR_WINDOW_MS),
        },
      },
      select: SELECT,
    });
    const suspect = (e: (typeof around)[number]): SuspectExpense => ({
      id: e.id,
      status: e.status,
      payerMembershipId: e.payerMembershipId,
      merchantKey: normalizeMerchantKey(e.merchantName),
      originalAmount: e.originalAmount.toFixed(4),
      originalCurrency: e.originalCurrency,
      occurredAt: e.occurredAt,
      refundOfExpenseId: e.refundOfExpenseId,
      duplicateDismissedAt: e.duplicateDismissedAt,
    });
    const matches = around.filter((e) =>
      isSuspectedDuplicate(suspect(target), suspect(e)),
    );
    if (matches.length === 0) return null;

    const all = [target, ...matches];
    const groupId =
      all.find((e) => e.duplicateGroupId)?.duplicateGroupId ?? randomUUID();
    const newlyFlagged = all.filter((e) => e.duplicateGroupId !== groupId);
    await tx.expense.updateMany({
      where: { id: { in: newlyFlagged.map((e) => e.id) } },
      data: { duplicateGroupId: groupId },
    });
    if (newlyFlagged.length > 0) {
      await tx.expenseChangeLog.createMany({
        data: newlyFlagged.map((e) => ({
          expenseId: e.id,
          tripId: target.tripId,
          actorMembershipId: null,
          action: 'DUPLICATE_FLAGGED' as const,
          before: { duplicateGroupId: e.duplicateGroupId },
          after: { duplicateGroupId: groupId },
        })),
      });
    }
    return groupId;
  }
}
