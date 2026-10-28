import { Injectable } from '@nestjs/common';
import type {
  SettlementMemberExpenses,
  SettlementMemberView,
  SettlementView,
} from '@yeojeong/shared';
import type { MembershipContext } from '../common/auth/index.js';
import { NotFoundError } from '../common/errors/index.js';
import { toKstIso } from '../fx/kst.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { settlementDirection } from './compute.js';
import { loadMembers, type LedgerMember } from './ledger.js';
import { SettlementSnapshotService } from './settlement-snapshot.service.js';
import {
  compareMeFirst,
  EXPENSE_ITEM_SELECT,
  toExpenseListItem,
  toMemberSummary,
} from './views.js';

interface MemberRowInput {
  membershipId: string;
  paidKrw: number;
  paidCount: number;
  burdenKrw: number;
  netKrw: number;
  isLeft: boolean;
}

/** 정산 조회(FR-702·703·704·705). 종료된 여정만(컨트롤러가 409로 막는다) */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: SettlementSnapshotService,
  ) {}

  /** 정산 요약. 스냅샷이 없으면(리스너 실패 등) 같은 생성 함수로 지연 생성한다 */
  async getView(
    tripId: string,
    me: MembershipContext,
  ): Promise<SettlementView> {
    const { settlementId } = await this.snapshots.ensureSettlement(tripId);
    const settlement = await this.prisma.settlement.findUniqueOrThrow({
      where: { id: settlementId },
      include: {
        trip: { select: { groupId: true, endedAt: true } },
        members: true,
        transfers: { orderBy: { seq: 'asc' } },
      },
    });
    const members = await this.memberMap(settlement.trip.groupId);
    const summaryOf = (id: string) => {
      const member = members.get(id);
      if (!member) throw new Error(`정산 멤버가 그룹에 없습니다: ${id}`);
      return toMemberSummary(member, me.id);
    };

    return {
      settlementId: settlement.id,
      settledAt: toKstIso(settlement.trip.endedAt ?? settlement.createdAt),
      fxPolicy: settlement.fxPolicy,
      algorithmVersion: settlement.algorithmVersion,
      totalSharedKrw: settlement.totalSharedKrw,
      sharedCount: settlement.sharedCount,
      memberCount: settlement.memberCount,
      perCapitaKrw: settlement.perCapitaKrw,
      members: settlement.members
        .map((row) => this.memberView(row, summaryOf))
        .sort((a, b) => compareMeFirst(me.id)(a.member, b.member)),
      transfers: settlement.transfers.map((t) => ({
        seq: t.seq,
        from: summaryOf(t.fromMembershipId),
        to: summaryOf(t.toMembershipId),
        amountKrw: t.amountKrw,
      })),
    };
  }

  /**
   * 멤버별 결제 내역(WF-26). 그 멤버의 공동 결제 목록 + 개인 결제 건수.
   * 개인 결제 목록은 본인을 열었을 때만 넣는다. 남의 개인 결제는 가맹점·금액·날짜를 읽지도 않는다(C-02, Q-22).
   * 정산 대상(M)이 아닌 멤버십이면 404.
   */
  async getMemberExpenses(
    tripId: string,
    me: MembershipContext,
    membershipId: string,
  ): Promise<SettlementMemberExpenses> {
    const { settlementId } = await this.snapshots.ensureSettlement(tripId);
    const row = await this.prisma.settlementMember.findUnique({
      where: { settlementId_membershipId: { settlementId, membershipId } },
    });
    if (!row) throw new NotFoundError();
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { groupId: true, startDate: true, endDate: true },
    });
    const members = await this.memberMap(trip.groupId);
    const ctx = {
      meId: me.id,
      members,
      startDate: trip.startDate,
      endDate: trip.endDate,
    };
    const summaryOf = (id: string) => {
      const member = members.get(id);
      if (!member) throw new NotFoundError();
      return toMemberSummary(member, me.id);
    };

    const sharedRows = await this.prisma.expense.findMany({
      where: {
        tripId,
        payerMembershipId: membershipId,
        status: 'SHARED',
        refundOfExpenseId: null,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: EXPENSE_ITEM_SELECT,
    });
    const isMe = membershipId === me.id;
    const personalRows = isMe
      ? await this.prisma.expense.findMany({
          where: {
            tripId,
            payerMembershipId: me.id,
            status: { in: ['PERSONAL', 'PENDING'] },
            refundOfExpenseId: null,
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          select: EXPENSE_ITEM_SELECT,
        })
      : null;

    return {
      ...this.memberView(row, summaryOf),
      sharedPayments: sharedRows.map((r) => toExpenseListItem(r, ctx)),
      personalCount: row.personalCount,
      personalPayments: personalRows
        ? personalRows.map((r) => toExpenseListItem(r, ctx))
        : null,
    };
  }

  private memberView(
    row: MemberRowInput,
    summaryOf: (id: string) => SettlementMemberView['member'],
  ): SettlementMemberView {
    return {
      member: summaryOf(row.membershipId),
      paidKrw: row.paidKrw,
      paidCount: row.paidCount,
      burdenKrw: row.burdenKrw,
      netKrw: row.netKrw,
      direction: settlementDirection(row.netKrw),
      isLeft: row.isLeft,
    };
  }

  private async memberMap(groupId: string): Promise<Map<string, LedgerMember>> {
    return new Map(
      (await loadMembers(this.prisma, groupId)).map((m) => [m.id, m]),
    );
  }
}
