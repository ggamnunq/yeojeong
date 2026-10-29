import { Injectable } from '@nestjs/common';
import type {
  CreateTripExpenseRequest,
  ExpenseDetailResponse,
  ExpenseStatus,
  FxPolicy,
  TripStatus,
  UpdateTripExpenseRequest,
} from '@yeojeong/shared';
import { AuditService } from '../audit/index.js';
import type { MembershipContext } from '../common/auth/index.js';
import {
  AppException,
  NotFoundError,
  ValidationFailedError,
} from '../common/errors/index.js';
import type { ConvertResult } from '../fx/convert.js';
import { convertToKrw } from '../fx/convert.js';
import { FxRatesService } from '../fx/fx-rates.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { normalizeMerchantKey } from '../payment-methods/masking.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { flagDuplicates, leaveDuplicateGroup } from './duplicates.js';
import { othersPersonalError } from './expense-command.service.js';
import { ExpenseQueryService, isUuid } from './expense-query.service.js';
import {
  CLASSIFICATION_TRANSITIONS,
  changeSnapshot,
  computeSplit,
  invalidParticipants,
  isVisibleTo,
  manualStatusOf,
  type GroupMember,
} from './expense-rules.js';
import { lockExpense, lockTransactions, lockTripExpenses } from './locks.js';
import {
  manualAmountError,
  manualKrwError,
  memoError,
  merchantNameOf,
  occurredAtError,
} from './manual-input.js';

type Tx = Prisma.TransactionClient;

/** 직접 입력 결제가 쓰는 여정 값(Trip FOR SHARE로 잠근 뒤 읽는다) */
export interface ManualTrip {
  id: string;
  groupId: string;
  status: TripStatus;
  currency: string;
  startAt: Date;
  autoEndAt: Date;
  fxPolicy: FxPolicy;
  fxFixedRate: string | null;
  fxPolicyChangedAt: Date | null;
}

export interface ManualMember extends GroupMember {
  userId: string | null;
}

/** 원화 환산 + 지갑 표시용 매매기준율 추정 */
export interface ManualAmounts {
  amount: string;
  currency: string;
  occurredAt: Date;
  krw: ConvertResult;
}

/** 거래(지갑 항목)에 넣는 매매기준율 추정. 고시가 없으면 NULL */
export interface SpotEstimate {
  spotRateId: string | null;
  spotKrwAmount: number | null;
}

const MANUAL_EDIT_SELECT = {
  id: true,
  tripId: true,
  transactionId: true,
  payerMembershipId: true,
  createdByMembershipId: true,
  origin: true,
  status: true,
  refundOfExpenseId: true,
  occurredAt: true,
  merchantName: true,
  originalAmount: true,
  originalCurrency: true,
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

export type ManualEditRecord = Prisma.ExpenseGetPayload<{
  select: typeof MANUAL_EDIT_SELECT;
}>;

const fieldError = (path: string, code: string, message: string) =>
  new ValidationFailedError([{ path, code, message }]);

/** 결제자가 그 여정의 활성 멤버가 아니다(FR-427) */
const payerNotMemberError = (payerId: string) =>
  AppException.of('PARTICIPANT_NOT_MEMBER', {
    details: { invalidMembershipIds: [payerId] },
  });

/** 시각 범위·내용 길이(정리 뒤 40자) */
export function checkInputs(
  occurredAt: Date | undefined,
  memo: string | undefined,
  now: Date,
): void {
  const errors = [
    occurredAt ? occurredAtError(occurredAt, now) : null,
    memo !== undefined ? memoError(memo) : null,
  ].filter((e) => e !== null);
  if (errors.length > 0) throw new ValidationFailedError(errors);
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * 직접 입력 결제(S7, 명세 v0.6.0).
 * - 여정에서 추가(POST /api/trips/:tripId/expenses): 분담으로 공동/개인을 바로 정한다. addToWallet이면 지갑 거래(MANUAL)도 만든다.
 * - 수정·삭제(PATCH·DELETE /api/trips/:tripId/expenses/:expenseId): 작성자만, 예정·진행 중 여정만.
 * - 지갑(WalletService)이 같은 트랜잭션 도구(lockTrip·convert·insertExpense·applyLedgerEdit)를 쓴다.
 * 정산·현황은 Expense를 읽어 계산하므로(종료 때 스냅샷) 직접 입력 공동 결제도 가져온 결제와 똑같이 반영된다. 별도 이벤트는 없다.
 * 결제수단 0개 규칙(S4, NO_ACTIVE_PAYMENT_METHOD)은 직접 입력 결제에 걸지 않는다.
 */
@Injectable()
export class ManualExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: ExpenseQueryService,
    private readonly fx: FxRatesService,
    private readonly audit: AuditService,
  ) {}

  // ─── 여정에서 추가 ───

  async createInTrip(
    tripId: string,
    me: MembershipContext,
    body: CreateTripExpenseRequest,
    now: Date = new Date(),
  ): Promise<ExpenseDetailResponse> {
    if (body.clientRequestId) {
      const existing = await this.findByClientRequest(me, body.clientRequestId);
      if (existing) return this.detailFor(existing.tripId, me, existing.id);
    }
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : now;
    checkInputs(occurredAt, body.memo, now);

    let expenseId: string;
    try {
      expenseId = await this.prisma.$transaction(async (tx) => {
        const trip = await this.lockTrip(tx, tripId);
        if (!trip) throw new NotFoundError();
        if (trip.status === 'ENDED')
          throw AppException.of('TRIP_PHASE_INVALID');
        await lockTripExpenses(tx, tripId);
        const members = await this.lockMembers(tx, trip.groupId);
        if (!members.some((m) => m.id === me.id && m.leftAt === null)) {
          throw new NotFoundError();
        }
        const active = members
          .filter((m) => m.leftAt === null)
          .sort((a, b) => a.joinOrder - b.joinOrder);

        const payerId = body.payerMembershipId ?? me.id;
        if (!active.some((m) => m.id === payerId)) {
          throw payerNotMemberError(payerId);
        }
        if (body.addToWallet && payerId !== me.id) {
          throw fieldError(
            'addToWallet',
            'payerNotMe',
            '내가 결제한 건만 내 지갑에 기록할 수 있어요',
          );
        }
        const shareIds =
          body.participantMembershipIds ?? active.map((m) => m.id);
        if (shareIds.length === 0)
          throw AppException.of('PARTICIPANTS_REQUIRED');
        const invalid = invalidParticipants(shareIds, members, []);
        if (invalid.length > 0) {
          throw AppException.of('PARTICIPANT_NOT_MEMBER', {
            details: { invalidMembershipIds: invalid },
          });
        }
        const status = manualStatusOf(shareIds, payerId);
        if (status === 'PERSONAL' && payerId !== me.id) {
          throw othersPersonalError();
        }

        const amounts = await this.convert(tx, trip, {
          amount: body.amount,
          currency: body.currency ?? trip.currency,
          occurredAt,
        });
        const merchantName = merchantNameOf(body.memo);
        let transactionId: string | null = null;
        if (body.addToWallet) {
          transactionId = await this.insertWalletTransaction(tx, {
            userId: me.userId,
            amounts,
            merchantName,
            clientRequestId: body.clientRequestId ?? null,
          });
        }
        return this.insertExpense(tx, {
          trip,
          members,
          actorMembershipId: me.id,
          payerMembershipId: payerId,
          status,
          participantMembershipIds: status === 'SHARED' ? shareIds : [],
          amounts,
          merchantName,
          transactionId,
          clientRequestId: body.clientRequestId ?? null,
          now,
        });
      });
    } catch (error) {
      // 같은 clientRequestId가 동시에 두 번 왔다: 먼저 끝난 쪽 결과를 돌려준다
      if (body.clientRequestId && isUniqueViolation(error)) {
        const existing = await this.findByClientRequest(
          me,
          body.clientRequestId,
        );
        if (existing) return this.detailFor(existing.tripId, me, existing.id);
      }
      throw error;
    }
    return this.detailFor(tripId, me, expenseId);
  }

  private findByClientRequest(me: MembershipContext, clientRequestId: string) {
    return this.prisma.expense.findUnique({
      where: {
        createdByMembershipId_clientRequestId: {
          createdByMembershipId: me.id,
          clientRequestId,
        },
      },
      select: { id: true, tripId: true },
    });
  }

  // ─── 수정 ───

  async update(
    tripId: string,
    me: MembershipContext,
    expenseId: string,
    body: UpdateTripExpenseRequest,
    now: Date = new Date(),
  ): Promise<ExpenseDetailResponse> {
    if (!isUuid(expenseId)) throw new NotFoundError();
    const occurredAt =
      body.occurredAt !== undefined ? new Date(body.occurredAt) : undefined;
    checkInputs(occurredAt, body.memo, now);
    const conflict = await this.prisma.$transaction(async (tx) => {
      const { trip, members, expense } = await this.lockForManualEdit(
        tx,
        tripId,
        me,
        expenseId,
      );
      if (body.version !== expense.version) return true;
      const active = members.filter((m) => m.leftAt === null);

      const payerId = body.payerMembershipId ?? expense.payerMembershipId;
      if (payerId !== expense.payerMembershipId) {
        // 지갑 기록이 있는 결제는 결제자 = 나로 고정(Q-49)
        if (expense.transactionId) {
          throw fieldError(
            'payerMembershipId',
            'walletLinked',
            '내 지갑에 기록된 결제는 결제한 사람을 바꿀 수 없어요',
          );
        }
        if (!active.some((m) => m.id === payerId)) {
          throw payerNotMemberError(payerId);
        }
      }
      const currentShareIds =
        expense.status === 'SHARED'
          ? expense.shares.map((s) => s.membershipId)
          : [];
      let nextStatus: ExpenseStatus = expense.status;
      let shareIds = currentShareIds;
      if (body.participantMembershipIds !== undefined) {
        if (body.participantMembershipIds.length === 0) {
          throw AppException.of('PARTICIPANTS_REQUIRED');
        }
        const invalid = invalidParticipants(
          body.participantMembershipIds,
          members,
          currentShareIds,
        );
        if (invalid.length > 0) {
          throw AppException.of('PARTICIPANT_NOT_MEMBER', {
            details: { invalidMembershipIds: invalid },
          });
        }
        shareIds = [...body.participantMembershipIds];
        nextStatus = manualStatusOf(shareIds, payerId);
      } else if (expense.status === 'SHARED') {
        nextStatus = manualStatusOf(shareIds, payerId);
      }
      if (nextStatus !== 'SHARED') shareIds = [];
      if (nextStatus !== 'SHARED' && payerId !== me.id) {
        throw othersPersonalError();
      }
      if (
        expense.status === 'SHARED' &&
        nextStatus === 'PERSONAL' &&
        body.confirmSharedToPersonal !== true
      ) {
        throw AppException.of('SHARED_TO_PERSONAL_CONFIRM_REQUIRED');
      }

      const amountsChanged =
        body.amount !== undefined ||
        body.currency !== undefined ||
        occurredAt !== undefined;
      const amounts = amountsChanged
        ? await this.convert(tx, trip, {
            amount: body.amount ?? expense.originalAmount.toFixed(),
            currency: body.currency ?? expense.originalCurrency,
            occurredAt: occurredAt ?? expense.occurredAt,
          })
        : null;
      const merchantName =
        body.memo !== undefined
          ? merchantNameOf(body.memo)
          : expense.merchantName;

      await this.applyLedgerEdit(tx, {
        expense,
        members,
        actorMembershipId: me.id,
        payerMembershipId: payerId,
        nextStatus,
        participantMembershipIds: shareIds,
        amounts,
        merchantName,
        now,
      });
      // 결제자(= 나)의 지갑 항목에도 같은 값을 반영한다
      if (expense.transactionId && (amounts || body.memo !== undefined)) {
        await lockTransactions(tx, [expense.transactionId]);
        await this.updateWalletTransaction(tx, expense.transactionId, {
          amounts,
          merchantName,
        });
      }
      return false;
    });
    const current = await this.detailFor(tripId, me, expenseId);
    if (conflict) {
      throw AppException.of('VERSION_CONFLICT', { details: { current } });
    }
    return current;
  }

  // ─── 삭제 ───

  /** 작성자만. 지갑에 같은 결제가 있으면 지갑 항목은 남는다(여정 연결만 끊긴다) */
  async remove(
    tripId: string,
    me: MembershipContext,
    expenseId: string,
    version: number,
  ): Promise<void> {
    if (!isUuid(expenseId)) throw new NotFoundError();
    const conflict = await this.prisma.$transaction(async (tx) => {
      const { expense } = await this.lockForManualEdit(
        tx,
        tripId,
        me,
        expenseId,
      );
      if (version !== expense.version) return true;
      await this.deleteExpense(tx, expense, me.userId);
      return false;
    });
    if (conflict) {
      const current = await this.detailFor(tripId, me, expenseId);
      throw AppException.of('VERSION_CONFLICT', { details: { current } });
    }
  }

  /**
   * 잠금 순서는 결제 변경과 같다(Trip FOR SHARE → advisory → 멤버 FOR SHARE → Expense FOR UPDATE).
   * 확인: 여정 예정·진행 중(409 EXPENSE_LOCKED) → 내가 활성 멤버(404) → 볼 수 있는 결제(404)
   * → 직접 입력한 결제(409 NOT_MANUAL_ENTRY) → 작성자(403 NOT_AUTHOR) → 결제자 활성(409 EXPENSE_LOCKED)
   * (작성자가 나이고 활성이므로 "작성자 나감" 잠금은 작성자 확인으로 걸러진다)
   */
  private async lockForManualEdit(
    tx: Tx,
    tripId: string,
    me: MembershipContext,
    expenseId: string,
  ) {
    const trip = await this.lockTrip(tx, tripId);
    if (!trip) throw new NotFoundError();
    if (trip.status === 'ENDED') throw AppException.of('EXPENSE_LOCKED');
    await lockTripExpenses(tx, tripId);
    const members = await this.lockMembers(tx, trip.groupId);
    if (!members.some((m) => m.id === me.id && m.leftAt === null)) {
      throw new NotFoundError();
    }
    if (!(await lockExpense(tx, tripId, expenseId))) throw new NotFoundError();
    const expense = await tx.expense.findUnique({
      where: { id: expenseId },
      select: MANUAL_EDIT_SELECT,
    });
    if (!expense || !isVisibleTo(expense, me.id)) throw new NotFoundError();
    if (expense.origin !== 'MANUAL') throw AppException.of('NOT_MANUAL_ENTRY');
    if (expense.createdByMembershipId !== me.id) {
      throw AppException.of('NOT_AUTHOR');
    }
    if (expense.payer.leftAt !== null) throw AppException.of('EXPENSE_LOCKED');
    return { trip, members, expense };
  }

  // ─── 트랜잭션 도구(WalletService도 쓴다) ───

  /** Trip FOR SHARE. 종료와 겹치면 종료가 기다리거나 여기서 ENDED를 본다(8-3) */
  async lockTrip(tx: Tx, tripId: string): Promise<ManualTrip | null> {
    const rows = await tx.$queryRaw<
      {
        id: string;
        group_id: string;
        status: TripStatus;
        currency: string;
        start_at: Date;
        auto_end_at: Date;
        fx_policy: FxPolicy;
        fx_fixed_rate: { toString(): string } | null;
        fx_policy_changed_at: Date | null;
      }[]
    >`SELECT id::text AS id, group_id::text AS group_id, status::text AS status, currency,
             start_at, auto_end_at, fx_policy::text AS fx_policy, fx_fixed_rate, fx_policy_changed_at
      FROM trips WHERE id = ${tripId}::uuid AND deleted_at IS NULL FOR SHARE`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      groupId: row.group_id,
      status: row.status,
      currency: row.currency,
      startAt: row.start_at,
      autoEndAt: row.auto_end_at,
      fxPolicy: row.fx_policy,
      fxFixedRate:
        row.fx_fixed_rate === null ? null : row.fx_fixed_rate.toString(),
      fxPolicyChangedAt: row.fx_policy_changed_at,
    };
  }

  /** 그룹 멤버 FOR SHARE(나간 멤버 포함) */
  async lockMembers(tx: Tx, groupId: string): Promise<ManualMember[]> {
    await tx.$queryRaw`
      SELECT id FROM memberships WHERE group_id = ${groupId}::uuid FOR SHARE`;
    return tx.membership.findMany({
      where: { groupId },
      select: { id: true, joinOrder: true, leftAt: true, userId: true },
    });
  }

  /**
   * 금액 검사 + 여정 환율 기준으로 원화 환산(가져온 결제와 같은 FxRatesService.convertForTrip).
   * 여정 통화도 KRW도 아닌 외화(지갑 → 여정 자동 연결 등)는 여정 정책 대신 시장 환율(C-32).
   * @throws 400 VALIDATION_FAILED(금액·10억 상한) · 503 FX_RATE_UNAVAILABLE(고시 없음)
   */
  async convert(
    tx: Tx,
    trip: ManualTrip,
    input: { amount: string; currency: string; occurredAt: Date },
  ): Promise<ManualAmounts> {
    const amount = input.amount.trim();
    const currency = input.currency.toUpperCase();
    const amountError = manualAmountError(amount, currency);
    if (amountError) throw new ValidationFailedError([amountError]);
    const krw = await this.fx.convertForTrip(
      {
        policy: trip.fxPolicy,
        currency: trip.currency,
        fixedRate: trip.fxFixedRate,
        fixedAt: trip.fxPolicyChangedAt,
      },
      { amount, currency, occurredAt: input.occurredAt },
      tx,
    );
    const krwError = manualKrwError(krw.krwAmount);
    if (krwError) throw new ValidationFailedError([krwError]);
    return { amount, currency, occurredAt: input.occurredAt, krw };
  }

  /**
   * 지갑 표시용 원화(Q-43): 입력(저장) 시점의 최신 매매기준율로 환산해 Transaction.spotKrwAmount에 둔다.
   * 여정에 연결되지 않은 외화 항목의 원화다(연결되면 여정 결제의 원화를 쓴다). 고시가 없으면 NULL
   */
  async spotEstimate(
    tx: Tx,
    amount: string,
    currency: string,
    at: Date = new Date(),
  ): Promise<SpotEstimate> {
    if (currency === 'KRW') return { spotRateId: null, spotKrwAmount: null };
    const spot = await this.fx.findSpotRate(currency, at, tx);
    if (!spot) return { spotRateId: null, spotKrwAmount: null };
    const result = convertToKrw({
      amount,
      currency,
      policy: 'SPOT_AT_PAYMENT',
      spot,
    });
    return {
      spotRateId: result.spotRateId,
      spotKrwAmount: result.krwAmount,
    };
  }

  /** 지갑 거래(MANUAL) 한 건 */
  async insertWalletTransaction(
    tx: Tx,
    input: {
      userId: string;
      amounts: Pick<ManualAmounts, 'amount' | 'currency' | 'occurredAt'>;
      merchantName: string;
      clientRequestId: string | null;
    },
  ): Promise<string> {
    const { amount, currency, occurredAt } = input.amounts;
    const spot = await this.spotEstimate(tx, amount, currency);
    const row = await tx.transaction.create({
      data: {
        userId: input.userId,
        source: 'MANUAL',
        kind: 'APPROVAL',
        occurredAt,
        merchantNameRaw: input.merchantName,
        merchantKey: normalizeMerchantKey(input.merchantName),
        originalAmount: new Prisma.Decimal(amount),
        originalCurrency: currency,
        spotRateId: spot.spotRateId,
        spotKrwAmount: spot.spotKrwAmount,
        clientRequestId: input.clientRequestId,
      },
      select: { id: true },
    });
    return row.id;
  }

  /** 지갑 거래(MANUAL) 값 갱신. version을 올린다. 호출자가 거래 행을 잠가 둔다 */
  async updateWalletTransaction(
    tx: Tx,
    transactionId: string,
    input: {
      amounts: Pick<ManualAmounts, 'amount' | 'currency' | 'occurredAt'> | null;
      merchantName: string;
    },
  ): Promise<void> {
    const spot = input.amounts
      ? await this.spotEstimate(
          tx,
          input.amounts.amount,
          input.amounts.currency,
        )
      : null;
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        merchantNameRaw: input.merchantName,
        merchantKey: normalizeMerchantKey(input.merchantName),
        ...(input.amounts && {
          occurredAt: input.amounts.occurredAt,
          originalAmount: new Prisma.Decimal(input.amounts.amount),
          originalCurrency: input.amounts.currency,
        }),
        ...spot,
        version: { increment: 1 },
      },
    });
  }

  /**
   * 직접 입력 결제 한 건(origin MANUAL). PENDING(지갑 자동 연결)·PERSONAL·SHARED.
   * 변경 이력 MANUAL_ADDED를 남기고, 공동이면 중복 의심을 판정한다.
   */
  async insertExpense(
    tx: Tx,
    input: {
      trip: ManualTrip;
      members: readonly GroupMember[];
      actorMembershipId: string;
      payerMembershipId: string;
      status: ExpenseStatus;
      participantMembershipIds: readonly string[];
      amounts: ManualAmounts;
      merchantName: string;
      transactionId: string | null;
      clientRequestId: string | null;
      now: Date;
    },
  ): Promise<string> {
    const { krw } = input.amounts;
    const shared = input.status === 'SHARED';
    const split = shared
      ? computeSplit(
          krw.krwAmount,
          input.participantMembershipIds,
          input.members,
          input.payerMembershipId,
        )
      : null;
    const created = await tx.expense.create({
      data: {
        tripId: input.trip.id,
        transactionId: input.transactionId,
        payerMembershipId: input.payerMembershipId,
        createdByMembershipId: input.actorMembershipId,
        clientRequestId: input.clientRequestId,
        status: input.status,
        origin: 'MANUAL',
        occurredAt: input.amounts.occurredAt,
        merchantName: input.merchantName,
        originalAmount: new Prisma.Decimal(input.amounts.amount),
        originalCurrency: input.amounts.currency,
        krwAmount: krw.krwAmount,
        netKrwAmount: krw.krwAmount,
        fxPolicyApplied: krw.policyApplied,
        fxRate: krw.rate,
        fxRateUnit: krw.rateUnit,
        fxRateSource: krw.rateSource,
        fxRateAt: krw.rateAt,
        firstSharedAt: shared ? input.now : null,
        confirmedAt: input.status === 'PENDING' ? null : input.now,
        ...(split && {
          shares: {
            create: split.shares.map((s) => ({
              membershipId: s.membershipId,
              amountKrw: s.amountKrw,
              isRemainderHolder: s.isRemainderHolder,
            })),
          },
        }),
      },
      select: { id: true },
    });
    const sortedIds = split ? split.shares.map((s) => s.membershipId) : [];
    await tx.expenseChangeLog.create({
      data: {
        expenseId: created.id,
        tripId: input.trip.id,
        actorMembershipId: input.actorMembershipId,
        action: 'MANUAL_ADDED',
        before: Prisma.DbNull,
        after: changeSnapshot(input.status, sortedIds, krw.krwAmount),
      },
    });
    if (shared) await flagDuplicates(tx, created.id);
    return created.id;
  }

  /**
   * 여정 장부 쪽 변경(금액·통화·시각·이름·결제자·분담·상태). 공동이었거나 공동이 되면 "변경됨" 규칙을 따른다:
   * 공동 → 공동 변경은 changedAfterShared, 미확정·개인 → 공동은 처음이면 firstSharedAt(전에 공동이었으면 "변경됨").
   * 바뀐 것이 없으면 아무것도 하지 않는다(version 그대로). 호출자가 잠금(여정·결제)을 잡고 있어야 한다.
   */
  async applyLedgerEdit(
    tx: Tx,
    input: {
      expense: ManualEditRecord;
      members: readonly GroupMember[];
      actorMembershipId: string;
      payerMembershipId: string;
      nextStatus: ExpenseStatus;
      /** nextStatus가 SHARED일 때 분담 인원 */
      participantMembershipIds: readonly string[];
      amounts: ManualAmounts | null;
      merchantName: string;
      now: Date;
    },
  ): Promise<boolean> {
    const { expense } = input;
    const currentIds =
      expense.status === 'SHARED'
        ? expense.shares.map((s) => s.membershipId)
        : [];
    const nextIds =
      input.nextStatus === 'SHARED' ? input.participantMembershipIds : [];
    const net = input.amounts
      ? input.amounts.krw.krwAmount
      : (expense.netKrwAmount ?? expense.krwAmount);
    const prevNet = expense.netKrwAmount ?? expense.krwAmount;
    const sameIds =
      currentIds.length === nextIds.length &&
      currentIds.every((id) => nextIds.includes(id));
    const amountsChanged =
      input.amounts !== null &&
      (!expense.originalAmount.equals(input.amounts.amount) ||
        expense.originalCurrency !== input.amounts.currency ||
        expense.occurredAt.getTime() !== input.amounts.occurredAt.getTime() ||
        expense.krwAmount !== input.amounts.krw.krwAmount);
    const changed =
      amountsChanged ||
      input.merchantName !== expense.merchantName ||
      input.payerMembershipId !== expense.payerMembershipId ||
      input.nextStatus !== expense.status ||
      !sameIds;
    if (!changed) return false;

    const wasShared = expense.status === 'SHARED';
    const isShared = input.nextStatus === 'SHARED';
    await tx.expenseShare.deleteMany({ where: { expenseId: expense.id } });
    let storedIds: string[] = [];
    if (isShared) {
      const split = computeSplit(
        net,
        nextIds,
        input.members,
        input.payerMembershipId,
      );
      storedIds = split.shares.map((s) => s.membershipId);
      await tx.expenseShare.createMany({
        data: split.shares.map((s) => ({
          expenseId: expense.id,
          membershipId: s.membershipId,
          amountKrw: s.amountKrw,
          isRemainderHolder: s.isRemainderHolder,
        })),
      });
    }
    if (wasShared) await leaveDuplicateGroup(tx, expense);
    const becomesShared = !wasShared && isShared;
    const markChanged =
      (wasShared && (isShared || input.nextStatus === 'PERSONAL')) ||
      (becomesShared && expense.firstSharedAt !== null);
    const krw = input.amounts?.krw;
    await tx.expense.update({
      where: { id: expense.id },
      data: {
        status: input.nextStatus,
        payerMembershipId: input.payerMembershipId,
        merchantName: input.merchantName,
        version: { increment: 1 },
        ...(input.amounts &&
          krw && {
            occurredAt: input.amounts.occurredAt,
            originalAmount: new Prisma.Decimal(input.amounts.amount),
            originalCurrency: input.amounts.currency,
            krwAmount: krw.krwAmount,
            netKrwAmount: krw.krwAmount,
            fxPolicyApplied: krw.policyApplied,
            fxRate: krw.rate,
            fxRateUnit: krw.rateUnit,
            fxRateSource: krw.rateSource,
            fxRateAt: krw.rateAt,
          }),
        ...(markChanged && { changedAfterShared: true }),
        ...(becomesShared &&
          expense.firstSharedAt === null && { firstSharedAt: input.now }),
        ...(input.nextStatus !== 'PENDING' &&
          expense.confirmedAt === null && { confirmedAt: input.now }),
      },
    });
    if (isShared) await flagDuplicates(tx, expense.id);

    const action =
      input.nextStatus !== expense.status && input.nextStatus !== 'PENDING'
        ? (CLASSIFICATION_TRANSITIONS[expense.status][input.nextStatus] ??
          'MANUAL_EDITED')
        : 'MANUAL_EDITED';
    await tx.expenseChangeLog.create({
      data: {
        expenseId: expense.id,
        tripId: expense.tripId,
        actorMembershipId: input.actorMembershipId,
        action,
        before: changeSnapshot(expense.status, currentIds, prevNet),
        after: changeSnapshot(input.nextStatus, storedIds, net),
      },
    });
    return true;
  }

  /** 결제 한 건 삭제(부담·이력은 CASCADE). 공동이면 중복 묶음에서 빼고 접근 기록을 남긴다 */
  async deleteExpense(
    tx: Tx,
    expense: Pick<
      ManualEditRecord,
      'id' | 'status' | 'duplicateGroupId' | 'duplicateDismissedAt'
    >,
    actorUserId: string,
  ): Promise<void> {
    if (expense.status === 'SHARED') await leaveDuplicateGroup(tx, expense);
    await tx.expense.deleteMany({
      where: { OR: [{ id: expense.id }, { refundOfExpenseId: expense.id }] },
    });
    await this.audit.record(
      {
        userId: actorUserId,
        action: 'DELETE_EXPENSE',
        resourceType: 'EXPENSE',
        resourceId: expense.id,
        details: { expenses: 1, shared: expense.status === 'SHARED' ? 1 : 0 },
      },
      tx,
    );
  }

  async lockManualRecord(tx: Tx, tripId: string, expenseId: string) {
    if (!(await lockExpense(tx, tripId, expenseId))) return null;
    return tx.expense.findUnique({
      where: { id: expenseId },
      select: MANUAL_EDIT_SELECT,
    });
  }

  async detailFor(
    tripId: string,
    me: { id: string },
    expenseId: string,
  ): Promise<ExpenseDetailResponse> {
    const { ctx } = await this.query.loadContext(tripId, me.id);
    return this.query.findDetail(tripId, expenseId, ctx);
  }
}
