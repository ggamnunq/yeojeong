import { Injectable, Logger } from '@nestjs/common';
import type { OutOfPeriodCandidate, OutOfPeriodSide } from '@yeojeong/shared';
import { AppException } from '../common/errors/index.js';
import { FinancialAccessLog } from '../payment-methods/access-log.js';
import { toKstIso } from '../payment-methods/kst.js';
import { normalizeMerchantKey, paymentMethodLabel } from '../payment-methods/masking.js';
import {
  PaymentProviderAdapter,
  ProviderError,
  type ProviderTransaction,
} from '../payment-methods/providers/payment-provider.adapter.js';
import { CipherPurpose, TokenCipher } from '../payment-methods/token-cipher.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  absScaled,
  findSameUserDuplicates,
  fromScaled,
  matchCancel,
  toScaled,
  type DedupeTx,
  type MatchTx,
} from './import-rules.js';
import { ImportService, type LockedTrip } from './import.service.js';
import { computeKrw } from './krw.js';

/** "여정 전" 후보 범위: 시작 60일 전까지(제안, 미결 Q-27) */
export const OUT_OF_PERIOD_LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;
const STORED = 't:';
const LIVE = 'p:';

interface LiveRef {
  m: string;
  r: string;
  a: string;
}

interface CandidateRow {
  candidateId: string;
  paymentMethodId: string;
  externalRef: string;
  storedId: string | null;
  kind: 'APPROVAL' | 'CANCEL';
  occurredAt: Date;
  merchantName: string;
  originalAmount: string;
  originalCurrency: string;
  providerKrwAmount: number | null;
  billedKrwAmount: number | null;
  providerApprovalRef: string | null;
  sameUserDuplicateOfId: string | null;
  inTrip: boolean;
}

/**
 * 기간 외 결제(기능명세 4-1-6, FR-408). 화면 API(`GET …/out-of-period-candidates`,
 * `POST …/out-of-period-expenses`)는 S2B-2(expenses)가 만들고 이 서비스를 부른다.
 *
 * - 후보 = 저장된 거래(동기화가 이미 가져온 것) + 저장 범위 밖이면 제공자 즉시 조회.
 *   **즉시 조회 결과는 저장하지 않는다**(8-2 최소 수집). 사용자가 고른 건만 add()에서 Transaction으로 저장한다.
 * - 제외: 이미 이 여정에 있는 거래, 전액 취소된 거래, 동일 사용자 중복으로 표시된 거래.
 */
@Injectable()
export class OutOfPeriodService {
  private readonly logger = new Logger(OutOfPeriodService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: PaymentProviderAdapter,
    private readonly cipher: TokenCipher,
    private readonly importer: ImportService,
    private readonly accessLog: FinancialAccessLog,
  ) {}

  /**
   * 후보 목록(날짜 오름차순). 여정이 ONGOING이 아니면 409 TRIP_PHASE_INVALID,
   * 연결이 모두 만료됐으면 409 CONNECTION_EXPIRED. 제공자 장애면 저장된 거래만 돌려준다.
   */
  async listCandidates(
    userId: string,
    tripId: string,
    side: OutOfPeriodSide,
    now: Date = new Date(),
  ): Promise<OutOfPeriodCandidate[]> {
    const { trip } = await this.context(userId, tripId);
    const range = this.rangeOf(trip, side, now);
    const rows = await this.collect(userId, trip.id, range);
    await this.accessLog.record(userId, 'VIEW_CANDIDATES', 'trip', tripId);
    return rows.map((r) => ({
      candidateId: r.candidateId,
      occurredAt: toKstIso(r.occurredAt),
      merchantName: r.merchantName,
      krwAmount:
        computeKrw(
          {
            originalAmount: r.originalAmount,
            originalCurrency: r.originalCurrency,
            providerKrwAmount: r.providerKrwAmount,
            billedKrwAmount: r.billedKrwAmount,
          },
          trip,
          null,
          now,
        )?.krwAmount ?? null,
      originalAmount: trimDecimal(r.originalAmount),
      currency: r.originalCurrency,
      paymentMethodLabel: r.label,
    }));
  }

  /**
   * 고른 후보를 저장(즉시 조회 건만 Transaction으로 저장)하고 Expense(PENDING, OUT_OF_PERIOD)로 넣는다.
   * 이미 추가했거나 범위 밖·남의 후보면 400 OUT_OF_PERIOD_CANDIDATE_INVALID.
   * @returns 만든 Expense ID(요청 순서)
   */
  async add(
    userId: string,
    tripId: string,
    candidateIds: readonly string[],
    now: Date = new Date(),
  ): Promise<string[]> {
    const transactionIds = await this.resolveCandidates(userId, tripId, candidateIds, now);
    return this.prisma.$transaction(async (tx) => {
      const trip = await this.importer.lockTrip(tx, tripId);
      if (!trip || trip.status !== 'ONGOING') throw AppException.of('TRIP_PHASE_INVALID');
      const membership = await tx.$queryRaw<{ id: string }[]>`
        SELECT m.id FROM memberships m JOIN trips t ON t.group_id = m.group_id
        WHERE t.id = ${tripId}::uuid AND m.user_id = ${userId}::uuid AND m.left_at IS NULL
        FOR SHARE OF m`;
      if (membership.length === 0) throw AppException.of('NOT_FOUND');
      const already = await tx.expense.count({
        where: { tripId, transactionId: { in: transactionIds } },
      });
      if (already > 0) throw AppException.of('OUT_OF_PERIOD_CANDIDATE_INVALID');
      return this.importer.addOutOfPeriodExpenses(tx, {
        trip,
        payerMembershipId: membership[0].id,
        transactionIds,
        now,
      });
    });
  }

  /**
   * 후보 ID → 저장된 Transaction ID. 즉시 조회 후보는 제공자에서 다시 받아 그 건만 저장한다.
   * S2B-2가 자기 트랜잭션에서 ImportService.addOutOfPeriodExpenses를 직접 부르고 싶을 때 쓴다.
   */
  async resolveCandidates(
    userId: string,
    tripId: string,
    candidateIds: readonly string[],
    now: Date = new Date(),
  ): Promise<string[]> {
    const invalid = () => AppException.of('OUT_OF_PERIOD_CANDIDATE_INVALID');
    if (candidateIds.length === 0 || new Set(candidateIds).size !== candidateIds.length) {
      throw invalid();
    }
    const { trip } = await this.context(userId, tripId);
    // 현재 후보 목록에 있는 것만 받는다(이미 추가·전액 취소·중복·범위 밖 차단)
    const valid = new Map<string, CandidateRow>();
    for (const side of ['BEFORE', 'AFTER'] as const) {
      const range = this.rangeOf(trip, side, now);
      if (range.fromAt >= range.toAt) continue;
      for (const row of await this.collect(userId, trip.id, range)) {
        valid.set(row.candidateId, row);
      }
    }
    const ids: string[] = [];
    for (const candidateId of candidateIds) {
      const row = valid.get(candidateId);
      if (!row) throw invalid();
      ids.push(row.storedId ?? (await this.store(userId, row)));
    }
    await this.importer.matchCancels(userId);
    return ids;
  }

  private async context(userId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: {
        id: tripId,
        deletedAt: null,
        group: { deletedAt: null, memberships: { some: { userId, leftAt: null } } },
      },
      select: {
        id: true,
        status: true,
        startAt: true,
        autoEndAt: true,
        fxPolicy: true,
        fxFixedRate: true,
        fxPolicyChangedAt: true,
      },
    });
    if (!trip) throw AppException.of('NOT_FOUND');
    if (trip.status !== 'ONGOING') throw AppException.of('TRIP_PHASE_INVALID');
    const locked: LockedTrip = {
      ...trip,
      fxFixedRate: trip.fxFixedRate?.toString() ?? null,
    };
    return { trip: locked };
  }

  private rangeOf(trip: LockedTrip, side: OutOfPeriodSide, now: Date) {
    return side === 'BEFORE'
      ? {
          fromAt: new Date(trip.startAt.getTime() - OUT_OF_PERIOD_LOOKBACK_MS),
          toAt: new Date(trip.startAt.getTime() - 1),
        }
      : { fromAt: new Date(trip.autoEndAt.getTime() + 1), toAt: now };
  }

  /** 저장된 거래 + 제공자 즉시 조회를 합쳐 후보로 거른다 */
  private async collect(
    userId: string,
    tripId: string,
    range: { fromAt: Date; toAt: Date },
  ): Promise<(CandidateRow & { label: string })[]> {
    if (range.fromAt >= range.toAt) return [];
    const methods = await this.prisma.paymentMethod.findMany({
      where: { userId, status: { not: 'REMOVED' } },
      select: {
        id: true,
        type: true,
        status: true,
        externalRef: true,
        linkedAccountRef: true,
        shortLabel: true,
        last4: true,
        connection: {
          select: { id: true, status: true, accessTokenEnc: true, refreshTokenEnc: true, tokenExpiresAt: true },
        },
      },
    });
    if (methods.length === 0) return [];
    const connections = [...new Map(methods.map((m) => [m.connection.id, m.connection])).values()];
    if (!connections.some((c) => c.status === 'ACTIVE') && connections.some((c) => c.status === 'EXPIRED')) {
      throw AppException.of('CONNECTION_EXPIRED');
    }

    const stored = await this.prisma.transaction.findMany({
      where: {
        userId,
        paymentMethodId: { in: methods.map((m) => m.id) },
        occurredAt: { gte: range.fromAt, lte: range.toAt },
      },
      include: { expenses: { where: { tripId }, select: { id: true } } },
    });
    const rows: CandidateRow[] = stored.map((t) => ({
      candidateId: `${STORED}${t.id}`,
      paymentMethodId: t.paymentMethodId,
      externalRef: t.externalRef,
      storedId: t.id,
      kind: t.kind,
      occurredAt: t.occurredAt,
      merchantName: t.merchantNameRaw,
      originalAmount: t.originalAmount.toFixed(4),
      originalCurrency: t.originalCurrency,
      providerKrwAmount: t.providerKrwAmount,
      billedKrwAmount: t.billedKrwAmount,
      providerApprovalRef: t.providerApprovalRef,
      sameUserDuplicateOfId: t.sameUserDuplicateOfId,
      inTrip: t.expenses.length > 0,
    }));
    const known = new Set(rows.map((r) => `${r.paymentMethodId}:${r.externalRef}`));

    // 저장 범위 밖은 제공자에 즉시 조회(저장하지 않는다)
    for (const method of methods) {
      if (method.status !== 'ACTIVE' || method.connection.status !== 'ACTIVE') continue;
      const live = await this.fetchLive(method, range);
      for (const item of live) {
        if (known.has(`${method.id}:${item.ref}`)) continue;
        rows.push(this.liveRow(method.id, item));
      }
    }

    // 전액 취소·동일 사용자 중복 판정(저장 안 한 즉시 조회 건 포함)
    const byMethod = new Map(methods.map((m) => [m.id, m]));
    const dedupe: DedupeTx[] = rows.map((r) => {
      const m = byMethod.get(r.paymentMethodId)!;
      return {
        id: r.candidateId,
        kind: r.kind,
        occurredAt: r.occurredAt,
        originalAmount: r.originalAmount,
        originalCurrency: r.originalCurrency,
        providerKrwAmount: r.providerKrwAmount,
        methodType: m.type,
        methodRef: m.externalRef,
        linkedAccountRef: m.linkedAccountRef,
        sameUserDuplicateOfId: r.sameUserDuplicateOfId ? 'stored' : null,
      };
    });
    const duplicateAccounts = new Set(findSameUserDuplicates(dedupe).map((p) => p.accountTxId));
    const fullyCancelled = this.fullyCancelled(rows);

    return rows
      .filter(
        (r) =>
          r.kind === 'APPROVAL' &&
          !r.inTrip &&
          !r.sameUserDuplicateOfId &&
          !duplicateAccounts.has(r.candidateId) &&
          !fullyCancelled.has(r.candidateId),
      )
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map((r) => ({ ...r, label: paymentMethodLabel(byMethod.get(r.paymentMethodId)!) }));
  }

  private fullyCancelled(rows: readonly CandidateRow[]): Set<string> {
    const toMatch = (r: CandidateRow): MatchTx => ({
      id: r.candidateId,
      paymentMethodId: r.paymentMethodId,
      externalRef: r.externalRef,
      kind: r.kind,
      occurredAt: r.occurredAt,
      merchantKey: normalizeMerchantKey(r.merchantName),
      originalAmount: r.originalAmount,
      originalCurrency: r.originalCurrency,
      providerApprovalRef: r.providerApprovalRef,
    });
    const approvals = rows.filter((r) => r.kind === 'APPROVAL').map(toMatch);
    const matched = new Map<string, bigint>();
    for (const cancel of rows.filter((r) => r.kind === 'CANCEL')) {
      const id = matchCancel(toMatch(cancel), approvals, matched);
      if (id) {
        matched.set(id, (matched.get(id) ?? 0n) + absScaled(toScaled(cancel.originalAmount)));
      }
    }
    return new Set(
      approvals
        .filter((a) => (matched.get(a.id) ?? 0n) >= absScaled(toScaled(a.originalAmount)))
        .map((a) => a.id),
    );
  }

  private liveRow(paymentMethodId: string, item: ProviderTransaction): CandidateRow {
    const amount = absScaled(toScaled(item.amount));
    const ref: LiveRef = { m: paymentMethodId, r: item.ref, a: item.occurredAt.toISOString() };
    return {
      candidateId: `${LIVE}${Buffer.from(JSON.stringify(ref)).toString('base64url')}`,
      paymentMethodId,
      externalRef: item.ref,
      storedId: null,
      kind: item.kind,
      occurredAt: item.occurredAt,
      merchantName: item.merchantName.slice(0, 100),
      originalAmount: fromScaled(item.kind === 'CANCEL' ? -amount : amount),
      originalCurrency: item.currency,
      providerKrwAmount: item.krwAmount ?? null,
      billedKrwAmount: item.billedKrwAmount ?? null,
      providerApprovalRef: item.approvalRef ?? null,
      sameUserDuplicateOfId: null,
      inTrip: false,
    };
  }

  private async fetchLive(
    method: {
      id: string;
      externalRef: string;
      connection: { id: string; accessTokenEnc: Uint8Array | null; refreshTokenEnc: Uint8Array | null; tokenExpiresAt: Date | null };
    },
    range: { fromAt: Date; toAt: Date },
  ): Promise<ProviderTransaction[]> {
    const enc = method.connection.accessTokenEnc;
    if (!enc) return [];
    try {
      const tokens = {
        accessToken: this.cipher.decrypt(enc, CipherPurpose.ACCESS_TOKEN),
        ...(method.connection.refreshTokenEnc && {
          refreshToken: this.cipher.decrypt(method.connection.refreshTokenEnc, CipherPurpose.REFRESH_TOKEN),
        }),
      };
      const items: ProviderTransaction[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const result = await this.adapter.listTransactions(tokens, {
          methodRef: method.externalRef,
          from: range.fromAt,
          to: range.toAt,
          cursor,
        });
        items.push(...result.items);
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      return items;
    } catch (error) {
      // 즉시 조회가 안 되면 저장된 거래만 보여 준다(만료 처리는 동기화가 맡는다)
      this.logger.warn(
        {
          paymentMethodId: method.id,
          errorCode: error instanceof ProviderError ? error.code : 'INTERNAL',
        },
        '기간 외 후보 즉시 조회 실패',
      );
      return [];
    }
  }

  /** 고른 즉시 조회 후보 하나를 저장한다(이 건만, 최소 수집) */
  private async store(userId: string, row: CandidateRow): Promise<string> {
    await this.importer.upsertProviderTransactions(userId, row.paymentMethodId, [
      {
        ref: row.externalRef,
        kind: row.kind,
        occurredAt: row.occurredAt,
        merchantName: row.merchantName,
        amount: row.originalAmount,
        currency: row.originalCurrency,
        ...(row.providerKrwAmount !== null && { krwAmount: row.providerKrwAmount }),
        ...(row.billedKrwAmount !== null && { billedKrwAmount: row.billedKrwAmount }),
        ...(row.providerApprovalRef && { approvalRef: row.providerApprovalRef }),
        raw: { outOfPeriod: true, ref: row.externalRef },
      },
    ]);
    const saved = await this.prisma.transaction.findUniqueOrThrow({
      where: {
        paymentMethodId_externalRef: {
          paymentMethodId: row.paymentMethodId,
          externalRef: row.externalRef.length <= 128 ? row.externalRef : this.cipher.hmacRef(row.externalRef),
        },
      },
      select: { id: true },
    });
    return saved.id;
  }
}

/** "486000.0000" → "486000", "12.5000" → "12.5" */
function trimDecimal(value: string): string {
  const v = value.replace('-', '');
  return v.includes('.') ? v.replace(/\.?0+$/, '') : v;
}
