import type { ConsentId } from '@yeojeong/shared';
import type { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/**
 * 사용자의 활성 결제수단이 0개가 되면 철회하는 연동 동의(기능명세 FR-804·4-10 v0.5.7, docs/legal/consents.md 5절).
 * THIRD_PARTY는 철회하지 않는다(미결 Q-39 기본안: 이미 공개된 공동 결제의 근거).
 */
export const FIN_CONSENTS_WITHDRAWN_ON_UNLINK = [
  'FIN_LINK',
  'FIN_PRIVACY',
] as const satisfies readonly ConsentId[];

/** 파기 건수(접근 기록 details). 금액·가맹점은 남기지 않는다 */
export interface PurgedFinancialData {
  /** 지운 PENDING·PERSONAL 결제(취소 자식 포함) */
  expenses: number;
  /** 지운 거래 원본 */
  transactions: number;
  /** 지운 결제수단 행(모두 REMOVED였던 것) */
  paymentMethods: number;
  /** 거래 원본을 지워 transactionId가 NULL이 된 공동 결제 */
  detachedShared: number;
}

/** 공동 결제에 원본 거래 해시가 없으면 채운다(공동 확정 때 남기지만, 그 전에 확정된 행을 위해 지우기 직전에 한 번 더) */
async function fillSourceTxHashes(
  tx: Tx,
  where: Prisma.ExpenseWhereInput,
  hash: (provider: string, externalRef: string) => string | null,
): Promise<void> {
  const rows = await tx.expense.findMany({
    where: {
      ...where,
      sourceTxHash: null,
      transaction: { is: { source: 'PROVIDER' } },
    },
    select: {
      id: true,
      transaction: {
        select: {
          externalRef: true,
          paymentMethod: {
            select: { connection: { select: { provider: true } } },
          },
        },
      },
    },
  });
  for (const row of rows) {
    if (!row.transaction?.paymentMethod || !row.transaction.externalRef) {
      continue;
    }
    const value = hash(
      row.transaction.paymentMethod.connection.provider,
      row.transaction.externalRef,
    );
    if (value) {
      await tx.expense.update({
        where: { id: row.id },
        data: { sourceTxHash: value },
      });
    }
  }
}

/**
 * 결제수단 전부 해제(활성 결제수단 0개) 때의 파기. purgeImported 선택과 무관하다(수집·이용 동의서 2절 "지체 없이 파기").
 * 대상은 결제수단에서 가져온 데이터뿐이다. 직접 입력한 결제(Transaction.source MANUAL, Expense.origin MANUAL)는
 * 연동 동의와 무관한 사용자 기록이라 남긴다(S7).
 * - 내 PENDING·PERSONAL 결제를 종료된 여정 것까지 지운다(I-6 예외: 파기가 우선). 취소 자식은 부모와 함께 지워진다.
 * - 거래 원본·결제수단 행을 지운다. SHARED 결제는 장부에 남고 transactionId만 NULL이 된다(FK SET NULL).
 *   지우기 전에 SHARED의 sourceTxHash를 채워, 다시 연결한 뒤 같은 거래가 새 미확정으로 들어오지 않게 한다.
 * 정산 스냅샷(SettlementMember.personalCount 등)은 종료 때 저장한 값이라 바뀌지 않는다. 진행 중 여정의 현황은 남은 결제로 다시 계산된다.
 */
export async function purgeAllFinancialData(
  tx: Tx,
  userId: string,
  hash: (provider: string, externalRef: string) => string | null,
): Promise<PurgedFinancialData> {
  const mine: Prisma.ExpenseWhereInput = {
    payer: { userId },
    origin: { not: 'MANUAL' },
  };
  await fillSourceTxHashes(tx, { ...mine, status: 'SHARED' }, hash);

  const unshared: Prisma.ExpenseWhereInput = {
    ...mine,
    status: { in: ['PENDING', 'PERSONAL'] },
  };
  const expenses = await tx.expense.count({ where: unshared });
  // 부모를 지우면 취소 자식은 FK CASCADE로 함께 지워진다. 부모가 다른 상태인 자식은 없지만(I-5) 남는 것이 없게 한 번 더
  await tx.expense.deleteMany({
    where: { ...unshared, refundOfExpenseId: null },
  });
  await tx.expense.deleteMany({ where: unshared });

  const detachedShared = await tx.expense.count({
    where: {
      status: 'SHARED',
      transaction: { is: { userId, source: 'PROVIDER' } },
    },
  });
  const transactions = await tx.transaction.deleteMany({
    where: { userId, source: 'PROVIDER' },
  });
  const paymentMethods = await tx.paymentMethod.deleteMany({
    where: { userId, status: 'REMOVED' },
  });
  return {
    expenses,
    transactions: transactions.count,
    paymentMethods: paymentMethods.count,
    detachedShared,
  };
}

/**
 * 일부 해제에서 연결의 마지막 결제수단을 "불러온 결제도 지우기"(purgeImported)로 해제할 때: 그 연결의 거래로 만든
 * 내 PENDING·PERSONAL 결제와 그 연결의 거래 원본·결제수단 행을 지운다. SHARED는 transactionId만 NULL이 된다.
 */
export async function purgeConnectionData(
  tx: Tx,
  connectionId: string,
  hash: (provider: string, externalRef: string) => string | null,
): Promise<void> {
  const methodIds = (
    await tx.paymentMethod.findMany({
      where: { connectionId },
      select: { id: true },
    })
  ).map((m) => m.id);
  const transactionIds = (
    await tx.transaction.findMany({
      where: { paymentMethodId: { in: methodIds } },
      select: { id: true },
    })
  ).map((t) => t.id);
  await fillSourceTxHashes(
    tx,
    { status: 'SHARED', transactionId: { in: transactionIds } },
    hash,
  );
  // 개인·미확정은 결제자만 보던 것이라 지운다(취소 자식은 부모와 함께 지워진다)
  await tx.expense.deleteMany({
    where: {
      transactionId: { in: transactionIds },
      status: { in: ['PENDING', 'PERSONAL'] },
      refundOfExpenseId: null,
    },
  });
  await tx.expense.deleteMany({
    where: {
      transactionId: { in: transactionIds },
      status: { in: ['PENDING', 'PERSONAL'] },
    },
  });
  // SHARED Expense는 transactionId가 ON DELETE SET NULL로 비워지고 복사해 둔 값으로 남는다
  await tx.transaction.deleteMany({ where: { id: { in: transactionIds } } });
  await tx.paymentMethod.deleteMany({ where: { id: { in: methodIds } } });
}
