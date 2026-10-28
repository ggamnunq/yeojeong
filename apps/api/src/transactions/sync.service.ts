import { Injectable, Logger } from '@nestjs/common';
import { type SyncJobResult, type SyncTrigger } from '@yeojeong/shared';
import { Prisma, type SyncRun } from '../generated/prisma/client.js';
import {
  PaymentProviderAdapter,
  ProviderError,
  type ProviderTokens,
  type ProviderTransaction,
} from '../payment-methods/providers/payment-provider.adapter.js';
import { CipherPurpose, TokenCipher } from '../payment-methods/token-cipher.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ImportService, type TripMembership } from './import.service.js';
import { SYNC_OVERLAP_MS, computeSyncWindow } from './sync-window.js';

/** 이 시간이 지나도 끝나지 않은 SyncRun은 죽은 것으로 보고 FAILED(STALE) 처리 */
const STALE_RUN_MS = 5 * 60 * 1000;
/** 결제수단 하나에서 한 번에 받을 최대 페이지(무한 루프 방지) */
const MAX_PAGES = 200;

export type SyncOutcomeStatus = 'OK' | 'FAILED' | 'EXPIRED' | 'SKIPPED';

export interface SyncOutcome {
  connectionId: string;
  syncRunId: string | null;
  status: SyncOutcomeStatus;
  fetched: number;
  imported: number;
  errorCode?: string;
}

/** 시작된 동기화. syncRunId는 바로 알 수 있고 결과는 done으로 기다린다 */
export interface SyncHandle {
  connectionId: string;
  syncRunId: string | null;
  done: Promise<SyncOutcome>;
}

interface SyncOptions {
  /** 소급 시작(TRIP_START·JOIN = 그 여정 startAt, RECONNECT = 끊긴 시점 − 72시간) */
  requestedFromAt?: Date | null;
  now?: Date;
}

interface PreparedRun {
  run: SyncRun;
  userId: string;
  tokens: {
    access: Uint8Array;
    refresh: Uint8Array | null;
    expiresAt: Date | null;
  };
  methods: { id: string; externalRef: string }[];
  trips: TripMembership[];
}

const isAuthError = (e: unknown): e is ProviderError =>
  e instanceof ProviderError &&
  (e.code === 'AUTH_EXPIRED' || e.code === 'CONSENT_REVOKED');

const errorCodeOf = (e: unknown): string =>
  e instanceof ProviderError
    ? e.code
    : ((e as { code?: string } | null)?.code ?? 'INTERNAL').slice(0, 40);

/**
 * 동기화(기능명세 4-1-1, FR-401·402·404·805): 대상 여정 확인 → 조회 창 계산 → SyncRun 기록 →
 * 제공자 조회(페이지) → Transaction upsert → 인입(ImportService) → SyncRun·연결 상태 갱신.
 * 연결당 동시에 하나만 돈다(advisory lock + 진행 중 SyncRun). 토큰 원문은 이 클래스의 지역 변수 밖으로 나가지 않는다.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: PaymentProviderAdapter,
    private readonly cipher: TokenCipher,
    private readonly importer: ImportService,
  ) {}

  /** 동기화를 시작한다. 대상 여정이 없거나 다른 동기화가 돌고 있으면 syncRunId = null(건너뜀) */
  async start(
    connectionId: string,
    trigger: SyncTrigger,
    options: SyncOptions = {},
  ): Promise<SyncHandle> {
    const now = options.now ?? new Date();
    const prepared = await this.prepare(connectionId, trigger, options, now);
    if ('skipped' in prepared) {
      const outcome: SyncOutcome = {
        connectionId,
        syncRunId: prepared.syncRunId,
        status: prepared.syncRunId ? 'FAILED' : 'SKIPPED',
        fetched: 0,
        imported: 0,
        errorCode: prepared.skipped,
      };
      return {
        connectionId,
        syncRunId: prepared.syncRunId,
        done: Promise.resolve(outcome),
      };
    }
    return {
      connectionId,
      syncRunId: prepared.run.id,
      done: this.execute(prepared, now),
    };
  }

  /** start + 끝까지 기다림 */
  async run(
    connectionId: string,
    trigger: SyncTrigger,
    options: SyncOptions = {},
  ): Promise<SyncOutcome> {
    return (await this.start(connectionId, trigger, options)).done;
  }

  private async prepare(
    connectionId: string,
    trigger: SyncTrigger,
    options: SyncOptions,
    now: Date,
  ): Promise<PreparedRun | { skipped: string; syncRunId: string | null }> {
    const connection = await this.prisma.paymentConnection.findUnique({
      where: { id: connectionId },
      include: {
        methods: {
          where: { status: 'ACTIVE' },
          select: { id: true, externalRef: true, lastSyncedAt: true },
        },
      },
    });
    if (
      !connection ||
      connection.status !== 'ACTIVE' ||
      !connection.accessTokenEnc
    ) {
      return { skipped: 'NOT_ACTIVE', syncRunId: null };
    }
    if (connection.methods.length === 0) {
      return { skipped: 'NO_METHODS', syncRunId: null };
    }
    const memberships = await this.ongoingMemberships(connection.userId);
    if (memberships.length === 0) {
      // 진행 중 여정이 없으면 제공자 조회를 하지 않는다(최소 수집, FR-401 AC2)
      return { skipped: 'NO_ONGOING_TRIP', syncRunId: null };
    }
    const earliest = Math.min(
      ...memberships.map((membership) => membership.startAt.getTime()),
    );
    const succeededRuns = await this.prisma.syncRun.findMany({
      where: { connectionId, status: 'OK', toAt: { gte: new Date(earliest) } },
      select: { fromAt: true, toAt: true },
    });
    const window = computeSyncWindow({
      now,
      trips: memberships,
      lastSyncedAt: connection.lastSyncedAt,
      hasUnsyncedMethod: connection.methods.some((m) => !m.lastSyncedAt),
      requestedFromAt: options.requestedFromAt ?? null,
      succeededRuns,
    });
    if (!window) return { skipped: 'NO_ONGOING_TRIP', syncRunId: null };

    const run = await this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${connectionId}::text, 7)) AS locked`;
      if (!lock?.locked) return null;
      await tx.syncRun.updateMany({
        where: {
          connectionId,
          status: null,
          startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) },
        },
        data: { status: 'FAILED', errorCode: 'STALE', finishedAt: now },
      });
      const running = await tx.syncRun.findFirst({
        where: { connectionId, status: null },
        select: { id: true },
      });
      if (running) return null;
      return tx.syncRun.create({
        data: {
          connectionId,
          trigger,
          fromAt: window.fromAt,
          toAt: window.toAt,
        },
      });
    });
    if (!run) {
      // 이미 다른 동기화가 돌고 있다. 소급 트리거는 결과를 남긴다(실패 → 다음 주기 잡이 덮이지 않은 구간을 따라잡는다)
      if (trigger === 'SCHEDULED' || trigger === 'MANUAL') {
        return { skipped: 'LOCKED', syncRunId: null };
      }
      const failed = await this.prisma.syncRun.create({
        data: {
          connectionId,
          trigger,
          fromAt: window.fromAt,
          toAt: window.toAt,
          status: 'FAILED',
          errorCode: 'LOCKED',
          finishedAt: now,
        },
        select: { id: true },
      });
      return { skipped: 'LOCKED', syncRunId: failed.id };
    }
    return {
      run,
      userId: connection.userId,
      tokens: {
        access: connection.accessTokenEnc,
        refresh: connection.refreshTokenEnc,
        expiresAt: connection.tokenExpiresAt,
      },
      methods: connection.methods,
      trips: memberships.map((m) => ({
        tripId: m.tripId,
        membershipId: m.membershipId,
      })),
    };
  }

  private async execute(p: PreparedRun, now: Date): Promise<SyncOutcome> {
    const { run } = p;
    const base = { connectionId: run.connectionId, syncRunId: run.id };
    let fetched = 0;
    try {
      let tokens = this.decryptTokens(p.tokens);
      let refreshed = false;
      const refresh = async () => {
        tokens = await this.refresh(run.connectionId, tokens);
        refreshed = true;
      };
      if (p.tokens.expiresAt && p.tokens.expiresAt <= now) await refresh();

      const synced: string[] = [];
      for (const method of p.methods) {
        let items: ProviderTransaction[];
        try {
          items = await this.fetchAll(
            tokens,
            method.externalRef,
            run.fromAt,
            run.toAt,
          );
        } catch (error) {
          if (isAuthError(error) && !refreshed) {
            await refresh();
            items = await this.fetchAll(
              tokens,
              method.externalRef,
              run.fromAt,
              run.toAt,
            );
          } else if (
            error instanceof ProviderError &&
            error.code === 'INVALID_REQUEST'
          ) {
            this.logger.warn(
              { syncRunId: run.id, paymentMethodId: method.id },
              '제공자가 요청을 거부해 이 결제수단을 건너뜀',
            );
            continue;
          } else {
            throw error;
          }
        }
        fetched += items.length;
        await this.importer.upsertProviderTransactions(
          p.userId,
          method.id,
          items,
        );
        synced.push(method.id);
      }

      const imported = await this.importer.reconcileUser(
        p.userId,
        { fromAt: run.fromAt, toAt: run.toAt },
        p.trips,
        now,
      );
      const finishedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.syncRun.update({
          where: { id: run.id },
          data: {
            status: 'OK',
            fetchedCount: fetched,
            importedCount: imported,
            finishedAt,
          },
        }),
        this.prisma.paymentConnection.update({
          where: { id: run.connectionId },
          data: {
            lastSyncedAt: run.toAt,
            lastSyncStatus: 'OK',
            lastSyncErrorCode: null,
          },
        }),
        this.prisma.paymentMethod.updateMany({
          where: { id: { in: synced } },
          data: { lastSyncedAt: run.toAt },
        }),
      ]);
      return { ...base, status: 'OK', fetched, imported };
    } catch (error) {
      const errorCode = errorCodeOf(error);
      const finishedAt = new Date();
      if (isAuthError(error)) {
        await this.expire(run.connectionId, errorCode, now);
        await this.prisma.syncRun.update({
          where: { id: run.id },
          data: {
            status: 'EXPIRED',
            errorCode,
            fetchedCount: fetched,
            finishedAt,
          },
        });
        this.logger.warn(
          { syncRunId: run.id, connectionId: run.connectionId, errorCode },
          '연결 만료',
        );
        return { ...base, status: 'EXPIRED', fetched, imported: 0, errorCode };
      }
      await this.prisma.$transaction([
        this.prisma.syncRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            errorCode,
            fetchedCount: fetched,
            finishedAt,
          },
        }),
        this.prisma.paymentConnection.update({
          where: { id: run.connectionId },
          data: { lastSyncStatus: 'FAILED', lastSyncErrorCode: errorCode },
        }),
      ]);
      // 제공자 장애는 다음 주기에 다시 한다. 그 밖의 오류는 스택과 함께 남긴다(거래 내용 없음)
      if (error instanceof ProviderError) {
        this.logger.warn(
          { syncRunId: run.id, connectionId: run.connectionId, errorCode },
          '동기화 실패',
        );
      } else {
        this.logger.error(
          {
            syncRunId: run.id,
            connectionId: run.connectionId,
            errorCode,
            err: error,
          },
          '동기화 실패',
        );
      }
      return { ...base, status: 'FAILED', fetched, imported: 0, errorCode };
    }
  }

  private async fetchAll(
    tokens: ProviderTokens,
    methodRef: string,
    from: Date,
    to: Date,
  ): Promise<ProviderTransaction[]> {
    const items: ProviderTransaction[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.adapter.listTransactions(tokens, {
        methodRef,
        from,
        to,
        cursor,
      });
      items.push(...result.items);
      if (!result.nextCursor || result.nextCursor === cursor) return items;
      cursor = result.nextCursor;
    }
    return items;
  }

  private decryptTokens(enc: PreparedRun['tokens']): ProviderTokens {
    return {
      accessToken: this.cipher.decrypt(enc.access, CipherPurpose.ACCESS_TOKEN),
      ...(enc.refresh && {
        refreshToken: this.cipher.decrypt(
          enc.refresh,
          CipherPurpose.REFRESH_TOKEN,
        ),
      }),
      ...(enc.expiresAt && { expiresAt: enc.expiresAt }),
    };
  }

  /** 토큰 갱신 후 암호화 저장. 실패하면 AUTH_EXPIRED로 던져 연결을 만료시킨다 */
  private async refresh(
    connectionId: string,
    tokens: ProviderTokens,
  ): Promise<ProviderTokens> {
    let next: ProviderTokens;
    try {
      next = await this.adapter.refreshTokens(tokens);
    } catch (error) {
      if (error instanceof ProviderError && !isAuthError(error)) throw error;
      throw new ProviderError('AUTH_EXPIRED');
    }
    await this.prisma.paymentConnection.update({
      where: { id: connectionId },
      data: {
        accessTokenEnc: this.cipher.encrypt(
          next.accessToken,
          CipherPurpose.ACCESS_TOKEN,
        ),
        refreshTokenEnc: next.refreshToken
          ? this.cipher.encrypt(next.refreshToken, CipherPurpose.REFRESH_TOKEN)
          : null,
        tokenExpiresAt: next.expiresAt ?? null,
        ...(next.scope && { scope: next.scope }),
      },
    });
    return next;
  }

  /**
   * 연결 만료(3-3 ACTIVE → EXPIRED): 연결과 결제수단 EXPIRED, expiredAt 기록, 토큰 즉시 삭제(8-2).
   * 다시 연결하면 [min(expiredAt, lastSyncedAt) − 72시간, now]를 소급한다.
   */
  async expire(
    connectionId: string,
    errorCode: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.paymentConnection.update({
        where: { id: connectionId },
        data: {
          status: 'EXPIRED',
          expiredAt: now,
          accessTokenEnc: null,
          refreshTokenEnc: null,
          tokenExpiresAt: null,
          lastSyncStatus: 'EXPIRED',
          lastSyncErrorCode: errorCode.slice(0, 40),
        },
      }),
      this.prisma.paymentMethod.updateMany({
        where: { connectionId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      }),
    ]);
  }

  /** 이 사용자가 활성 멤버인 진행 중(삭제 안 됨) 여정들 */
  async ongoingMemberships(userId: string) {
    const rows = await this.prisma.membership.findMany({
      where: {
        userId,
        leftAt: null,
        group: {
          deletedAt: null,
          trip: { status: 'ONGOING', deletedAt: null },
        },
      },
      select: {
        id: true,
        group: {
          select: {
            trip: { select: { id: true, startAt: true, autoEndAt: true } },
          },
        },
      },
    });
    return rows.flatMap((r) =>
      r.group.trip
        ? [
            {
              membershipId: r.id,
              tripId: r.group.trip.id,
              startAt: r.group.trip.startAt,
              autoEndAt: r.group.trip.autoEndAt,
            },
          ]
        : [],
    );
  }

  // ─── 트리거별 진입점 ───

  /** FR-303 → FR-404: 여정 시작 시 전 멤버의 ACTIVE 연결을 [startAt, now]로 소급. 실패한 연결이 있으면 마지막에 던진다 */
  async backfillTripStart(tripId: string): Promise<SyncOutcome[]> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null, status: 'ONGOING' },
      select: {
        startAt: true,
        group: {
          select: {
            memberships: {
              where: { leftAt: null, userId: { not: null } },
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!trip) return [];
    const userIds = trip.group.memberships.flatMap((m) =>
      m.userId ? [m.userId] : [],
    );
    return this.backfillUsers(userIds, 'TRIP_START', trip.startAt);
  }

  /** FR-204 → FR-404: 진행 중 여정에 참여한 멤버의 ACTIVE 연결을 [startAt, now]로 소급 */
  async backfillJoin(membershipId: string): Promise<SyncOutcome[]> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        leftAt: null,
        userId: { not: null },
        group: {
          deletedAt: null,
          trip: { status: 'ONGOING', deletedAt: null },
        },
      },
      select: {
        userId: true,
        group: { select: { trip: { select: { startAt: true } } } },
      },
    });
    if (!membership?.userId || !membership.group.trip) return [];
    return this.backfillUsers(
      [membership.userId],
      'JOIN',
      membership.group.trip.startAt,
    );
  }

  /**
   * 자동 종료 직전 FINAL 동기화(FR-305, trip.auto-ending). 여정이 아직 ONGOING일 때 활성 멤버의 ACTIVE 연결을 한 번 더 가져온다.
   * 종료 후 인입 금지라 이 동기화가 마지막 인입이다. 실패해도 종료는 막지 않는다(결과는 SyncRun에 남는다).
   */
  async finalSync(tripId: string): Promise<SyncOutcome[]> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null, status: 'ONGOING' },
      select: {
        group: {
          select: {
            memberships: {
              where: { leftAt: null, userId: { not: null } },
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!trip) return [];
    const userIds = trip.group.memberships.flatMap((m) =>
      m.userId ? [m.userId] : [],
    );
    const connections = await this.prisma.paymentConnection.findMany({
      where: { userId: { in: userIds }, status: 'ACTIVE' },
      select: { id: true },
    });
    return Promise.all(connections.map((c) => this.run(c.id, 'FINAL')));
  }

  private async backfillUsers(
    userIds: string[],
    trigger: 'TRIP_START' | 'JOIN',
    fromAt: Date,
  ): Promise<SyncOutcome[]> {
    if (userIds.length === 0) return [];
    const connections = await this.prisma.paymentConnection.findMany({
      where: { userId: { in: userIds }, status: 'ACTIVE' },
      select: { id: true },
    });
    const outcomes: SyncOutcome[] = [];
    for (const c of connections) {
      outcomes.push(await this.run(c.id, trigger, { requestedFromAt: fromAt }));
    }
    const failed = outcomes.filter(
      (o) => o.status === 'FAILED' || o.status === 'EXPIRED',
    );
    if (failed.length > 0) {
      throw new BackfillFailedError(trigger, failed);
    }
    return outcomes;
  }

  /** 다시 연결 확정 직후(FR-805 → FR-404): [min(expiredAt, lastSyncedAt) − 72시간, now] */
  reconnectFromAt(
    expiredAt: Date | null,
    lastSyncedAt: Date | null,
  ): Date | null {
    const times = [expiredAt, lastSyncedAt].flatMap((t) =>
      t ? [t.getTime()] : [],
    );
    if (times.length === 0) return null;
    return new Date(Math.min(...times) - SYNC_OVERLAP_MS);
  }

  /**
   * 10분 주기 잡(FR-401): 10분 지난 연결 시도 정리 → 진행 중 여정이 있는 사용자의 ACTIVE 연결마다 동기화.
   * 소급 리스너가 실패했어도 조회 창 계산(자가 복구)이 덮이지 않은 구간부터 다시 가져온다.
   */
  async runScheduled(now: Date = new Date()): Promise<SyncJobResult> {
    const expiredAttempts = await this.sweepAttempts(now);
    const connections = await this.prisma.paymentConnection.findMany({
      where: {
        status: 'ACTIVE',
        methods: { some: { status: 'ACTIVE' } },
        user: {
          memberships: {
            some: {
              leftAt: null,
              group: {
                deletedAt: null,
                trip: { status: 'ONGOING', deletedAt: null },
              },
            },
          },
        },
      },
      select: { id: true },
      orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
    });
    const result: SyncJobResult = {
      connections: connections.length,
      ok: 0,
      failed: 0,
      expired: 0,
      skipped: 0,
      fetched: 0,
      imported: 0,
      expiredAttempts,
    };
    for (const c of connections) {
      let outcome: SyncOutcome;
      try {
        outcome = await this.run(c.id, 'SCHEDULED');
      } catch (error) {
        this.logger.error(
          { connectionId: c.id, errorCode: errorCodeOf(error), err: error },
          '주기 동기화 실패',
        );
        result.failed += 1;
        continue;
      }
      result.fetched += outcome.fetched;
      result.imported += outcome.imported;
      if (outcome.status === 'OK') result.ok += 1;
      else if (outcome.status === 'FAILED') result.failed += 1;
      else if (outcome.status === 'EXPIRED') result.expired += 1;
      else result.skipped += 1;
    }
    return result;
  }

  /**
   * 10분이 지난 연결 시도를 EXPIRED로 바꾸고 후보 목록을 지운다(8-2).
   * 그 시도가 콜백에서 만든 연결에 결제수단이 하나도 없으면 토큰을 지우고 REVOKED로 닫는다.
   */
  async sweepAttempts(now: Date = new Date()): Promise<number> {
    const stale = await this.prisma.connectionAttempt.findMany({
      where: {
        status: { in: ['WAITING', 'AUTHORIZED'] },
        expiresAt: { lt: now },
      },
      select: { id: true, connectionId: true, purpose: true },
    });
    if (stale.length === 0) return 0;
    await this.prisma.connectionAttempt.updateMany({
      where: { id: { in: stale.map((a) => a.id) } },
      data: { status: 'EXPIRED', candidates: Prisma.DbNull },
    });
    const orphanIds = [
      ...new Set(
        stale.flatMap((a) => (a.connectionId ? [a.connectionId] : [])),
      ),
    ];
    for (const id of orphanIds) {
      const conn = await this.prisma.paymentConnection.findUnique({
        where: { id },
        select: {
          status: true,
          accessTokenEnc: true,
          refreshTokenEnc: true,
          _count: { select: { methods: true } },
        },
      });
      if (!conn || conn._count.methods > 0 || conn.status === 'REVOKED')
        continue;
      await this.revokeAtProvider(
        id,
        conn.accessTokenEnc,
        conn.refreshTokenEnc,
      );
      await this.prisma.paymentConnection.update({
        where: { id },
        data: {
          status: 'REVOKED',
          accessTokenEnc: null,
          refreshTokenEnc: null,
          tokenExpiresAt: null,
        },
      });
    }
    return stale.length;
  }

  /** 제공자 쪽 토큰 폐기(실패해도 우리 쪽 토큰은 지운다) */
  async revokeAtProvider(
    connectionId: string,
    access: Uint8Array | null,
    refresh: Uint8Array | null,
  ): Promise<void> {
    if (!access) return;
    try {
      await this.adapter.revoke(
        this.decryptTokens({ access, refresh, expiresAt: null }),
      );
    } catch (error) {
      this.logger.warn(
        { connectionId, errorCode: errorCodeOf(error) },
        '제공자 토큰 폐기 실패',
      );
    }
  }
}

/** 소급 동기화 중 실패한 연결이 있음. 리스너가 잡아 로그로 남기고, 다음 주기 잡이 따라잡는다 */
export class BackfillFailedError extends Error {
  readonly code: string;

  constructor(
    readonly trigger: string,
    readonly outcomes: SyncOutcome[],
  ) {
    super(`backfill ${trigger} failed for ${outcomes.length} connection(s)`);
    this.name = 'BackfillFailedError';
    this.code = outcomes[0]?.errorCode ?? 'BACKFILL_FAILED';
  }
}
