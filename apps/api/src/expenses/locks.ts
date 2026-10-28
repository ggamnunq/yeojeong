import type { Prisma } from '../generated/prisma/client.js';

// 결제 변경 트랜잭션의 잠금(기능명세 8-3). 순서를 지켜 교착을 피한다:
//   Trip FOR SHARE → (여정 단위 advisory lock) → 내 Membership FOR SHARE → Expense FOR UPDATE → 그 밖의 행
// 여정 종료(S2A)는 Trip FOR UPDATE를 잡으므로, 종료가 먼저면 여기서 기다렸다가 ENDED를 보고 409를 낸다.

type Tx = Prisma.TransactionClient;

export async function lockTripForShare(
  tx: Tx,
  tripId: string,
): Promise<{ status: string } | null> {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM trips
    WHERE id = ${tripId}::uuid AND deleted_at IS NULL
    FOR SHARE`;
  return rows[0] ?? null;
}

/** 같은 여정의 분류·중복 해제·기간 외 추가를 한 줄로 세운다(중복 묶음을 여러 결제에 걸쳐 고치므로) */
export async function lockTripExpenses(tx: Tx, tripId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${`expenses:${tripId}`}))`;
}

/** 활성 멤버면 true. 나갔거나 없으면 false(→ 404) */
export async function lockActiveMembership(
  tx: Tx,
  membershipId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM memberships
    WHERE id = ${membershipId}::uuid AND left_at IS NULL
    FOR SHARE`;
  return rows.length > 0;
}

export async function lockExpense(
  tx: Tx,
  tripId: string,
  expenseId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM expenses
    WHERE id = ${expenseId}::uuid AND trip_id = ${tripId}::uuid
    FOR UPDATE`;
  return rows.length > 0;
}

/** 원본 거래 행 잠금(한 거래는 한 여정에서만 공동 — 4-1-2, 기간 외 추가 경합) */
export async function lockTransactions(
  tx: Tx,
  transactionIds: readonly string[],
): Promise<void> {
  if (transactionIds.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM transactions
    WHERE id = ANY(${[...transactionIds]}::uuid[])
    ORDER BY id
    FOR UPDATE`;
}
