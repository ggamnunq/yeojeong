import { Injectable, Logger } from '@nestjs/common';
import { splitEvenly, type ExpenseOrigin } from '@yeojeong/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { normalizeMerchantKey } from '../payment-methods/masking.js';
import type { ProviderTransaction } from '../payment-methods/providers/payment-provider.adapter.js';
import { CipherPurpose, TokenCipher } from '../payment-methods/token-cipher.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DuplicateFlagger } from './duplicate-suspicion.service.js';
import {
  NEAR_WINDOW_MS,
  absScaled,
  findSameUserDuplicates,
  fromScaled,
  matchCancel,
  parentNetKrw,
  refundChildKrw,
  toScaled,
  type DedupeTx,
  type MatchTx,
} from './import-rules.js';
import { computeKrw, type SpotRate, type TripFx } from './krw.js';

type Tx = Prisma.TransactionClient;

/** 인입 대상 여정(행 잠금 후 다시 읽은 값) */
export interface LockedTrip extends TripFx {
  id: string;
  status: 'UPCOMING' | 'ONGOING' | 'ENDED';
  startAt: Date;
  autoEndAt: Date;
}

export interface TripMembership {
  tripId: string;
  membershipId: string;
}

const CURRENCY = /^[A-Z]{3}$/;

/**
 * 인입(기능명세 4-1-2~4-1-4): 제공자 거래 저장 → 동일 사용자 중복 제거 → 취소 매칭 → 여정 장부(Expense) 반영.
 * 모든 단계가 멱등이다. 키: Transaction(paymentMethodId, externalRef), Expense(tripId, transactionId).
 * 그래서 같은 동기화·이벤트가 두 번 돌아도 결제가 늘지 않고, 실패한 뒤 다시 돌리면 빠진 것만 채운다.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipher,
    private readonly duplicates: DuplicateFlagger,
  ) {}

  /**
   * 제공자 거래를 저장한다(upsert). 새 거래는 만들고, 이미 있으면 청구 확정·원화만 갱신한다.
   * 형식이 틀린 거래는 건너뛴다(로그에는 결제수단 ID만).
   * @returns 새로 저장한 거래 수
   */
  async upsertProviderTransactions(
    userId: string,
    paymentMethodId: string,
    items: readonly ProviderTransaction[],
  ): Promise<number> {
    const rows = items.flatMap((item) => {
      const row = this.toRow(userId, paymentMethodId, item);
      if (!row) {
        this.logger.warn({ paymentMethodId }, '형식이 맞지 않는 거래를 건너뜀');
      }
      return row ? [row] : [];
    });
    if (rows.length === 0) return 0;
    const existing = await this.prisma.transaction.findMany({
      where: {
        paymentMethodId,
        externalRef: { in: rows.map((r) => r.externalRef) },
      },
      select: {
        id: true,
        externalRef: true,
        providerKrwAmount: true,
        billedKrwAmount: true,
      },
    });
    const byRef = new Map(existing.map((e) => [e.externalRef, e]));
    const fresh = rows.filter((r) => !byRef.has(r.externalRef));
    const created = await this.prisma.transaction.createMany({
      data: fresh,
      skipDuplicates: true,
    });
    for (const row of rows) {
      const prev = byRef.get(row.externalRef);
      if (
        prev &&
        (prev.billedKrwAmount !== row.billedKrwAmount ||
          prev.providerKrwAmount !== row.providerKrwAmount)
      ) {
        await this.prisma.transaction.update({
          where: { id: prev.id },
          data: {
            providerKrwAmount: row.providerKrwAmount,
            billedKrwAmount: row.billedKrwAmount,
            billedAt: row.billedAt,
          },
        });
      }
    }
    return created.count;
  }

  private toRow(
    userId: string,
    paymentMethodId: string,
    item: ProviderTransaction,
  ): Prisma.TransactionCreateManyInput | null {
    let amount: bigint;
    try {
      amount = absScaled(toScaled(item.amount));
    } catch {
      return null;
    }
    if (
      !item.ref ||
      !CURRENCY.test(item.currency) ||
      !(item.occurredAt instanceof Date) ||
      Number.isNaN(item.occurredAt.getTime()) ||
      (item.kind !== 'APPROVAL' && item.kind !== 'CANCEL')
    ) {
      return null;
    }
    // 긴 ref는 그대로 담지 못하니 HMAC으로 바꾼다(같은 ref → 같은 값이라 멱등성 유지)
    const ref =
      item.ref.length <= 128 ? item.ref : this.cipher.hmacRef(item.ref);
    const approvalRef =
      item.approvalRef && item.approvalRef.length > 128
        ? this.cipher.hmacRef(item.approvalRef)
        : (item.approvalRef ?? null);
    const merchantNameRaw = (item.merchantName || '알 수 없음').slice(0, 100);
    return {
      userId,
      paymentMethodId,
      externalRef: ref,
      kind: item.kind,
      occurredAt: item.occurredAt,
      merchantNameRaw,
      merchantKey: normalizeMerchantKey(merchantNameRaw),
      originalAmount: fromScaled(item.kind === 'CANCEL' ? -amount : amount),
      originalCurrency: item.currency,
      providerKrwAmount: item.krwAmount ?? null,
      billedKrwAmount: item.billedKrwAmount ?? null,
      billedAt: item.billedAt ?? null,
      providerApprovalRef: approvalRef,
      rawPayloadEnc: this.cipher.encryptJson(
        item.raw,
        CipherPurpose.RAW_PAYLOAD,
      ),
    };
  }

  /**
   * 저장된 거래로 이 사용자의 인입을 맞춘다: 동일 사용자 중복 제거 → 취소 매칭 → 진행 중 여정마다 장부 반영.
   * @param range 중복 제거를 볼 시간 범위(이번 조회 창)
   * @returns 새로 만든 Expense 수(취소 자식 포함)
   */
  async reconcileUser(
    userId: string,
    range: { fromAt: Date; toAt: Date },
    trips: readonly TripMembership[],
    now: Date = new Date(),
  ): Promise<number> {
    await this.dedupeSameUser(userId, range);
    await this.matchCancels(userId);
    let imported = 0;
    for (const trip of trips) {
      imported += await this.prisma.$transaction((tx) =>
        this.importIntoTrip(tx, { ...trip, userId, now }),
      );
    }
    return imported;
  }

  /** 4-1-3: 계좌 출금 ↔ 연결 체크카드 승인(같은 원화·±2분)을 묶고 계좌 쪽을 인입 대상에서 뺀다 */
  async dedupeSameUser(
    userId: string,
    range: { fromAt: Date; toAt: Date },
  ): Promise<number> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        kind: 'APPROVAL',
        occurredAt: {
          gte: new Date(range.fromAt.getTime() - NEAR_WINDOW_MS),
          lte: new Date(range.toAt.getTime() + NEAR_WINDOW_MS),
        },
      },
      select: {
        id: true,
        kind: true,
        occurredAt: true,
        originalAmount: true,
        originalCurrency: true,
        providerKrwAmount: true,
        sameUserDuplicateOfId: true,
        paymentMethod: {
          select: { type: true, externalRef: true, linkedAccountRef: true },
        },
      },
    });
    const txs: DedupeTx[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      occurredAt: r.occurredAt,
      originalAmount: r.originalAmount.toFixed(4),
      originalCurrency: r.originalCurrency,
      providerKrwAmount: r.providerKrwAmount,
      methodType: r.paymentMethod.type,
      methodRef: r.paymentMethod.externalRef,
      linkedAccountRef: r.paymentMethod.linkedAccountRef,
      sameUserDuplicateOfId: r.sameUserDuplicateOfId,
    }));
    const pairs = findSameUserDuplicates(txs);
    for (const { accountTxId, cardTxId } of pairs) {
      await this.prisma.$transaction(async (tx) => {
        const accountExpenses = await tx.expense.findMany({
          where: { transactionId: accountTxId },
          select: { id: true, status: true },
        });
        if (accountExpenses.some((e) => e.status !== 'PENDING')) {
          // 계좌 쪽을 이미 확정했으면 그쪽을 살리고 카드 쪽을 인입 대상에서 뺀다
          await tx.transaction.update({
            where: { id: cardTxId },
            data: { sameUserDuplicateOfId: accountTxId },
          });
          await tx.expense.deleteMany({
            where: { transactionId: cardTxId, status: 'PENDING' },
          });
          return;
        }
        // 미확정은 결제자만 봤으니 지워도 된다(카드 쪽으로 다시 들어온다)
        await tx.expense.deleteMany({ where: { transactionId: accountTxId } });
        await tx.transaction.update({
          where: { id: accountTxId },
          data: { sameUserDuplicateOfId: cardTxId },
        });
      });
    }
    return pairs.length;
  }

  /** 4-1-4 단계 1~3: 아직 원 결제를 못 찾은 취소 거래를 매칭한다 */
  async matchCancels(userId: string): Promise<number> {
    const cancels = await this.prisma.transaction.findMany({
      where: { userId, kind: 'CANCEL', cancelOfTransactionId: null },
      orderBy: { occurredAt: 'asc' },
    });
    if (cancels.length === 0) return 0;
    const refs = cancels.flatMap((c) =>
      c.providerApprovalRef ? [c.providerApprovalRef] : [],
    );
    const approvals = await this.prisma.transaction.findMany({
      where: {
        userId,
        kind: 'APPROVAL',
        OR: [
          ...(refs.length > 0 ? [{ externalRef: { in: refs } }] : []),
          {
            paymentMethodId: {
              in: [...new Set(cancels.map((c) => c.paymentMethodId))],
            },
            merchantKey: {
              in: [...new Set(cancels.map((c) => c.merchantKey))],
            },
          },
        ],
      },
      include: { cancels: { select: { originalAmount: true } } },
    });
    const matched = new Map<string, bigint>(
      approvals.map((a) => [
        a.id,
        a.cancels.reduce(
          (sum, c) => sum + absScaled(toScaled(c.originalAmount.toFixed(4))),
          0n,
        ),
      ]),
    );
    const toMatch = (t: (typeof cancels)[number]): MatchTx => ({
      id: t.id,
      paymentMethodId: t.paymentMethodId,
      externalRef: t.externalRef,
      kind: t.kind,
      occurredAt: t.occurredAt,
      merchantKey: t.merchantKey,
      originalAmount: t.originalAmount.toFixed(4),
      originalCurrency: t.originalCurrency,
      providerApprovalRef: t.providerApprovalRef,
    });
    const pool = approvals.map(toMatch);
    let count = 0;
    for (const cancel of cancels) {
      const originalId = matchCancel(toMatch(cancel), pool, matched);
      if (!originalId) continue;
      await this.prisma.transaction.update({
        where: { id: cancel.id },
        data: { cancelOfTransactionId: originalId },
      });
      matched.set(
        originalId,
        (matched.get(originalId) ?? 0n) +
          absScaled(toScaled(cancel.originalAmount.toFixed(4))),
      );
      count += 1;
    }
    return count;
  }

  /** Trip 행을 FOR SHARE로 잠그고 다시 읽는다(종료와 겹치면 종료가 기다리거나 인입이 멈춘다, 8-3) */
  async lockTrip(tx: Tx, tripId: string): Promise<LockedTrip | null> {
    const rows = await tx.$queryRaw<
      {
        id: string;
        status: LockedTrip['status'];
        start_at: Date;
        auto_end_at: Date;
        fx_policy: LockedTrip['fxPolicy'];
        fx_fixed_rate: { toString(): string } | null;
        fx_policy_changed_at: Date | null;
      }[]
    >`SELECT id, status, start_at, auto_end_at, fx_policy, fx_fixed_rate, fx_policy_changed_at
      FROM trips WHERE id = ${tripId}::uuid AND deleted_at IS NULL FOR SHARE`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      startAt: row.start_at,
      autoEndAt: row.auto_end_at,
      fxPolicy: row.fx_policy,
      fxFixedRate:
        row.fx_fixed_rate === null ? null : row.fx_fixed_rate.toString(),
      fxPolicyChangedAt: row.fx_policy_changed_at,
    };
  }

  /**
   * 4-1-2: 이 사용자의 저장된 거래 중 여정 기간 안의 승인 건을 Expense(PENDING, AUTO)로 넣고 취소를 붙인다.
   * 여정이 ONGOING이 아니거나(종료 후 인입 금지) 멤버가 나갔으면(나간 멤버 거래 제외) 아무것도 하지 않는다.
   * 이번 조회 창이 아니라 여정 기간 전체를 보므로, 앞선 실패로 빠진 거래도 여기서 채워진다.
   */
  async importIntoTrip(
    tx: Tx,
    input: TripMembership & { userId: string; now: Date },
  ): Promise<number> {
    const trip = await this.lockTrip(tx, input.tripId);
    if (!trip || trip.status !== 'ONGOING') return 0;
    const member = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM memberships
      WHERE id = ${input.membershipId}::uuid AND user_id = ${input.userId}::uuid AND left_at IS NULL
      FOR SHARE`;
    if (member.length === 0) return 0;

    const until = new Date(
      Math.min(trip.autoEndAt.getTime(), input.now.getTime()),
    );
    const candidates = await tx.transaction.findMany({
      where: {
        userId: input.userId,
        kind: 'APPROVAL',
        sameUserDuplicateOfId: null,
        occurredAt: { gte: trip.startAt, lte: until },
        paymentMethod: { status: { not: 'REMOVED' } },
        expenses: { none: { tripId: trip.id } },
      },
      orderBy: { occurredAt: 'asc' },
    });
    const rates = new SpotRateCache(tx);
    const data: Prisma.ExpenseCreateManyInput[] = [];
    for (const t of candidates) {
      const krw = computeKrw(
        {
          originalAmount: t.originalAmount.toFixed(4),
          originalCurrency: t.originalCurrency,
          providerKrwAmount: t.providerKrwAmount,
          billedKrwAmount: t.billedKrwAmount,
        },
        trip,
        await rates.find(t.originalCurrency, t.occurredAt),
        input.now,
      );
      if (!krw) {
        // 환율도 제공자 원화도 없으면 다음 동기화에서 다시 시도한다
        this.logger.warn(
          { transactionId: t.id },
          '원화를 정하지 못해 인입을 미룸',
        );
        continue;
      }
      data.push({
        tripId: trip.id,
        transactionId: t.id,
        payerMembershipId: input.membershipId,
        status: 'PENDING',
        origin: 'AUTO',
        occurredAt: t.occurredAt,
        merchantName: t.merchantNameRaw,
        originalAmount: t.originalAmount,
        originalCurrency: t.originalCurrency,
        krwAmount: krw.krwAmount,
        netKrwAmount: krw.krwAmount,
        fxPolicyApplied: krw.fxPolicyApplied,
        fxRate: krw.fxRate,
        fxRateUnit: krw.fxRateUnit,
        fxRateSource: krw.fxRateSource,
        fxRateAt: krw.fxRateAt,
      });
    }
    const created =
      data.length > 0
        ? (await tx.expense.createMany({ data, skipDuplicates: true })).count
        : 0;
    const refunds = await this.attachRefunds(tx, trip, input.userId);
    return created + refunds;
  }

  /**
   * 4-1-4 단계 4~6: 원 결제가 이 여정에 있는 취소 거래를 취소 자식 Expense로 붙이고 부모 순액을 다시 계산한다.
   * 자식의 상태·결제자는 부모와 같다(I-5). 공동이면 같은 부담 인원으로 다시 나눈다("변경됨" 표시 없음).
   * 원 결제가 여정에 없으면(기간 외·미추가) 붙이지 않는다 — 나중에 원 결제를 추가하면 그때 붙는다.
   */
  async attachRefunds(
    tx: Tx,
    trip: LockedTrip,
    userId: string,
  ): Promise<number> {
    if (trip.status !== 'ONGOING') return 0;
    const cancels = await tx.transaction.findMany({
      where: {
        userId,
        kind: 'CANCEL',
        cancelOfTransactionId: { not: null },
        expenses: { none: { tripId: trip.id } },
        cancelOf: {
          expenses: { some: { tripId: trip.id, refundOfExpenseId: null } },
        },
      },
      orderBy: { occurredAt: 'asc' },
    });
    let attached = 0;
    for (const cancel of cancels) {
      const parent = await tx.expense.findFirst({
        where: {
          tripId: trip.id,
          transactionId: cancel.cancelOfTransactionId!,
          refundOfExpenseId: null,
        },
        include: {
          refunds: { select: { krwAmount: true } },
          shares: { include: { membership: { select: { joinOrder: true } } } },
        },
      });
      if (!parent) continue;
      const childKrw = refundChildKrw(
        {
          krwAmount: parent.krwAmount,
          originalAmount: parent.originalAmount.toFixed(4),
          originalCurrency: parent.originalCurrency,
        },
        cancel.originalAmount.toFixed(4),
      );
      const inserted = await tx.expense.createMany({
        data: [
          {
            tripId: trip.id,
            transactionId: cancel.id,
            payerMembershipId: parent.payerMembershipId,
            status: parent.status,
            origin: parent.origin,
            occurredAt: cancel.occurredAt,
            merchantName: cancel.merchantNameRaw,
            originalAmount: cancel.originalAmount,
            originalCurrency: cancel.originalCurrency,
            krwAmount: childKrw,
            netKrwAmount: null,
            refundOfExpenseId: parent.id,
            fxPolicyApplied: parent.fxPolicyApplied,
            fxRate: parent.fxRate,
            fxRateUnit: parent.fxRateUnit,
            fxRateSource: parent.fxRateSource,
            fxRateAt: parent.fxRateAt,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) continue;
      attached += 1;

      const net = parentNetKrw(parent.krwAmount, [
        ...parent.refunds.map((r) => r.krwAmount),
        childKrw,
      ]);
      await tx.expense.update({
        where: { id: parent.id },
        data: { netKrwAmount: net, version: { increment: 1 } },
      });
      if (parent.status === 'SHARED' && parent.shares.length > 0) {
        const split = splitEvenly(
          net,
          parent.shares.map((s) => ({
            membershipId: s.membershipId,
            joinOrder: s.membership.joinOrder,
          })),
          parent.payerMembershipId,
        );
        for (const share of split.shares) {
          await tx.expenseShare.update({
            where: {
              expenseId_membershipId: {
                expenseId: parent.id,
                membershipId: share.membershipId,
              },
            },
            data: {
              amountKrw: share.amountKrw,
              isRemainderHolder: share.isRemainderHolder,
            },
          });
        }
      }
      await tx.expenseChangeLog.create({
        data: {
          expenseId: parent.id,
          tripId: trip.id,
          actorMembershipId: null,
          action: 'REFUND_ATTACHED',
          before: { status: parent.status, netKrwAmount: parent.netKrwAmount },
          after: { status: parent.status, netKrwAmount: net },
        },
      });
      if (parent.status === 'SHARED') {
        // 순액이 바뀐 공동 결제는 중복 의심을 다시 판정한다(통합 후 S2B-2 flagDuplicates)
        await this.duplicates.flagDuplicates(tx, parent.id);
      }
    }
    return attached;
  }

  /**
   * 기간 외 결제 추가(FR-408)의 장부 반영. S2B-2(expenses)의 POST …/out-of-period-expenses가
   * Trip을 잠근 트랜잭션 안에서 부른다(OutOfPeriodService.add가 이 흐름을 한 번에 해 준다).
   * 각 거래 → Expense(PENDING, OUT_OF_PERIOD) + ExpenseChangeLog(OUT_OF_PERIOD_ADDED), 이미 있는 취소는 자식으로 붙인다.
   * @returns 만든 부모 Expense ID(요청 순서)
   */
  async addOutOfPeriodExpenses(
    tx: Tx,
    input: {
      trip: LockedTrip;
      payerMembershipId: string;
      transactionIds: readonly string[];
      now?: Date;
    },
  ): Promise<string[]> {
    const { trip } = input;
    const txs = await tx.transaction.findMany({
      where: { id: { in: [...input.transactionIds] } },
    });
    const rates = new SpotRateCache(tx);
    const ids: string[] = [];
    let userId: string | null = null;
    for (const id of input.transactionIds) {
      const t = txs.find((x) => x.id === id);
      if (!t) continue;
      userId = t.userId;
      const krw = computeKrw(
        {
          originalAmount: t.originalAmount.toFixed(4),
          originalCurrency: t.originalCurrency,
          providerKrwAmount: t.providerKrwAmount,
          billedKrwAmount: t.billedKrwAmount,
        },
        trip,
        await rates.find(t.originalCurrency, t.occurredAt),
        input.now,
      );
      if (!krw) continue;
      const origin: ExpenseOrigin = 'OUT_OF_PERIOD';
      const expense = await tx.expense.create({
        data: {
          tripId: trip.id,
          transactionId: t.id,
          payerMembershipId: input.payerMembershipId,
          status: 'PENDING',
          origin,
          occurredAt: t.occurredAt,
          merchantName: t.merchantNameRaw,
          originalAmount: t.originalAmount,
          originalCurrency: t.originalCurrency,
          krwAmount: krw.krwAmount,
          netKrwAmount: krw.krwAmount,
          fxPolicyApplied: krw.fxPolicyApplied,
          fxRate: krw.fxRate,
          fxRateUnit: krw.fxRateUnit,
          fxRateSource: krw.fxRateSource,
          fxRateAt: krw.fxRateAt,
        },
        select: { id: true },
      });
      await tx.expenseChangeLog.create({
        data: {
          expenseId: expense.id,
          tripId: trip.id,
          actorMembershipId: input.payerMembershipId,
          action: 'OUT_OF_PERIOD_ADDED',
          before: undefined,
          after: { status: 'PENDING', netKrwAmount: krw.krwAmount },
        },
      });
      ids.push(expense.id);
    }
    if (userId) await this.attachRefunds(tx, trip, userId);
    return ids;
  }
}

/** occurredAt 직전 매매기준율(S2C가 수집한 ExchangeRate). 같은 통화·같은 분은 한 번만 조회 */
class SpotRateCache {
  private readonly memo = new Map<string, SpotRate | null>();

  constructor(private readonly tx: Tx) {}

  async find(currency: string, at: Date): Promise<SpotRate | null> {
    if (currency === 'KRW') return null;
    const key = `${currency}:${Math.floor(at.getTime() / 60_000)}`;
    if (this.memo.has(key)) return this.memo.get(key)!;
    const row = await this.tx.exchangeRate.findFirst({
      where: { quoteCurrency: currency, effectiveAt: { lte: at } },
      orderBy: { effectiveAt: 'desc' },
      select: {
        rate: true,
        displayUnit: true,
        source: true,
        effectiveAt: true,
      },
    });
    const rate = row
      ? {
          rate: row.rate.toFixed(6),
          displayUnit: row.displayUnit,
          source: row.source,
          effectiveAt: row.effectiveAt,
        }
      : null;
    this.memo.set(key, rate);
    return rate;
  }
}
