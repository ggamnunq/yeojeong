import { timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/index.js';
import { AppException } from '../common/errors/index.js';
import {
  normalizeMerchantKey,
  paymentMethodLabel,
} from '../payment-methods/masking.js';
import {
  PaymentProviderAdapter,
  ProviderError,
  type ProviderTokens,
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
import { SyncService } from './sync.service.js';

/** 후보 식별자는 화면을 오래 열어 둬도 다시 조회하도록 짧게 만료한다. */
export const OUT_OF_PERIOD_CANDIDATE_TTL_MS = 5 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_PAGES = 20;
const MAX_CANDIDATES = 300;
const SIGNATURE = /^[0-9a-f]{64}$/;

/** 제공자에서 바로 가져온 기간 외 결제 후보. 이 값 자체는 저장하지 않는다. */
export interface LiveCandidate {
  candidateId: string;
  occurredAt: Date;
  merchantName: string;
  originalAmount: string;
  originalCurrency: string;
  providerKrwAmount: number | null;
  billedKrwAmount: number | null;
  paymentMethodLabel: string;
}

export interface TimeRange {
  fromAt: Date;
  toAt: Date;
}

export interface ConfirmedSelection {
  selected: {
    candidateId: string;
    paymentMethodId: string;
    externalRef: string;
  }[];
  batches: {
    paymentMethodId: string;
    items: ProviderTransaction[];
  }[];
}

/** 사용자·결제수단·제공자 거래 ID·금액·시각·만료를 모두 서명한다. */
interface CandidatePayload {
  u: string;
  m: string;
  r: string;
  a: string;
  t: string;
  e: number;
}

interface Row {
  id: string;
  paymentMethodId: string;
  externalRef: string;
  item: ProviderTransaction;
  amount: string;
}

interface UserMethod {
  id: string;
  type: 'ACCOUNT' | 'CARD';
  status: string;
  externalRef: string;
  linkedAccountRef: string | null;
  shortLabel: string;
  last4: string;
  connection: {
    id: string;
    provider: string;
    status: string;
    accessTokenEnc: Uint8Array | null;
    refreshTokenEnc: Uint8Array | null;
    tokenExpiresAt: Date | null;
  };
}

/**
 * 기간 외 결제 후보(FR-408, I-11).
 * GET은 제공자 응답을 메모리에서 가공할 뿐 거래 내용을 저장하지 않는다. POST는 서명을 확인하고 제공자에서
 * 한 번 더 확인한 결과를 반환하며, 실제 저장은 expenses 모듈이 Expense와 같은 DB 트랜잭션에서 수행한다.
 */
@Injectable()
export class OutOfPeriodLookupService {
  private readonly logger = new Logger(OutOfPeriodLookupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: PaymentProviderAdapter,
    private readonly cipher: TokenCipher,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

  async list(
    userId: string,
    tripId: string,
    range: TimeRange,
    now: Date = new Date(),
  ): Promise<LiveCandidate[]> {
    if (range.fromAt >= range.toAt) return [];
    const methods = await this.usableMethods(userId);
    const rows = await this.fetch(userId, methods, range, now);
    const byMethod = new Map(methods.map((method) => [method.id, method]));
    const inTrip = await this.refsInTrip(userId, tripId);
    const detached = await this.detachedInTrip(tripId, rows, byMethod);
    const cancelled = await this.fullyCancelled(userId, rows);
    const duplicates = this.sameUserDuplicates(rows, byMethod);

    return rows
      .filter(
        (row) =>
          row.item.kind === 'APPROVAL' &&
          !inTrip.has(`${row.paymentMethodId}:${row.externalRef}`) &&
          !detached.has(row.id) &&
          !cancelled.has(row.id) &&
          !duplicates.has(row.id),
      )
      .sort((a, b) => a.item.occurredAt.getTime() - b.item.occurredAt.getTime())
      .slice(0, MAX_CANDIDATES)
      .map((row) => ({
        candidateId: this.sign({
          u: userId,
          m: row.paymentMethodId,
          r: row.externalRef,
          a: row.amount,
          t: row.item.occurredAt.toISOString(),
          e: now.getTime() + OUT_OF_PERIOD_CANDIDATE_TTL_MS,
        }),
        occurredAt: row.item.occurredAt,
        merchantName: row.item.merchantName.slice(0, 100),
        originalAmount: row.amount,
        originalCurrency: row.item.currency,
        providerKrwAmount: row.item.krwAmount ?? null,
        billedKrwAmount: row.item.billedKrwAmount ?? null,
        paymentMethodLabel: paymentMethodLabel(
          byMethod.get(row.paymentMethodId)!,
        ),
      }));
  }

  /** 서명·범위·소유권을 확인하고 제공자에서 같은 거래를 다시 찾는다. DB에는 쓰지 않는다. */
  async confirm(
    userId: string,
    tripId: string,
    candidateIds: readonly string[],
    ranges: readonly TimeRange[],
    now: Date = new Date(),
  ): Promise<ConfirmedSelection> {
    const parsed = new Map<string, CandidatePayload>();
    const invalid = new Set<string>();
    for (const candidateId of candidateIds) {
      const payload = this.verify(candidateId, now);
      const occurredAt = payload ? new Date(payload.t) : null;
      if (
        !payload ||
        payload.u !== userId ||
        !occurredAt ||
        Number.isNaN(occurredAt.getTime()) ||
        !ranges.some(
          (range) => occurredAt >= range.fromAt && occurredAt <= range.toAt,
        )
      ) {
        invalid.add(candidateId);
      } else {
        parsed.set(candidateId, payload);
      }
    }

    const methods = await this.usableMethods(userId);
    const byMethod = new Map(methods.map((method) => [method.id, method]));
    for (const [candidateId, payload] of parsed) {
      if (!byMethod.has(payload.m)) invalid.add(candidateId);
    }
    if (ranges.length === 0) {
      candidateIds.forEach((candidateId) => invalid.add(candidateId));
    }

    const usedMethods = methods.filter((method) =>
      [...parsed.values()].some((payload) => payload.m === method.id),
    );
    const span = ranges.length
      ? {
          fromAt: new Date(
            Math.min(...ranges.map((range) => range.fromAt.getTime())),
          ),
          toAt: new Date(
            Math.max(...ranges.map((range) => range.toAt.getTime())),
          ),
        }
      : null;
    const rows = span ? await this.fetch(userId, usedMethods, span, now) : [];
    const inTrip = await this.refsInTrip(userId, tripId);
    const cancelled = await this.fullyCancelled(userId, rows);
    const duplicates = this.sameUserDuplicates(rows, byMethod);
    const chosen = new Map<string, Row>();

    for (const [candidateId, payload] of parsed) {
      const row = rows.find(
        (item) =>
          item.paymentMethodId === payload.m &&
          item.externalRef === payload.r &&
          item.item.kind === 'APPROVAL' &&
          item.amount === payload.a &&
          item.item.occurredAt.toISOString() === payload.t,
      );
      if (
        !row ||
        inTrip.has(`${payload.m}:${payload.r}`) ||
        cancelled.has(row?.id ?? '') ||
        duplicates.has(row?.id ?? '')
      ) {
        invalid.add(candidateId);
      } else {
        chosen.set(candidateId, row);
      }
    }
    if (invalid.size > 0) {
      throw AppException.of('OUT_OF_PERIOD_CANDIDATE_INVALID', {
        details: {
          invalidCandidateIds: candidateIds.filter((id) => invalid.has(id)),
        },
      });
    }

    const approvals = [...chosen.values()];
    const approvalPool = approvals.map((row) => this.matchTx(row));
    const matched = new Map<string, bigint>();
    const cancels: Row[] = [];
    for (const row of rows
      .filter((item) => item.item.kind === 'CANCEL')
      .sort(
        (a, b) => a.item.occurredAt.getTime() - b.item.occurredAt.getTime(),
      )) {
      const target = matchCancel(this.matchTx(row), approvalPool, matched);
      if (!target) continue;
      matched.set(
        target,
        (matched.get(target) ?? 0n) + absScaled(toScaled(row.amount)),
      );
      cancels.push(row);
    }

    const batches = [
      ...new Set(approvals.map((row) => row.paymentMethodId)),
    ].map((paymentMethodId) => ({
      paymentMethodId,
      items: [...approvals, ...cancels]
        .filter((row) => row.paymentMethodId === paymentMethodId)
        .map((row) => row.item),
    }));
    return {
      selected: [...chosen].map(([candidateId, row]) => ({
        candidateId,
        paymentMethodId: row.paymentMethodId,
        externalRef: row.externalRef,
      })),
      batches,
    };
  }

  private sign(payload: CandidatePayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.cipher.hmacRef(`out-of-period|${body}`)}`;
  }

  private verify(candidateId: string, now: Date): CandidatePayload | null {
    const [body, signature, extra] = candidateId.split('.');
    if (
      !body ||
      !signature ||
      extra !== undefined ||
      !SIGNATURE.test(signature)
    ) {
      return null;
    }
    const expected = this.cipher.hmacRef(`out-of-period|${body}`);
    if (
      !timingSafeEqual(
        Buffer.from(signature, 'ascii'),
        Buffer.from(expected, 'ascii'),
      )
    ) {
      return null;
    }
    try {
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as CandidatePayload;
      const stringsValid = [
        payload.u,
        payload.m,
        payload.r,
        payload.a,
        payload.t,
      ].every((value) => typeof value === 'string' && value.length > 0);
      return stringsValid &&
        typeof payload.e === 'number' &&
        Number.isSafeInteger(payload.e) &&
        payload.e >= now.getTime()
        ? payload
        : null;
    } catch {
      return null;
    }
  }

  /** ACTIVE 연결이 없으면 화면의 재연결 상태로 보낸다. */
  private async usableMethods(userId: string): Promise<UserMethod[]> {
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
          select: {
            id: true,
            provider: true,
            status: true,
            accessTokenEnc: true,
            refreshTokenEnc: true,
            tokenExpiresAt: true,
          },
        },
      },
    });
    const active = methods.filter(
      (method) =>
        method.status === 'ACTIVE' &&
        method.connection.status === 'ACTIVE' &&
        method.connection.accessTokenEnc,
    );
    if (active.length === 0) throw AppException.of('CONNECTION_EXPIRED');
    return active;
  }

  /** 결제수단마다 제공자를 조회한다. 거래 내용은 반환 메모리에만 둔다. */
  private async fetch(
    userId: string,
    methods: UserMethod[],
    range: TimeRange,
    now: Date,
  ): Promise<Row[]> {
    const rows: Row[] = [];
    const tokensByConnection = new Map<string, ProviderTokens>();
    for (const method of methods) {
      let tokens = tokensByConnection.get(method.connection.id);
      if (!tokens) {
        tokens = this.decryptTokens(userId, method);
        if (
          method.connection.tokenExpiresAt &&
          method.connection.tokenExpiresAt <= now
        ) {
          tokens = await this.refresh(userId, method, tokens);
        }
        tokensByConnection.set(method.connection.id, tokens);
      }

      let retried = false;
      for (;;) {
        try {
          const fetched = await this.fetchMethod(method, tokens, range);
          rows.push(...fetched);
          break;
        } catch (error) {
          if (
            error instanceof ProviderError &&
            error.code === 'AUTH_EXPIRED' &&
            !retried
          ) {
            retried = true;
            tokens = await this.refresh(userId, method, tokens);
            tokensByConnection.set(method.connection.id, tokens);
            continue;
          }
          await this.throwProviderError(userId, method, error);
        }
      }
    }
    return rows;
  }

  private async fetchMethod(
    method: UserMethod,
    tokens: ProviderTokens,
    range: TimeRange,
  ): Promise<Row[]> {
    const rows: Row[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.withTimeout(
        this.adapter.listTransactions(tokens, {
          methodRef: method.externalRef,
          from: range.fromAt,
          to: range.toAt,
          cursor,
        }),
      );
      for (const item of result.items) {
        if (item.occurredAt < range.fromAt || item.occurredAt > range.toAt)
          continue;
        let amount: string;
        try {
          amount = fromScaled(absScaled(toScaled(item.amount)));
        } catch {
          continue;
        }
        const externalRef =
          item.ref.length <= 128 ? item.ref : this.cipher.hmacRef(item.ref);
        rows.push({
          id: `${method.id}:${externalRef}`,
          paymentMethodId: method.id,
          externalRef,
          item,
          amount,
        });
      }
      if (!result.nextCursor || result.nextCursor === cursor) break;
      cursor = result.nextCursor;
    }
    return rows;
  }

  private decryptTokens(userId: string, method: UserMethod): ProviderTokens {
    try {
      return {
        accessToken: this.cipher.decrypt(
          method.connection.accessTokenEnc!,
          CipherPurpose.ACCESS_TOKEN,
        ),
        ...(method.connection.refreshTokenEnc && {
          refreshToken: this.cipher.decrypt(
            method.connection.refreshTokenEnc,
            CipherPurpose.REFRESH_TOKEN,
          ),
        }),
        ...(method.connection.tokenExpiresAt && {
          expiresAt: method.connection.tokenExpiresAt,
        }),
      };
    } catch (error) {
      this.logger.error(
        { userId, connectionId: method.connection.id, err: error },
        '기간 외 후보 조회 토큰을 복호화하지 못함',
      );
      throw AppException.of('PROVIDER_UNAVAILABLE');
    }
  }

  private async refresh(
    userId: string,
    method: UserMethod,
    tokens: ProviderTokens,
  ): Promise<ProviderTokens> {
    try {
      const next = await this.withTimeout(this.adapter.refreshTokens(tokens));
      await this.prisma.paymentConnection.update({
        where: { id: method.connection.id },
        data: {
          accessTokenEnc: this.cipher.encrypt(
            next.accessToken,
            CipherPurpose.ACCESS_TOKEN,
          ),
          refreshTokenEnc: next.refreshToken
            ? this.cipher.encrypt(
                next.refreshToken,
                CipherPurpose.REFRESH_TOKEN,
              )
            : null,
          tokenExpiresAt: next.expiresAt ?? null,
          ...(next.scope && { scope: next.scope }),
        },
      });
      return next;
    } catch (error) {
      return this.throwProviderError(userId, method, error);
    }
  }

  private async throwProviderError(
    userId: string,
    method: UserMethod,
    error: unknown,
  ): Promise<never> {
    const errorCode = error instanceof ProviderError ? error.code : 'INTERNAL';
    this.logger.warn(
      { userId, paymentMethodId: method.id, errorCode },
      '기간 외 후보 제공자 조회 실패',
    );
    if (errorCode === 'AUTH_EXPIRED' || errorCode === 'CONSENT_REVOKED') {
      await this.sync.expire(method.connection.id, errorCode);
      throw AppException.of('CONNECTION_EXPIRED');
    }
    throw AppException.of('PROVIDER_UNAVAILABLE', { cause: error });
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ProviderError('UNAVAILABLE')),
        PROVIDER_TIMEOUT_MS,
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /**
   * 결제수단 전부 해제로 원본 거래를 지웠지만 공동 결제로 이 여정에 남아 있는 거래(Expense.sourceTxHash).
   * 다시 연결한 뒤 같은 거래를 후보로 다시 보여 주지 않는다(기능명세 4-10 v0.5.7).
   */
  private async detachedInTrip(
    tripId: string,
    rows: readonly Row[],
    byMethod: ReadonlyMap<string, UserMethod>,
  ): Promise<Set<string>> {
    const hashOf = new Map<string, string>();
    for (const row of rows) {
      const provider = byMethod.get(row.paymentMethodId)?.connection.provider;
      const hash = provider
        ? this.audit.sourceTxHash(provider, row.externalRef)
        : null;
      if (hash) hashOf.set(row.id, hash);
    }
    if (hashOf.size === 0) return new Set();
    const known = new Set(
      (
        await this.prisma.expense.findMany({
          where: { tripId, sourceTxHash: { in: [...hashOf.values()] } },
          select: { sourceTxHash: true },
        })
      ).map((e) => e.sourceTxHash),
    );
    return new Set(
      [...hashOf].filter(([, hash]) => known.has(hash)).map(([id]) => id),
    );
  }

  private async refsInTrip(
    userId: string,
    tripId: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, expenses: { some: { tripId } } },
      select: { paymentMethodId: true, externalRef: true },
    });
    return new Set(
      rows.map((row) => `${row.paymentMethodId}:${row.externalRef}`),
    );
  }

  private matchTx(row: Row): MatchTx {
    return {
      id: row.id,
      paymentMethodId: row.paymentMethodId,
      externalRef: row.externalRef,
      kind: row.item.kind,
      occurredAt: row.item.occurredAt,
      merchantKey: normalizeMerchantKey(row.item.merchantName),
      originalAmount:
        row.item.kind === 'CANCEL' ? `-${row.amount}` : row.amount,
      originalCurrency: row.item.currency,
      providerApprovalRef: row.item.approvalRef ?? null,
    };
  }

  private async fullyCancelled(
    userId: string,
    rows: Row[],
  ): Promise<Set<string>> {
    const methodIds = [...new Set(rows.map((row) => row.paymentMethodId))];
    if (methodIds.length === 0) return new Set();
    const storedCancels = await this.prisma.transaction.findMany({
      where: {
        userId,
        kind: 'CANCEL',
        cancelOfTransactionId: null,
        paymentMethodId: { in: methodIds },
      },
      select: {
        id: true,
        paymentMethodId: true,
        externalRef: true,
        occurredAt: true,
        merchantKey: true,
        originalAmount: true,
        originalCurrency: true,
        providerApprovalRef: true,
      },
    });
    const approvals = rows
      .filter((row) => row.item.kind === 'APPROVAL')
      .map((row) => this.matchTx(row));
    const liveCancels = rows
      .filter((row) => row.item.kind === 'CANCEL')
      .map((row) => this.matchTx(row));
    const liveKeys = new Set(
      liveCancels.map((row) => `${row.paymentMethodId}:${row.externalRef}`),
    );
    const cancels: MatchTx[] = [
      ...liveCancels,
      ...storedCancels
        .filter(
          (row) => !liveKeys.has(`${row.paymentMethodId}:${row.externalRef}`),
        )
        .map((row) => ({
          id: row.id,
          paymentMethodId: row.paymentMethodId,
          externalRef: row.externalRef,
          kind: 'CANCEL' as const,
          occurredAt: row.occurredAt,
          merchantKey: row.merchantKey,
          originalAmount: row.originalAmount.toFixed(4),
          originalCurrency: row.originalCurrency,
          providerApprovalRef: row.providerApprovalRef,
        })),
    ];
    const matched = new Map<string, bigint>();
    for (const cancel of cancels.sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    )) {
      const approvalId = matchCancel(cancel, approvals, matched);
      if (!approvalId) continue;
      matched.set(
        approvalId,
        (matched.get(approvalId) ?? 0n) +
          absScaled(toScaled(cancel.originalAmount)),
      );
    }
    return new Set(
      approvals
        .filter(
          (approval) =>
            (matched.get(approval.id) ?? 0n) >=
            absScaled(toScaled(approval.originalAmount)),
        )
        .map((approval) => approval.id),
    );
  }

  private sameUserDuplicates(
    rows: Row[],
    byMethod: Map<string, UserMethod>,
  ): Set<string> {
    const transactions: DedupeTx[] = rows.map((row) => {
      const method = byMethod.get(row.paymentMethodId)!;
      return {
        id: row.id,
        kind: row.item.kind,
        occurredAt: row.item.occurredAt,
        originalAmount: row.amount,
        originalCurrency: row.item.currency,
        providerKrwAmount: row.item.krwAmount ?? null,
        methodType: method.type,
        methodRef: method.externalRef,
        linkedAccountRef: method.linkedAccountRef,
        sameUserDuplicateOfId: null,
      };
    });
    return new Set(
      findSameUserDuplicates(transactions).map((pair) => pair.accountTxId),
    );
  }
}
