import { Injectable, Logger } from '@nestjs/common';
import type { TripSummary } from '@yeojeong/shared';
import type { MembershipContext } from '../common/auth/index.js';
import { NotFoundError } from '../common/errors/index.js';
import { toKstIso } from '../fx/kst.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { computeSettlement } from './compute.js';
import { loadMembers, loadSharedExpenses, sumMyPersonal } from './ledger.js';
import {
  budgetRatio,
  budgetState,
  overBudget,
  spendingSplit,
  toPayReceive,
} from './summary-math.js';
import { compareMeFirst, toMemberSummary } from './views.js';

/**
 * 현황(FR-601~604, WF-22). 요청마다 지금 장부로 계산하고 저장하지 않는다(FR-701 "진행 중 즉석 계산").
 * 다른 멤버의 개인·미확정 결제는 금액도 건수도 읽지 않는다(4-2).
 */
@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    tripId: string,
    me: MembershipContext,
  ): Promise<TripSummary> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: { id: true, groupId: true, budgetKrw: true },
    });
    if (!trip) throw new NotFoundError();

    const members = await loadMembers(this.prisma, trip.groupId);
    const sharedExpenses = await loadSharedExpenses(this.prisma, trip.id);
    const personalKrw = await sumMyPersonal(this.prisma, trip.id, me.id);

    const result = computeSettlement(
      {
        members: members.map((m) => ({
          membershipId: m.id,
          joinOrder: m.joinOrder,
          isLeft: m.leftAt !== null,
        })),
        sharedExpenses,
      },
      { assertBalanced: false },
    );
    const imbalance = result.members.reduce((sum, m) => sum + m.netKrw, 0);
    if (imbalance !== 0) {
      // 분담 저장(I-4)이 깨진 데이터. 화면은 그대로 보여 주고 로그로 알린다
      this.logger.error(
        { tripId, imbalance },
        '현황 검산 실패: 순잔액 합이 0이 아님',
      );
    }

    const mine = result.members.find((m) => m.membershipId === me.id);
    const netKrw = mine?.netKrw ?? 0;
    const sharedBurdenKrw = mine?.burdenKrw ?? 0;
    const byId = new Map(members.map((m) => [m.id, m]));
    const spent = result.totalSharedKrw;

    return {
      asOf: toKstIso(new Date()),
      me: { membershipId: me.id, netKrw, ...toPayReceive(netKrw) },
      sharedTotalKrw: spent,
      budgetKrw: trip.budgetKrw,
      budgetRatio: budgetRatio(spent, trip.budgetKrw),
      budgetState: budgetState(spent, trip.budgetKrw),
      overBudgetKrw: overBudget(spent, trip.budgetKrw),
      mySpending: {
        sharedBurdenKrw,
        personalKrw,
        ...spendingSplit(sharedBurdenKrw, personalKrw),
      },
      burdens: result.members
        .map((m) => ({
          member: toMemberSummary(byId.get(m.membershipId)!, me.id),
          burdenKrw: m.burdenKrw,
        }))
        .sort((a, b) => compareMeFirst(me.id)(a.member, b.member)),
    };
  }
}
