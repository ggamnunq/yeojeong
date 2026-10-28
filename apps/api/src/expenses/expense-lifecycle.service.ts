import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { errorCodeOf } from './access-log.js';
import { changeSnapshot } from './expense-rules.js';
import { lockTripForShare } from './locks.js';

type Tx = Prisma.TransactionClient;

/**
 * 여정의 미확정(PENDING)을 모두 개인(PERSONAL)으로 바꾼다(3-2 "여정 종료 시 자동 처리", FR-306 2단계).
 * 취소 자식도 부모와 같이 바뀐다(I-5). 바뀐 부모마다 AUTO_PERSONAL_ON_END 이력을 남기고, 바뀐 부모 수를 돌려준다.
 * 멱등: 이미 바뀐 행은 다시 건드리지 않는다(UPDATE … WHERE status = 'PENDING' RETURNING).
 *
 * S2A가 종료 트랜잭션 안에서 직접 부를 수도 있다(Trip FOR UPDATE를 잡은 tx를 넘긴다).
 */
export async function personalizePendingExpenses(
  tx: Tx,
  tripId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await tx.$queryRaw<
    { id: string; is_parent: boolean; net_krw_amount: number | null }[]
  >`
    UPDATE expenses
    SET status = 'PERSONAL', auto_personalized_at = ${now},
        version = version + 1, updated_at = ${now}
    WHERE trip_id = ${tripId}::uuid AND status = 'PENDING'
    RETURNING id::text AS id, (refund_of_expense_id IS NULL) AS is_parent, net_krw_amount`;
  const parents = rows.filter((r) => r.is_parent);
  if (parents.length > 0) {
    await tx.expenseChangeLog.createMany({
      data: parents.map((r) => ({
        expenseId: r.id,
        tripId,
        actorMembershipId: null,
        action: 'AUTO_PERSONAL_ON_END' as const,
        before: changeSnapshot('PENDING', [], r.net_krw_amount ?? 0),
        after: changeSnapshot('PERSONAL', [], r.net_krw_amount ?? 0),
      })),
    });
  }
  return parents.length;
}

@Injectable()
export class ExpenseLifecycleService {
  private readonly logger = new Logger(ExpenseLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 종료된 여정이면 남은 미확정을 개인으로 바꾼다. 종료 전이거나 없는 여정이면 0 */
  async personalizePendingOnTripEnd(tripId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const trip = await lockTripForShare(tx, tripId);
      if (trip?.status !== 'ENDED') return 0;
      return personalizePendingExpenses(tx, tripId);
    });
  }

  /**
   * 조회 시점 재확인(리스너가 실패했을 때의 지연 전환). 남은 미확정이 있을 때만 전환하고,
   * 실패해도 조회는 계속한다 — 응답은 어차피 종료 여정의 PENDING을 PERSONAL로 내보낸다(effectiveStatus).
   */
  async ensurePersonalizedAfterEnd(tripId: string): Promise<void> {
    try {
      const pending = await this.prisma.expense.count({
        where: { tripId, status: 'PENDING' },
      });
      if (pending === 0) return;
      const changed = await this.personalizePendingOnTripEnd(tripId);
      if (changed > 0) {
        this.logger.warn(
          { tripId, changed },
          '종료된 여정의 미확정을 조회 시점에 개인으로 바꿨습니다',
        );
      }
    } catch (error) {
      this.logger.error(
        { tripId, errorCode: errorCodeOf(error) },
        '종료된 여정의 미확정을 개인으로 바꾸지 못했습니다',
      );
    }
  }
}
