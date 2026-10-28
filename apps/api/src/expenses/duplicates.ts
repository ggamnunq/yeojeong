import { randomUUID } from 'node:crypto';
import { DUPLICATE_WINDOW_SECONDS } from '@yeojeong/shared';
import type { Prisma } from '../generated/prisma/client.js';

// 멤버 간 중복 의심(기능명세 4-1-5, FR-407·511). 판정은 결제가 공동이 될 때 이 모듈이 한다.
// 인입(S2B-1)이 공동 결제의 순액을 바꿀 때도 flagDuplicates를 다시 부르면 된다.

type Tx = Prisma.TransactionClient;

/** Transaction.merchantKey와 같은 정규화: NFKC → 대문자 → 공백·기호 제거 */
export function merchantKeyOf(name: string): string {
  return name
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export interface DuplicateCandidate {
  id: string;
  payerMembershipId: string;
  merchantKey: string;
  originalCurrency: string;
  /** 비교용 정규화 문자열(Decimal.toFixed(4)) */
  originalAmount: string;
  occurredAt: Date;
}

/** 결제자가 다르고, 가맹점 키·원통화·원통화 금액이 같고, 시각 차이 ≤ 120초 */
export function isDuplicatePair(
  a: DuplicateCandidate,
  b: DuplicateCandidate,
): boolean {
  return (
    a.id !== b.id &&
    a.payerMembershipId !== b.payerMembershipId &&
    a.merchantKey === b.merchantKey &&
    a.originalCurrency === b.originalCurrency &&
    a.originalAmount === b.originalAmount &&
    Math.abs(a.occurredAt.getTime() - b.occurredAt.getTime()) <=
      DUPLICATE_WINDOW_SECONDS * 1000
  );
}

const DUP_SELECT = {
  id: true,
  payerMembershipId: true,
  merchantName: true,
  originalCurrency: true,
  originalAmount: true,
  occurredAt: true,
  duplicateGroupId: true,
  duplicateDismissedAt: true,
  transaction: { select: { merchantKey: true } },
} satisfies Prisma.ExpenseSelect;

type DupRow = Prisma.ExpenseGetPayload<{ select: typeof DUP_SELECT }>;

function toCandidate(row: DupRow): DuplicateCandidate {
  return {
    id: row.id,
    payerMembershipId: row.payerMembershipId,
    merchantKey:
      row.transaction?.merchantKey ?? merchantKeyOf(row.merchantName),
    originalCurrency: row.originalCurrency,
    originalAmount: row.originalAmount.toFixed(4),
    occurredAt: row.occurredAt,
  };
}

/**
 * 공동이 된 결제와 짝이 되는 다른 멤버의 공동 결제를 찾아 같은 duplicateGroupId로 묶는다.
 * 이미 표시 해제한 같은 묶음(같은 groupId + dismissedAt)은 다시 묶지 않는다(미결 Q-20 "같은 쌍은 다시 표시하지 않는다").
 * 새로 묶인 결제 ID를 돌려준다(이 결제 포함). 호출하는 쪽이 같은 트랜잭션에서 여정 잠금을 잡고 있어야 한다.
 */
export async function flagDuplicates(
  tx: Tx,
  expenseId: string,
): Promise<string[]> {
  const target = await tx.expense.findUnique({
    where: { id: expenseId },
    select: {
      ...DUP_SELECT,
      tripId: true,
      status: true,
      refundOfExpenseId: true,
    },
  });
  if (!target || target.status !== 'SHARED' || target.refundOfExpenseId) {
    return [];
  }
  const window = DUPLICATE_WINDOW_SECONDS * 1000;
  const rows = await tx.expense.findMany({
    where: {
      tripId: target.tripId,
      status: 'SHARED',
      refundOfExpenseId: null,
      id: { not: target.id },
      payerMembershipId: { not: target.payerMembershipId },
      originalCurrency: target.originalCurrency,
      originalAmount: target.originalAmount,
      occurredAt: {
        gte: new Date(target.occurredAt.getTime() - window),
        lte: new Date(target.occurredAt.getTime() + window),
      },
    },
    select: DUP_SELECT,
  });
  const me = toCandidate(target);
  const dismissedPair = (row: DupRow) =>
    row.duplicateGroupId !== null &&
    row.duplicateGroupId === target.duplicateGroupId &&
    (row.duplicateDismissedAt !== null || target.duplicateDismissedAt !== null);
  const matches = rows.filter(
    (row) => isDuplicatePair(me, toCandidate(row)) && !dismissedPair(row),
  );
  if (matches.length === 0) return [];

  // 이미 살아 있는 묶음이 있으면 거기에 합친다
  const activeGroups = [
    ...new Set(
      [target, ...matches]
        .filter((r) => r.duplicateGroupId && !r.duplicateDismissedAt)
        .map((r) => r.duplicateGroupId as string),
    ),
  ];
  const groupId = activeGroups[0] ?? randomUUID();
  if (activeGroups.length > 1) {
    await tx.expense.updateMany({
      where: { duplicateGroupId: { in: activeGroups.slice(1) } },
      data: { duplicateGroupId: groupId },
    });
  }
  const newlyFlagged = [target, ...matches]
    .filter((r) => r.duplicateGroupId !== groupId || r.duplicateDismissedAt)
    .map((r) => r.id);
  await tx.expense.updateMany({
    where: { id: { in: [target.id, ...matches.map((m) => m.id)] } },
    data: {
      duplicateGroupId: groupId,
      duplicateDismissedAt: null,
      duplicateDismissedByMembershipId: null,
    },
  });
  // 상대 결제는 표시가 바뀌었으니 version을 올린다(이 결제는 호출하는 쪽이 올린다)
  await tx.expense.updateMany({
    where: { id: { in: newlyFlagged.filter((id) => id !== target.id) } },
    data: { version: { increment: 1 } },
  });
  if (newlyFlagged.length > 0) {
    await tx.expenseChangeLog.createMany({
      data: newlyFlagged.map((id) => ({
        expenseId: id,
        tripId: target.tripId,
        actorMembershipId: null,
        action: 'DUPLICATE_FLAGGED' as const,
        after: { duplicateGroupId: groupId },
      })),
    });
  }
  return newlyFlagged;
}

/**
 * 공동에서 빠지는 결제를 묶음에서 뺀다(4-1-5 해소 ①). 남은 공동 결제가 1건이면 그 표시도 지운다.
 * 표시 해제된 묶음은 기록으로 남겨 둔다(같은 쌍을 다시 묶지 않게).
 */
export async function leaveDuplicateGroup(
  tx: Tx,
  expense: {
    id: string;
    duplicateGroupId: string | null;
    duplicateDismissedAt: Date | null;
  },
): Promise<void> {
  const groupId = expense.duplicateGroupId;
  if (!groupId || expense.duplicateDismissedAt) return;
  await tx.expense.update({
    where: { id: expense.id },
    data: { duplicateGroupId: null },
  });
  const rest = await tx.expense.findMany({
    where: { duplicateGroupId: groupId, status: 'SHARED' },
    select: { id: true },
  });
  if (rest.length < 2) {
    await tx.expense.updateMany({
      where: { duplicateGroupId: groupId },
      data: { duplicateGroupId: null, version: { increment: 1 } },
    });
  }
}
