import { Injectable, Logger } from '@nestjs/common';
import type {
  ManualSyncResponse,
  PaymentMethodsResponse,
} from '@yeojeong/shared';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SyncService } from '../transactions/sync.service.js';
import { waitAtMost } from '../transactions/wait.js';
import { AuditService } from '../audit/index.js';
import { FinancialAccessLog } from './access-log.js';
import {
  FIN_CONSENTS_WITHDRAWN_ON_UNLINK,
  purgeAllFinancialData,
  purgeConnectionData,
  type PurgedFinancialData,
} from './unlink-purge.js';

/** 수동 동기화 사용자당 간격(제안 60초) */
export const MANUAL_SYNC_INTERVAL_MS = 60_000;
/** 수동 동기화를 응답 전에 기다리는 최대 시간(202는 그대로, 화면은 최대 15초 폴링) */
const INLINE_SYNC_WAIT_MS = 5_000;

/** 지갑: 결제수단 목록(FR-803)·연결 해제(FR-804)·수동 동기화(FR-402) */
@Injectable()
export class PaymentMethodsService {
  private readonly logger = new Logger(PaymentMethodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    private readonly accessLog: FinancialAccessLog,
    private readonly audit: AuditService,
  ) {}

  /** GET /api/payment-methods — 해제(REMOVED)된 결제수단과 결제수단 없는 연결은 빼고, 마스킹 값만 */
  async list(userId: string): Promise<PaymentMethodsResponse> {
    const connections = await this.prisma.paymentConnection.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'EXPIRED'] },
        methods: { some: { status: { not: 'REMOVED' } } },
      },
      orderBy: { connectedAt: 'asc' },
      select: {
        id: true,
        provider: true,
        status: true,
        connectedAt: true,
        lastSyncedAt: true,
        lastSyncStatus: true,
        methods: {
          where: { status: { not: 'REMOVED' } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            connectionId: true,
            type: true,
            institutionName: true,
            productName: true,
            shortLabel: true,
            maskedNumber: true,
            last4: true,
            status: true,
            lastSyncedAt: true,
          },
        },
      },
    });
    await this.accessLog.record(
      userId,
      'VIEW_PAYMENT_METHODS',
      'PAYMENT_METHOD',
    );
    const methods = connections.flatMap((c) =>
      c.methods.map((m) => ({
        ...m,
        status: m.status as 'ACTIVE' | 'EXPIRED',
        lastSyncedAt: m.lastSyncedAt?.toISOString() ?? null,
      })),
    );
    const lastSynced = connections
      .flatMap((c) => (c.lastSyncedAt ? [c.lastSyncedAt.getTime()] : []))
      .sort((a, b) => b - a)[0];
    return {
      connections: connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        connectedAt: c.connectedAt.toISOString(),
        lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
        lastSyncStatus: c.lastSyncStatus,
      })),
      methods,
      lastSyncedAt: lastSynced ? new Date(lastSynced).toISOString() : null,
      hasExpiredConnection: connections.some((c) => c.status === 'EXPIRED'),
      counts: {
        accounts: methods.filter((m) => m.type === 'ACCOUNT').length,
        cards: methods.filter((m) => m.type === 'CARD').length,
      },
    };
  }

  /**
   * DELETE /api/payment-methods/:paymentMethodId — REMOVED.
   * - 연결의 마지막 결제수단이면 연결 REVOKED + 토큰 삭제·제공자 폐기(연결 단위).
   * - 사용자의 활성 결제수단(REMOVED가 아닌 것)이 0개가 되면(전부 해제, purgeImported는 무시 — 기능명세 FR-804·4-10 v0.5.7):
   *   연동 동의 FIN_LINK·FIN_PRIVACY 철회(WF-27, THIRD_PARTY는 유지 — 미결 Q-39 기본안) +
   *   내 PENDING·PERSONAL 결제(종료된 여정 포함)·거래 원본·결제수단 행을 즉시 파기(수집·이용 동의서 2절 "지체 없이 파기").
   *   SHARED 결제는 장부에 남고 transactionId만 NULL(sourceTxHash로 재인입을 막는다). 파기 건수는 접근 기록(PURGE_FINANCIAL_DATA).
   * - 일부 해제는 결제 유지가 기본이다. purgeImported는 그 연결의 마지막 결제수단일 때만: 그 연결의 거래로 만든
   *   내 PENDING·PERSONAL, 그 연결의 Transaction·PaymentMethod를 파기(SHARED는 transactionId가 NULL이 되어 남는다).
   */
  async remove(
    userId: string,
    paymentMethodId: string,
    purgeImported: boolean,
  ): Promise<void> {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, userId, status: { not: 'REMOVED' } },
      select: {
        id: true,
        connectionId: true,
        connection: { select: { accessTokenEnc: true, refreshTokenEnc: true } },
      },
    });
    if (!method) throw new NotFoundError();
    const others = await this.prisma.paymentMethod.count({
      where: {
        connectionId: method.connectionId,
        status: { not: 'REMOVED' },
        id: { not: method.id },
      },
    });
    const isLast = others === 0;
    if (purgeImported && !isLast) {
      throw AppException.of('BAD_REQUEST', {
        message: '마지막 결제수단을 해제할 때만 불러온 결제를 지울 수 있어요',
      });
    }

    const hash = (provider: string, externalRef: string) =>
      this.audit.sourceTxHash(provider, externalRef);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const removed = await tx.paymentMethod.updateMany({
        where: { id: method.id, status: { not: 'REMOVED' } },
        data: { status: 'REMOVED', removedAt: now },
      });
      // 동시에 같은 결제수단을 해제한 요청이 먼저 끝났다
      if (removed.count === 0) throw new NotFoundError();
      if (isLast) {
        await tx.paymentConnection.update({
          where: { id: method.connectionId },
          data: {
            status: 'REVOKED',
            accessTokenEnc: null,
            refreshTokenEnc: null,
            tokenExpiresAt: null,
          },
        });
      }
      const remaining = await tx.paymentMethod.count({
        where: { userId, status: { not: 'REMOVED' } },
      });
      let purged: PurgedFinancialData | null = null;
      if (remaining === 0) {
        // 연동 동의 철회(docs/legal/consents.md 5절). 행은 고치지 않고 withdrawnAt만 채운다. 다시 연결하면 새 행이 쌓인다
        await tx.userConsent.updateMany({
          where: {
            userId,
            consentId: { in: [...FIN_CONSENTS_WITHDRAWN_ON_UNLINK] },
            withdrawnAt: null,
          },
          data: { withdrawnAt: now, withdrawChannel: 'WF-27' },
        });
        // 전부 해제는 purgeImported와 무관하게 사용자 단위로 파기한다(purgeImported의 연결 단위 파기를 포함한다)
        purged = await purgeAllFinancialData(tx, userId, hash);
      } else if (purgeImported) {
        // 일부 해제: 이 연결의 마지막 결제수단 + "불러온 결제도 지우기"일 때만
        await purgeConnectionData(tx, method.connectionId, hash);
      }
      if (purged) {
        // 철회·파기와 같은 트랜잭션에 남긴다(파기했는데 기록이 없는 일이 없게)
        await this.audit.record(
          {
            userId,
            action: 'PURGE_FINANCIAL_DATA',
            resourceType: 'USER',
            resourceId: userId,
            details: { ...purged },
          },
          tx,
        );
      }
      return { withdrawn: remaining === 0, purged };
    });

    if (isLast) {
      await this.sync.revokeAtProvider(
        method.connectionId,
        method.connection.accessTokenEnc,
        method.connection.refreshTokenEnc,
      );
    }
    await this.accessLog.record(
      userId,
      'DISCONNECT',
      'PAYMENT_METHOD',
      method.id,
    );
    this.logger.log(
      {
        userId,
        paymentMethodId: method.id,
        revoked: isLast,
        consentWithdrawn: outcome.withdrawn,
        purged: outcome.purged,
        purgedConnection: purgeImported,
      },
      '결제수단 연결 해제',
    );
  }

  /**
   * POST /api/payment-methods/sync — 사용자당 60초에 1번. ACTIVE 연결마다 동기화를 시작하고 최대 5초 기다린다(202).
   * 연결이 모두 만료됐으면 409 CONNECTION_EXPIRED. 진행 중 여정이 없으면 제공자를 부르지 않고 skipped: 'NO_ACTIVE_TRIP'(컨트롤러가 200).
   */
  async manualSync(userId: string): Promise<ManualSyncResponse> {
    const startedAt = new Date();
    const recent = await this.prisma.syncRun.findFirst({
      where: {
        trigger: 'MANUAL',
        connection: { userId },
        startedAt: {
          gt: new Date(startedAt.getTime() - MANUAL_SYNC_INTERVAL_MS),
        },
      },
      select: { id: true },
    });
    if (recent) throw AppException.of('SYNC_RATE_LIMITED');
    const connections = await this.prisma.paymentConnection.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'EXPIRED'] },
        methods: { some: { status: { not: 'REMOVED' } } },
      },
      select: { id: true, status: true },
    });
    const active = connections.filter((c) => c.status === 'ACTIVE');
    if (active.length === 0 && connections.length > 0) {
      throw AppException.of('CONNECTION_EXPIRED');
    }
    if (active.length > 0) {
      const trips = await this.sync.ongoingMemberships(userId);
      if (trips.length === 0) {
        // 진행 중 여정이 없으면 제공자를 부르지 않는다(최소 수집, FR-401 AC2). 동기화 시각도 그대로다
        return {
          syncRunIds: [],
          startedAt: startedAt.toISOString(),
          skipped: 'NO_ACTIVE_TRIP',
        };
      }
    }
    const handles = [];
    for (const c of active) {
      handles.push(await this.sync.start(c.id, 'MANUAL', { now: startedAt }));
    }
    await this.accessLog.record(userId, 'SYNC', 'PAYMENT_CONNECTION');
    const all = Promise.allSettled(handles.map((h) => h.done));
    await waitAtMost(all, INLINE_SYNC_WAIT_MS);
    return {
      syncRunIds: handles.flatMap((h) => (h.syncRunId ? [h.syncRunId] : [])),
      startedAt: startedAt.toISOString(),
      skipped: null,
    };
  }
}
