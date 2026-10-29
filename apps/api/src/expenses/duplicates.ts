import { randomUUID } from 'node:crypto';
import {
  DUPLICATE_WINDOW_SECONDS,
  MANUAL_DUPLICATE_WINDOW_SECONDS,
} from '@yeojeong/shared';
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
  /** 직접 입력한 결제(origin MANUAL)인지 */
  manual?: boolean;
  /** 순액(원). 직접 입력 판정 기준 */
  netKrwAmount?: number;
  merchantKey: string;
  originalCurrency: string;
  /** 비교용 정규화 문자열(Decimal.toFixed(4)) */
  originalAmount: string;
  occurredAt: Date;
}

/**
 * 중복 의심 쌍(FR-407).
 * - 둘 중 하나라도 직접 입력(origin MANUAL)이면(Q-42): 같은 원화 순액 + 시각 차이 ±30분, 결제자와 상관없이.
 *   두 멤버가 같은 결제를 각자 기록하는 실수를 잡는다(내용·시각이 사람 입력이라 가맹점·원통화는 보지 않는다).
 * - 가져온 결제끼리(기존): 결제자가 다르고, 가맹점 키·원통화·원통화 금액이 같고, 시각 차이 ≤ 120초.
 */
export function isDuplicatePair(
  a: DuplicateCandidate,
  b: DuplicateCandidate,
): boolean {
  if (a.id === b.id) return false;
  if (a.manual || b.manual) {
    return (
      a.netKrwAmount !== undefined &&
      a.netKrwAmount === b.netKrwAmount &&
      Math.abs(a.occurredAt.getTime() - b.occurredAt.getTime()) <=
        MANUAL_DUPLICATE_WINDOW_SECONDS * 1000
    );
  }
  return (
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
  origin: true,
  krwAmount: true,
  netKrwAmount: true,
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
    manual: row.origin === 'MANUAL',
    netKrwAmount: row.netKrwAmount ?? row.krwAmount,
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
  const manualWindow = MANUAL_DUPLICATE_WINDOW_SECONDS * 1000;
  const net = target.netKrwAmount ?? target.krwAmount;
  const near = (ms: number) => ({
    gte: new Date(target.occurredAt.getTime() - ms),
    lte: new Date(target.occurredAt.getTime() + ms),
  });
  // 직접 입력 판정(Q-42): 상대가 아무 결제든(이 결제가 직접 입력일 때) 또는 상대가 직접 입력일 때, 같은 순액 ±30분
  const manualRule: Prisma.ExpenseWhereInput = {
    ...(target.origin !== 'MANUAL' && { origin: 'MANUAL' }),
    netKrwAmount: net,
    occurredAt: near(manualWindow),
  };
  const providerRule: Prisma.ExpenseWhereInput = {
    origin: { not: 'MANUAL' },
    payerMembershipId: { not: target.payerMembershipId },
    originalCurrency: target.originalCurrency,
    originalAmount: target.originalAmount,
    occurredAt: near(window),
  };
  const rows = await tx.expense.findMany({
    where: {
      tripId: target.tripId,
      status: 'SHARED',
      refundOfExpenseId: null,
      id: { not: target.id },
      OR:
        target.origin === 'MANUAL' ? [manualRule] : [providerRule, manualRule],
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
