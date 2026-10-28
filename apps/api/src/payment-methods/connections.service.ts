import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AttemptPurpose,
  ConfirmConnectionResponse,
  ConnectionAttemptView,
  ConnectionCandidate,
  PaymentMethodType,
  StartConnectionResponse,
} from '@yeojeong/shared';
import { WebConfig, type AuthUser } from '../common/auth/index.js';
import {
  AppException,
  NotFoundError,
  ValidationFailedError,
} from '../common/errors/index.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SyncService } from '../transactions/sync.service.js';
import { FinancialAccessLog } from './access-log.js';
import {
  assertSafelyMasked,
  deriveShortLabel,
  isSafelyMasked,
  last4FromMasked,
} from './masking.js';
import {
  PaymentProviderAdapter,
  ProviderError,
  type ProviderTokens,
} from './providers/payment-provider.adapter.js';
import { CipherPurpose, TokenCipher } from './token-cipher.js';

/** 연결 시도 유효 시간(제안 10분) */
export const ATTEMPT_TTL_MS = 10 * 60 * 1000;
/** 확정 직후 동기화를 응답 전에 기다리는 최대 시간. 넘으면 백그라운드로 계속 돈다 */
const INLINE_SYNC_WAIT_MS = 5_000;
export const CALLBACK_PATH = '/api/payment-connections/callback/toss';

/** ConnectionAttempt.candidates(jsonb)에 넣는 값. 마스킹 값과 제공자 불투명 ID만 있다 */
interface StoredCandidate {
  candidateId: string;
  ref: string;
  type: PaymentMethodType;
  institutionName: string;
  productName: string;
  shortLabel: string;
  maskedNumber: string;
  last4: string;
  linkedAccountRef: string | null;
  preselected: boolean;
}

const hashState = (state: string) =>
  createHash('sha256').update(state).digest('hex');

export function waitAtMost<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 토스 연결 흐름(HF-05~08, FR-801·802·805): 시작(ConnectionAttempt) → 외부 인증 → 콜백(토큰 교환·후보) → 선택 확정.
 * 연동 동의(FIN_LINK·FIN_PRIVACY·THIRD_PARTY)는 컨트롤러의 @RequireConsents가 막는다.
 */
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: PaymentProviderAdapter,
    private readonly cipher: TokenCipher,
    private readonly web: WebConfig,
    private readonly config: ConfigService,
    private readonly sync: SyncService,
    private readonly accessLog: FinancialAccessLog,
  ) {}

  /** 콜백 주소. 운영은 화면과 같은 origin(jinyeojeong.com/api/...), 로컬은 PAYMENT_CALLBACK_BASE_URL로 바꿀 수 있다 */
  redirectUri(): string {
    const base = this.config.get<string>('PAYMENT_CALLBACK_BASE_URL') || this.web.baseUrl.origin;
    return new URL(CALLBACK_PATH, base).toString();
  }

  /** POST /api/payment-connections → ConnectionAttempt(WAITING, 10분) + authUrl */
  async start(
    user: AuthUser,
    input: { purpose: AttemptPurpose; reconnectConnectionId?: string },
  ): Promise<StartConnectionResponse> {
    let reconnectConnectionId: string | null = null;
    if (input.purpose === 'RECONNECT') {
      if (!input.reconnectConnectionId) {
        throw new ValidationFailedError([
          { path: 'reconnectConnectionId', code: 'isDefined', message: '다시 연결할 연결을 골라 주세요' },
        ]);
      }
      const target = await this.prisma.paymentConnection.findFirst({
        where: {
          id: input.reconnectConnectionId,
          userId: user.id,
          status: { in: ['ACTIVE', 'EXPIRED'] },
        },
        select: { id: true },
      });
      if (!target) throw new NotFoundError();
      reconnectConnectionId = target.id;
    }

    const state = randomBytes(32).toString('base64url');
    let authUrl: string;
    try {
      authUrl = this.adapter.buildAuthorizeUrl({
        state,
        redirectUri: this.redirectUri(),
        hint: { userId: user.id, nickname: user.nickname },
      });
    } catch (error) {
      throw this.providerException(error);
    }
    const attempt = await this.prisma.connectionAttempt.create({
      data: {
        userId: user.id,
        provider: this.adapter.provider,
        purpose: input.purpose,
        reconnectConnectionId,
        stateHash: hashState(state),
        expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
      },
      select: { id: true, expiresAt: true },
    });
    return {
      attemptId: attempt.id,
      authUrl,
      expiresAt: attempt.expiresAt.toISOString(),
    };
  }

  /**
   * GET /api/payment-connections/callback/toss → 화면 경로로 302할 주소.
   * state(해시)로 시도를 찾는다. 로그인 쿠키가 있으면 시도한 사용자와 같아야 한다.
   * 성공: 토큰 암호화 저장 → 후보(마스킹 값만) 저장 → AUTHORIZED → /wallet/connect/select?attempt=…
   */
  async callback(query: Record<string, unknown>, sessionUserId?: string): Promise<string> {
    const param = (name: string) => {
      const v = query[name];
      return typeof v === 'string' && v.length > 0 && v.length <= 4096 ? v : undefined;
    };
    const fail = (error: string, attemptId?: string) => {
      const url = new URL('/wallet/connect/toss', this.web.baseUrl);
      if (attemptId) url.searchParams.set('attempt', attemptId);
      url.searchParams.set('error', error);
      return url.toString();
    };
    const state = param('state');
    if (!state) return fail('invalid');
    const attempt = await this.prisma.connectionAttempt.findUnique({
      where: { stateHash: hashState(state) },
    });
    if (!attempt || (sessionUserId && sessionUserId !== attempt.userId)) {
      return fail('invalid');
    }
    const selectUrl = () => {
      const url = new URL('/wallet/connect/select', this.web.baseUrl);
      url.searchParams.set('attempt', attempt.id);
      return url.toString();
    };
    if (attempt.status === 'AUTHORIZED' && attempt.expiresAt > new Date()) return selectUrl();
    if (attempt.status !== 'WAITING') return fail('invalid', attempt.id);
    if (attempt.expiresAt <= new Date()) {
      await this.markAttempt(attempt.id, 'EXPIRED');
      return fail('expired', attempt.id);
    }
    const code = param('code');
    if (param('error') || !code) {
      // 사용자가 토스에서 취소 → WF-06에서 원래 화면으로(토스트 없음)
      await this.markAttempt(attempt.id, 'FAILED');
      return fail('cancelled', attempt.id);
    }

    let tokens: ProviderTokens;
    try {
      tokens = await this.adapter.exchangeCode({ code, redirectUri: this.redirectUri() });
    } catch (error) {
      this.logger.warn({ attemptId: attempt.id, errorCode: (error as ProviderError).code }, '토큰 교환 실패');
      await this.markAttempt(attempt.id, 'FAILED');
      return fail('provider', attempt.id);
    }
    let methods;
    try {
      methods = await this.adapter.listPaymentMethods(tokens);
    } catch (error) {
      this.logger.warn({ attemptId: attempt.id, errorCode: (error as ProviderError).code }, '결제수단 조회 실패');
      await this.adapter.revoke(tokens).catch(() => undefined);
      await this.markAttempt(attempt.id, 'FAILED');
      return fail('provider', attempt.id);
    }

    await this.prisma.$transaction(async (tx) => {
      const target = attempt.reconnectConnectionId
        ? await tx.paymentConnection.findFirst({
            where: { id: attempt.reconnectConnectionId, userId: attempt.userId, status: { not: 'REVOKED' } },
          })
        : await tx.paymentConnection.findFirst({
            where: { userId: attempt.userId, provider: this.adapter.provider, status: { in: ['ACTIVE', 'EXPIRED'] } },
            orderBy: { createdAt: 'desc' },
          });
      const tokenData = {
        accessTokenEnc: this.cipher.encrypt(tokens.accessToken, CipherPurpose.ACCESS_TOKEN),
        refreshTokenEnc: tokens.refreshToken
          ? this.cipher.encrypt(tokens.refreshToken, CipherPurpose.REFRESH_TOKEN)
          : null,
        tokenExpiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope ?? null,
      };
      // 기존 연결이 있으면 토큰만 바꾼다(상태는 확정 때 ACTIVE로). 없으면 결제수단 없는 연결을 만들고 확정을 기다린다
      const connection = target
        ? await tx.paymentConnection.update({ where: { id: target.id }, data: tokenData })
        : await tx.paymentConnection.create({
            data: {
              userId: attempt.userId,
              provider: this.adapter.provider,
              status: 'ACTIVE',
              connectedAt: new Date(),
              ...tokenData,
            },
          });
      const existing = await tx.paymentMethod.findMany({
        where: { connectionId: connection.id, status: { not: 'REMOVED' } },
        select: { externalRef: true, status: true },
      });
      const reconnecting = attempt.purpose === 'RECONNECT' || connection.status === 'EXPIRED';
      const candidates: StoredCandidate[] = [];
      for (const m of methods) {
        if (!isSafelyMasked(m.maskedNumber)) {
          // 어댑터 경계 위반: 전체 번호일 수 있으니 후보에 넣지 않는다(값은 로그에 남기지 않는다)
          this.logger.error({ attemptId: attempt.id }, '마스킹되지 않은 결제수단을 건너뜀');
          continue;
        }
        const ref = m.ref.length <= 128 ? m.ref : this.cipher.hmacRef(m.ref);
        const prior = existing.find((e) => e.externalRef === ref);
        if (!reconnecting && prior?.status === 'ACTIVE') continue; // 이미 연결된 항목은 제외
        candidates.push({
          candidateId: randomUUID(),
          ref,
          type: m.type,
          institutionName: m.institutionName.slice(0, 30),
          productName: m.productName.slice(0, 40),
          shortLabel: (m.shortLabel ?? deriveShortLabel(m)).slice(0, 30),
          maskedNumber: m.maskedNumber,
          last4: last4FromMasked(m.maskedNumber),
          linkedAccountRef: m.linkedAccountRef
            ? m.linkedAccountRef.length <= 128
              ? m.linkedAccountRef
              : this.cipher.hmacRef(m.linkedAccountRef)
            : null,
          preselected: reconnecting ? Boolean(prior) : true,
        });
      }
      await tx.connectionAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'AUTHORIZED',
          connectionId: connection.id,
          candidates: candidates as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return selectUrl();
  }

  /** GET …/attempts/:attemptId (WF-06 2초 폴링). 10분이 지났으면 410 ATTEMPT_EXPIRED */
  async getAttempt(userId: string, attemptId: string): Promise<ConnectionAttemptView> {
    const attempt = await this.loadAttempt(userId, attemptId);
    return {
      attemptId: attempt.id,
      status: attempt.status,
      purpose: attempt.purpose,
      expiresAt: attempt.expiresAt.toISOString(),
    };
  }

  /** GET …/attempts/:attemptId/candidates (WF-07). 마스킹 값만 */
  async getCandidates(userId: string, attemptId: string): Promise<ConnectionCandidate[]> {
    const attempt = await this.loadAttempt(userId, attemptId);
    if (attempt.status !== 'AUTHORIZED') throw new NotFoundError();
    await this.accessLog.record(userId, 'VIEW_CANDIDATES', 'connection_attempt', attempt.id);
    return this.candidatesOf(attempt.candidates).map((c) => ({
      candidateId: c.candidateId,
      type: c.type,
      institutionName: c.institutionName,
      productName: c.productName,
      maskedNumber: c.maskedNumber,
      last4: c.last4,
      preselected: c.preselected,
    }));
  }

  /**
   * POST …/attempts/:attemptId/confirm → 고른 후보로 PaymentMethod 생성(또는 되살림), 연결 ACTIVE, 후보 목록 삭제.
   * 진행 중 여정이 있으면 바로 동기화한다(METHOD_ADDED, 만료됐던 연결이면 RECONNECT 소급).
   */
  async confirm(
    userId: string,
    attemptId: string,
    candidateIds: readonly string[],
  ): Promise<ConfirmConnectionResponse> {
    const attempt = await this.loadAttempt(userId, attemptId);
    if (attempt.status !== 'AUTHORIZED' || !attempt.connectionId) throw new NotFoundError();
    const all = this.candidatesOf(attempt.candidates);
    const unknown = candidateIds.filter((id) => !all.some((c) => c.candidateId === id));
    if (unknown.length > 0) {
      throw new ValidationFailedError([
        { path: 'candidateIds', code: 'unknownCandidate', message: '연결할 수 없는 항목이 있어요' },
      ]);
    }
    const selected = all.filter((c) => candidateIds.includes(c.candidateId));
    selected.forEach((c) => assertSafelyMasked(c.maskedNumber));

    const connection = await this.prisma.paymentConnection.findFirst({
      where: { id: attempt.connectionId, userId, status: { not: 'REVOKED' } },
    });
    if (!connection?.accessTokenEnc) throw AppException.of('ATTEMPT_EXPIRED');
    const reconnecting = attempt.purpose === 'RECONNECT' || connection.status === 'EXPIRED';
    const reconnectFromAt = reconnecting
      ? this.sync.reconnectFromAt(connection.expiredAt, connection.lastSyncedAt)
      : null;

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const c of selected) {
        const labels = {
          type: c.type,
          institutionName: c.institutionName,
          productName: c.productName,
          shortLabel: c.shortLabel,
          maskedNumber: c.maskedNumber,
          last4: c.last4,
          linkedAccountRef: c.linkedAccountRef,
        };
        const prior = await tx.paymentMethod.findUnique({
          where: { connectionId_externalRef: { connectionId: connection.id, externalRef: c.ref } },
          select: { id: true, status: true },
        });
        if (prior) {
          await tx.paymentMethod.update({
            where: { id: prior.id },
            data: {
              ...labels,
              status: 'ACTIVE',
              removedAt: null,
              // 해제했다가 다시 고른 결제수단은 처음부터(진행 중 여정 startAt부터) 다시 가져온다
              ...(prior.status === 'REMOVED' && { lastSyncedAt: null, syncCursor: null }),
            },
          });
        } else {
          await tx.paymentMethod.create({
            data: { ...labels, userId, connectionId: connection.id, externalRef: c.ref },
          });
        }
      }
      if (reconnecting) {
        // 다시 연결에서 고르지 않은 기존 결제수단은 해제한다
        await tx.paymentMethod.updateMany({
          where: {
            connectionId: connection.id,
            status: 'EXPIRED',
            externalRef: { notIn: selected.map((c) => c.ref) },
          },
          data: { status: 'REMOVED', removedAt: now },
        });
      }
      await tx.paymentConnection.update({
        where: { id: connection.id },
        data: { status: 'ACTIVE', expiredAt: null },
      });
      await tx.connectionAttempt.update({
        where: { id: attempt.id },
        data: { status: 'CONFIRMED', candidates: Prisma.DbNull },
      });
    });
    await this.accessLog.record(userId, 'CONNECT', 'payment_connection', connection.id);

    try {
      const handle = await this.sync.start(
        connection.id,
        reconnecting ? 'RECONNECT' : 'METHOD_ADDED',
        { requestedFromAt: reconnectFromAt },
      );
      const done = handle.done.catch((error: unknown) => {
        this.logger.error({ connectionId: connection.id, err: error }, '연결 직후 동기화 실패');
        return undefined;
      });
      await waitAtMost(done, INLINE_SYNC_WAIT_MS);
    } catch (error) {
      // 동기화 실패는 연결 확정을 되돌리지 않는다(다음 주기 잡이 따라잡는다)
      this.logger.error({ connectionId: connection.id, err: error }, '연결 직후 동기화를 시작하지 못함');
    }
    return {
      accounts: selected.filter((c) => c.type === 'ACCOUNT').length,
      cards: selected.filter((c) => c.type === 'CARD').length,
    };
  }

  private async loadAttempt(userId: string, attemptId: string) {
    const attempt = await this.prisma.connectionAttempt.findFirst({
      where: { id: attemptId, userId },
    });
    if (!attempt) throw new NotFoundError();
    if (attempt.status === 'EXPIRED') throw AppException.of('ATTEMPT_EXPIRED');
    if (
      (attempt.status === 'WAITING' || attempt.status === 'AUTHORIZED') &&
      attempt.expiresAt <= new Date()
    ) {
      await this.markAttempt(attempt.id, 'EXPIRED');
      throw AppException.of('ATTEMPT_EXPIRED');
    }
    return attempt;
  }

  private async markAttempt(id: string, status: 'EXPIRED' | 'FAILED') {
    await this.prisma.connectionAttempt.update({
      where: { id },
      data: { status, candidates: Prisma.DbNull },
    });
  }

  private candidatesOf(value: Prisma.JsonValue | null): StoredCandidate[] {
    return Array.isArray(value) ? (value as unknown as StoredCandidate[]) : [];
  }

  private providerException(error: unknown) {
    const code = error instanceof ProviderError ? error.code : 'UNAVAILABLE';
    return code === 'AUTH_FAILED'
      ? AppException.of('PROVIDER_AUTH_FAILED', { cause: error })
      : AppException.of('PROVIDER_UNAVAILABLE', { cause: error });
  }
}
