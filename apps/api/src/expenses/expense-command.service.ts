import { Injectable } from '@nestjs/common';
import type {
  ClassifyExpenseRequest,
  ExpenseDetailResponse,
} from '@yeojeong/shared';
import type { MembershipContext } from '../common/auth/index.js';
import { AppException, NotFoundError } from '../common/errors/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { flagDuplicates, leaveDuplicateGroup } from './duplicates.js';
import { ExpenseQueryService, isUuid } from './expense-query.service.js';
import {
  changeSnapshot,
  computeSplit,
  invalidParticipants,
  isVisibleTo,
  planClassification,
  type GroupMember,
} from './expense-rules.js';
import {
  lockExpense,
  lockTransactions,
  lockTripExpenses,
  lockTripForShare,
} from './locks.js';

type Tx = Prisma.TransactionClient;

const EDIT_SELECT = {
  id: true,
  tripId: true,
  transactionId: true,
  payerMembershipId: true,
  status: true,
  refundOfExpenseId: true,
  krwAmount: true,
  netKrwAmount: true,
  firstSharedAt: true,
  confirmedAt: true,
  duplicateGroupId: true,
  duplicateDismissedAt: true,
  version: true,
  shares: { select: { membershipId: true } },
  payer: { select: { leftAt: true } },
} satisfies Prisma.ExpenseSelect;

type EditRecord = Prisma.ExpenseGetPayload<{ select: typeof EDIT_SELECT }>;

type Outcome = { kind: 'DONE' } | { kind: 'VERSION_CONFLICT' };

/**
 * 결제 변경(FR-504~508·511). 한 트랜잭션에서 잠금 → 단계·멤버십·결제자 재확인 → 변경 → 이력.
 * 가드(@RequireTripStatus)는 요청 시점의 1차 관문이고, 여기서 Trip 행을 잠근 뒤 다시 확인한다(8-3).
 */
@Injectable()
export class ExpenseCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: ExpenseQueryService,
  ) {}

  async classify(
    tripId: string,
    me: MembershipContext,
    expenseId: string,
    body: ClassifyExpenseRequest,
  ): Promise<ExpenseDetailResponse> {
    if (!isUuid(expenseId)) throw new NotFoundError();
    if (
      body.status === 'SHARED' &&
      body.participantMembershipIds?.length === 0
    ) {
      throw AppException.of('PARTICIPANTS_REQUIRED');
    }
    const outcome = await this.prisma.$transaction((tx) =>
      this.classifyInTx(tx, tripId, me, expenseId, body),
    );
    return this.respond(tripId, me, expenseId, outcome);
  }

  async dismissDuplicate(
    tripId: string,
    me: MembershipContext,
    expenseId: string,
    version: number,
  ): Promise<ExpenseDetailResponse> {
    if (!isUuid(expenseId)) throw new NotFoundError();
    const outcome = await this.prisma.$transaction(
      async (tx): Promise<Outcome> => {
        const { expense } = await this.lockForEdit(tx, tripId, me, expenseId);
        if (
          expense.status !== 'SHARED' ||
          !expense.duplicateGroupId ||
          expense.duplicateDismissedAt
        ) {
          throw AppException.of('DUPLICATE_NOT_FLAGGED');
        }
        if (version !== expense.version) return { kind: 'VERSION_CONFLICT' };

        // 한쪽 해제 = 묶음 전체 해제. groupId는 남겨 같은 쌍을 다시 묶지 않는다(미결 Q-20)
        const groupId = expense.duplicateGroupId;
        const group = await tx.expense.findMany({
          where: { duplicateGroupId: groupId },
          select: { id: true },
        });
        const now = new Date();
        await tx.expense.updateMany({
          where: { duplicateGroupId: groupId },
          data: {
            duplicateDismissedAt: now,
            duplicateDismissedByMembershipId: me.id,
            version: { increment: 1 },
          },
        });
        await tx.expenseChangeLog.createMany({
          data: group.map((row) => ({
            expenseId: row.id,
            tripId,
            actorMembershipId: me.id,
            action: 'DUPLICATE_DISMISSED' as const,
            before: { duplicateGroupId: groupId },
            after: { duplicateGroupId: groupId, dismissed: true },
          })),
        });
        return { kind: 'DONE' };
      },
    );
    return this.respond(tripId, me, expenseId, outcome);
  }

  private async respond(
    tripId: string,
    me: MembershipContext,
    expenseId: string,
    outcome: Outcome,
  ): Promise<ExpenseDetailResponse> {
    const { ctx } = await this.query.loadContext(tripId, me.id);
    const current = await this.query.findDetail(tripId, expenseId, ctx);
    if (outcome.kind === 'VERSION_CONFLICT') {
      throw AppException.of('VERSION_CONFLICT', { details: { current } });
    }
    return current;
  }

  /**
   * 잠금 순서: Trip FOR SHARE → 여정 advisory lock → 그룹 멤버 FOR SHARE → Expense FOR UPDATE.
   * 확인 순서: 여정 진행 중(409 EXPENSE_LOCKED) → 내가 활성 멤버(404) → 볼 수 있는 결제(404)
   * → 결제자 활성(409 EXPENSE_LOCKED) → 내가 결제자(403 NOT_PAYER).
   */
  private async lockForEdit(
    tx: Tx,
    tripId: string,
    me: MembershipContext,
    expenseId: string,
  ): Promise<{ expense: EditRecord; members: GroupMember[] }> {
    const trip = await lockTripForShare(tx, tripId);
    if (!trip) throw new NotFoundError();
    if (trip.status !== 'ONGOING') throw AppException.of('EXPENSE_LOCKED');
    await lockTripExpenses(tx, tripId);

    await tx.$queryRaw`
      SELECT id FROM memberships WHERE group_id = ${me.groupId}::uuid FOR SHARE`;
    const members = await tx.membership.findMany({
      where: { groupId: me.groupId },
      select: { id: true, joinOrder: true, leftAt: true },
    });
    if (!members.some((m) => m.id === me.id && m.leftAt === null)) {
      throw new NotFoundError();
    }

    if (!(await lockExpense(tx, tripId, expenseId))) throw new NotFoundError();
    const expense = await tx.expense.findUnique({
      where: { id: expenseId },
      select: EDIT_SELECT,
    });
    if (!expense || !isVisibleTo(expense, me.id)) throw new NotFoundError();
    if (expense.payer.leftAt !== null) throw AppException.of('EXPENSE_LOCKED');
    if (expense.payerMembershipId !== me.id) throw AppException.of('NOT_PAYER');
    return { expense, members };
  }

  private async classifyInTx(
    tx: Tx,
    tripId: string,
    me: MembershipContext,
    expenseId: string,
    body: ClassifyExpenseRequest,
  ): Promise<Outcome> {
    const { expense, members } = await this.lockForEdit(
      tx,
      tripId,
      me,
      expenseId,
    );
    const currentIds =
      expense.status === 'SHARED'
        ? expense.shares.map((s) => s.membershipId)
        : [];
    const activeIds = members
      .filter((m) => m.leftAt === null)
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((m) => m.id);

    const plan = planClassification(
      {
        status: expense.status,
        participantIds: currentIds,
        firstSharedAt: expense.firstSharedAt,
        confirmedAt: expense.confirmedAt,
      },
      {
        status: body.status,
        participantIds: body.participantMembershipIds,
        confirmSharedToPersonal: body.confirmSharedToPersonal,
      },
      activeIds,
    );
    // 같은 상태·같은 부담 인원이면 변경 없이 200(6-3). version이 낡아도 결과가 같으므로 통과시킨다
    if (plan.kind === 'NOOP') return { kind: 'DONE' };
    if (body.version !== expense.version) return { kind: 'VERSION_CONFLICT' };
    if (plan.kind === 'ERROR') {
      throw AppException.of(
        plan.code === 'CONFIRM_REQUIRED'
          ? 'SHARED_TO_PERSONAL_CONFIRM_REQUIRED'
          : 'PARTICIPANTS_REQUIRED',
      );
    }

    const invalid = invalidParticipants(
      plan.participantIds,
      members,
      currentIds,
    );
    if (invalid.length > 0) {
      throw AppException.of('PARTICIPANT_NOT_MEMBER', {
        details: { invalidMembershipIds: invalid },
      });
    }

    if (plan.becomesShared && expense.transactionId) {
      // 한 거래는 한 여정에서만 공동(4-1-2, 미결 Q-13). 거래 행을 잠가 두 여정의 동시 확정을 막는다
      await lockTransactions(tx, [expense.transactionId]);
      const sharedElsewhere = await tx.expense.count({
        where: {
          transactionId: expense.transactionId,
          tripId: { not: tripId },
          status: 'SHARED',
        },
      });
      if (sharedElsewhere > 0) throw AppException.of('SHARED_IN_OTHER_TRIP');
    }

    const net = expense.netKrwAmount ?? expense.krwAmount;
    const now = new Date();
    await tx.expenseShare.deleteMany({ where: { expenseId } });
    let nextIds: string[] = [];
    if (plan.nextStatus === 'SHARED') {
      const split = computeSplit(net, plan.participantIds, members, me.id);
      nextIds = split.shares.map((s) => s.membershipId);
      await tx.expenseShare.createMany({
        data: split.shares.map((s) => ({
          expenseId,
          membershipId: s.membershipId,
          amountKrw: s.amountKrw,
          isRemainderHolder: s.isRemainderHolder,
        })),
      });
    }
    if (plan.leavesShared) await leaveDuplicateGroup(tx, expense);

    await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: plan.nextStatus,
        version: { increment: 1 },
        ...(plan.markChanged && { changedAfterShared: true }),
        ...(plan.setFirstSharedAt && { firstSharedAt: now }),
        ...(plan.setConfirmedAt && { confirmedAt: now }),
      },
    });
    // 취소 자식의 상태는 부모와 같다(I-5)
    await tx.expense.updateMany({
      where: { refundOfExpenseId: expenseId },
      data: { status: plan.nextStatus },
    });
    if (plan.becomesShared) await flagDuplicates(tx, expenseId);

    const joinOrder = new Map(members.map((m) => [m.id, m.joinOrder]));
    const sortedCurrent = [...currentIds].sort(
      (a, b) => (joinOrder.get(a) ?? 0) - (joinOrder.get(b) ?? 0),
    );
    await tx.expenseChangeLog.create({
      data: {
        expenseId,
        tripId,
        actorMembershipId: me.id,
        action: plan.action,
        before: changeSnapshot(expense.status, sortedCurrent, net),
        after: changeSnapshot(plan.nextStatus, nextIds, net),
      },
    });
    return { kind: 'DONE' };
  }
}
