import { Injectable, Logger } from '@nestjs/common';
import type {
  ManualSyncResponse,
  PaymentMethodsResponse,
} from '@yeojeong/shared';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SyncService } from '../transactions/sync.service.js';
import { waitAtMost } from '../transactions/wait.js';
import { FinancialAccessLog } from './access-log.js';

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
      'payment_method',
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
   * DELETE /api/payment-methods/:paymentMethodId — REMOVED. 이미 들어온 결제는 그대로 둔다.
   * 연결의 마지막 결제수단이면 연결 REVOKED + 토큰 삭제·제공자 폐기 + 연동 동의(FIN_LINK·FIN_PRIVACY) 철회(WF-27).
   * purgeImported는 마지막일 때만: 내 PENDING·PERSONAL Expense, 그 연결의 Transaction·PaymentMethod를 즉시 파기
   * (SHARED는 transactionId가 NULL이 되어 남는다).
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

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.paymentMethod.update({
        where: { id: method.id },
        data: { status: 'REMOVED', removedAt: now },
      });
      if (!isLast) return;
      await tx.paymentConnection.update({
        where: { id: method.connectionId },
        data: {
          status: 'REVOKED',
          accessTokenEnc: null,
          refreshTokenEnc: null,
          tokenExpiresAt: null,
        },
      });
      // 연동 동의 철회(docs/legal/consents.md 5절). 다음 연결 때 연동 동의 시트가 다시 뜬다
      await tx.userConsent.updateMany({
        where: {
          userId,
          consentId: { in: ['FIN_LINK', 'FIN_PRIVACY'] },
          withdrawnAt: null,
        },
        data: { withdrawnAt: now, withdrawChannel: 'WF-27' },
      });
      if (!purgeImported) return;
      const methodIds = (
        await tx.paymentMethod.findMany({
          where: { connectionId: method.connectionId },
          select: { id: true },
        })
      ).map((m) => m.id);
      const transactionIds = (
        await tx.transaction.findMany({
          where: { paymentMethodId: { in: methodIds } },
          select: { id: true },
        })
      ).map((t) => t.id);
      // 개인·미확정은 결제자만 보던 것이라 지운다(취소 자식은 부모와 함께 지워진다)
      await tx.expense.deleteMany({
        where: {
          transactionId: { in: transactionIds },
          status: { in: ['PENDING', 'PERSONAL'] },
          refundOfExpenseId: null,
        },
      });
      await tx.expense.deleteMany({
        where: {
          transactionId: { in: transactionIds },
          status: { in: ['PENDING', 'PERSONAL'] },
        },
      });
      // SHARED Expense는 transactionId가 ON DELETE SET NULL로 비워지고 복사해 둔 값으로 남는다
      await tx.transaction.deleteMany({
        where: { id: { in: transactionIds } },
      });
      await tx.paymentMethod.deleteMany({ where: { id: { in: methodIds } } });
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
      'payment_method',
      method.id,
    );
    this.logger.log(
      {
        userId,
        paymentMethodId: method.id,
        revoked: isLast,
        purged: purgeImported,
      },
      '결제수단 연결 해제',
    );
  }

  /**
   * POST /api/payment-methods/sync (202) — 사용자당 60초에 1번. ACTIVE 연결마다 동기화를 시작하고 최대 5초 기다린다.
   * 연결이 모두 만료됐으면 409 CONNECTION_EXPIRED. 진행 중 여정이 없으면 제공자를 부르지 않는다(syncRunIds 빈 배열).
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
    const handles = [];
    for (const c of active) {
      handles.push(await this.sync.start(c.id, 'MANUAL', { now: startedAt }));
    }
    await this.accessLog.record(userId, 'SYNC', 'payment_connection');
    const all = Promise.allSettled(handles.map((h) => h.done));
    await waitAtMost(all, INLINE_SYNC_WAIT_MS);
    return {
      syncRunIds: handles.flatMap((h) => (h.syncRunId ? [h.syncRunId] : [])),
      startedAt: startedAt.toISOString(),
    };
  }
}
