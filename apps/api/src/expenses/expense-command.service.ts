import { Injectable } from '@nestjs/common';
import type {
  ClassifyExpenseRequest,
  ExpenseDetailResponse,
} from '@yeojeong/shared';
import { FIN_LINK_REQUIRED_CONSENTS } from '@yeojeong/shared';
import { AuditService } from '../audit/index.js';
import {
  ConsentChecker,
  consentRequired,
  type MembershipContext,
} from '../common/auth/index.js';
import {
  AppException,
  NotFoundError,
  ValidationFailedError,
} from '../common/errors/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { flagDuplicates, leaveDuplicateGroup } from './duplicates.js';
import { ExpenseQueryService, isUuid } from './expense-query.service.js';
import {
  changeSnapshot,
  computeSplit,
  expandsSharing,
  invalidParticipants,
  isPayerOnly,
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
  sourceTxHash: true,
  version: true,
  shares: { select: { membershipId: true } },
  payer: { select: { leftAt: true } },
} satisfies Prisma.ExpenseSelect;

type EditRecord = Prisma.ExpenseGetPayload<{ select: typeof EDIT_SELECT }>;

/** 공동인데 결제자 혼자(Q-08). 화면은 버튼을 막고, 서버는 400 VALIDATION_FAILED로 막는다 */
function payerOnlyError() {
  return new ValidationFailedError([
    {
      path: 'participantMembershipIds',
      code: 'payerOnly',
      message: '나 말고 함께 낼 사람을 골라 주세요',
    },
  ]);
}

type Outcome =
  | { kind: 'DONE' }
  | { kind: 'VERSION_CONFLICT' }
  /** 결제자의 활성 결제수단이 0개라 공동 → 개인 대신 결제를 지웠다(204) */
  | { kind: 'DELETED' };

/**
 * 결제 변경(FR-504~508·511). 한 트랜잭션에서 잠금 → 단계·멤버십·결제자 재확인 → 변경 → 이력.
 * 가드(@RequireTripStatus)는 요청 시점의 1차 관문이고, 여기서 Trip 행을 잠근 뒤 다시 확인한다(8-3).
 */
@Injectable()
export class ExpenseCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: ExpenseQueryService,
    private readonly consents: ConsentChecker,
    private readonly audit: AuditService,
  ) {}

  /**
   * @returns 바뀐 결제. 결제자의 활성 결제수단이 0개인데 공동 → 개인을 요청하면 결제를 지우고 null(컨트롤러가 204)
   */
  async classify(
    tripId: string,
    me: MembershipContext,
    expenseId: string,
    body: ClassifyExpenseRequest,
  ): Promise<ExpenseDetailResponse | null> {
    if (!isUuid(expenseId)) throw new NotFoundError();
    if (
      body.status === 'SHARED' &&
      body.participantMembershipIds?.length === 0
    ) {
      throw AppException.of('PARTICIPANTS_REQUIRED');
    }
    if (
      body.status === 'SHARED' &&
      body.participantMembershipIds &&
      isPayerOnly(body.participantMembershipIds, me.id)
    ) {
      throw payerOnlyError();
    }
    const outcome = await this.prisma.$transaction((tx) =>
      this.classifyInTx(tx, tripId, me, expenseId, body),
    );
    if (outcome.kind === 'DELETED') return null;
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
      async (tx): Promise<Exclude<Outcome, { kind: 'DELETED' }>> => {
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
    outcome: Exclude<Outcome, { kind: 'DELETED' }>,
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
      me.id,
    );
    // 같은 상태·같은 부담 인원이면 변경 없이 200(6-3). version이 낡아도 결과가 같으므로 통과시킨다
    if (plan.kind === 'NOOP') return { kind: 'DONE' };
    if (body.version !== expense.version) return { kind: 'VERSION_CONFLICT' };
    if (plan.kind === 'ERROR') {
      if (plan.code === 'PAYER_ONLY') throw payerOnlyError();
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

    // 결제자(= 나)의 활성 결제수단이 0개면(결제수단 전부 해제 → FIN_LINK·FIN_PRIVACY 철회) 공개를 넓히지 못하고,
    // 공동 → 개인은 개인 결제로 남기지 않고 지운다(제3자 제공 동의서 1절, 수집·이용 동의서 2절 — 기능명세 4-10 v0.5.7).
    // 다시 연결하면(연동 동의를 새로 받고 결제수단이 생기면) 풀린다.
    const widening = expandsSharing(plan, currentIds);
    const sharedToPersonal =
      expense.status === 'SHARED' && plan.nextStatus === 'PERSONAL';
    if (
      (widening || sharedToPersonal) &&
      !(await this.hasActivePaymentMethod(tx, me.userId))
    ) {
      if (widening) {
        const missing = await this.consents.findMissing(
          me.userId,
          FIN_LINK_REQUIRED_CONSENTS,
        );
        throw consentRequired(missing, 'NO_ACTIVE_PAYMENT_METHOD');
      }
      await this.deleteUnlinkedShared(tx, me, expense);
      return { kind: 'DELETED' };
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

    // 공동이 될 때 원본 거래 해시를 남긴다(전부 해제로 거래를 지운 뒤 다시 연결해도 같은 거래를 새 미확정으로 들이지 않게)
    const sourceTxHash =
      plan.becomesShared && expense.transactionId && !expense.sourceTxHash
        ? await this.sourceTxHashOf(tx, expense.transactionId)
        : null;
    await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: plan.nextStatus,
        version: { increment: 1 },
        ...(sourceTxHash && { sourceTxHash }),
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

  private async hasActivePaymentMethod(tx: Tx, userId: string) {
    const count = await tx.paymentMethod.count({
      where: { userId, status: { not: 'REMOVED' } },
    });
    return count > 0;
  }

  private async sourceTxHashOf(tx: Tx, transactionId: string) {
    const row = await tx.transaction.findUnique({
      where: { id: transactionId },
      select: {
        externalRef: true,
        paymentMethod: {
          select: { connection: { select: { provider: true } } },
        },
      },
    });
    return row
      ? this.audit.sourceTxHash(
          row.paymentMethod.connection.provider,
          row.externalRef,
        )
      : null;
  }

  /**
   * 결제자가 FIN_PRIVACY를 철회한 상태(활성 결제수단 0개)의 공동 → 개인: 개인 결제로 남기지 않고 지운다.
   * 부담·이력·취소 자식은 FK CASCADE로 함께 지워진다. 원본 거래가 남아 있으면(다른 결제가 쓰지 않을 때) 같이 지운다.
   * 진행 중 여정의 현황·정산 미리보기는 남은 결제로 다시 계산된다. 지운 건수는 접근 기록(PURGE_FINANCIAL_DATA)에 남긴다.
   */
  private async deleteUnlinkedShared(
    tx: Tx,
    me: MembershipContext,
    expense: EditRecord,
  ): Promise<void> {
    await leaveDuplicateGroup(tx, expense);
    const children = await tx.expense.findMany({
      where: { refundOfExpenseId: expense.id },
      select: { transactionId: true },
    });
    const transactionIds = [
      expense.transactionId,
      ...children.map((c) => c.transactionId),
    ].filter((id): id is string => id !== null);
    const deleted = await tx.expense.deleteMany({
      where: { OR: [{ id: expense.id }, { refundOfExpenseId: expense.id }] },
    });
    const transactions =
      transactionIds.length > 0
        ? await tx.transaction.deleteMany({
            where: { id: { in: transactionIds }, expenses: { none: {} } },
          })
        : { count: 0 };
    await this.audit.record(
      {
        userId: me.userId,
        action: 'PURGE_FINANCIAL_DATA',
        resourceType: 'EXPENSE',
        resourceId: expense.id,
        details: { expenses: deleted.count, transactions: transactions.count },
      },
      tx,
    );
  }
}
