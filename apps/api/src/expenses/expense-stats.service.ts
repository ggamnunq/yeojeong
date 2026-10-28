import { Injectable } from '@nestjs/common';
import type { ExpenseStatus } from '@yeojeong/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

export interface PersonalCount {
  membershipId: string;
  personalCount: number;
}

/**
 * 정산(S2C)이 쓰는 집계. 남에게는 개인 결제를 건수만 보여 준다(FR-703, 충돌 C-02).
 * 결과에는 금액·가맹점을 담지 않는다.
 */
@Injectable()
export class ExpenseStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 결제자별 개인 결제 건수(취소 자식 제외). SettlementMember.personalCount의 출처.
   * 종료된 여정에 리스너 실패로 남은 미확정은 개인으로 센다(조회 시 개인으로 보이는 것과 같게).
   * 건수가 0인 멤버는 결과에 없다.
   */
  async personalCountsByPayer(
    tripId: string,
    db: Db = this.prisma,
  ): Promise<PersonalCount[]> {
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    const statuses: ExpenseStatus[] =
      trip?.status === 'ENDED' ? ['PERSONAL', 'PENDING'] : ['PERSONAL'];
    const groups = await db.expense.groupBy({
      by: ['payerMembershipId'],
      where: { tripId, refundOfExpenseId: null, status: { in: statuses } },
      _count: { _all: true },
    });
    return groups
      .map((g) => ({
        membershipId: g.payerMembershipId,
        personalCount: g._count._all,
      }))
      .sort((a, b) => a.membershipId.localeCompare(b.membershipId));
  }
}
