import type { Prisma } from '../generated/prisma/client.js';
import { flagDuplicates } from '../expenses/duplicates.js';

/**
 * 인입이 공동 결제의 순액을 바꿨을 때(환불 첨부) 중복 의심을 다시 판정하는 자리(기능명세 4-1-5).
 * 판정 자체는 S2B-2(expenses)의 flagDuplicates가 맡는다. 테스트에서 바꿔 끼울 수 있게 DI 토큰으로 둔다.
 */
export abstract class DuplicateFlagger {
  /** 새로 묶인 결제 ID(이 결제 포함). 호출 측이 같은 트랜잭션에서 여정 잠금을 잡고 있어야 한다 */
  abstract flagDuplicates(
    tx: Prisma.TransactionClient,
    expenseId: string,
  ): Promise<string[]>;
}

/** 기본 구현: expenses/duplicates.ts의 flagDuplicates */
export const expensesDuplicateFlagger: DuplicateFlagger = { flagDuplicates };
