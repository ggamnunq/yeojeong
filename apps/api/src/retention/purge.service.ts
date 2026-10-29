import { Injectable, Logger } from '@nestjs/common';
import type {
  PurgeJobResult,
  PurgeStep,
  PurgeStepResult,
} from '@yeojeong/shared';
import { AccountDeletionService } from '../account/account-deletion.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RETENTION, cutoff } from './retention-policy.js';

type Tx = Prisma.TransactionClient;

interface StepOutcome {
  count: number;
  hasMore: boolean;
}

/** 한 번 실행에서 단계마다 처리하는 상한. 남으면 hasMore = true이고 다음 실행(매일)이 이어서 지운다 */
export const PURGE_LIMITS = {
  rows: 5_000,
  groups: 100,
  inactiveUsers: 20,
} as const;

// Cloud Run 요청 제한(30초) 안에서 단계 하나가 끝나게 둔다
const TX_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;

/**
 * 파기 배치(기능명세 8-8). 단계마다 별도 트랜잭션이고, 같은 잡의 동시 실행은 advisory lock으로 막는다
 * (잠금을 못 잡은 단계는 LOCKED로 건너뛴다). 단계마다 건수만 로그로 남긴다. 기준 표는 src/retention/README.md.
 */
@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  async run({
    dryRun = false,
    now = new Date(),
  }: { dryRun?: boolean; now?: Date } = {}): Promise<PurgeJobResult> {
    const startedAt = new Date();
    const steps: PurgeStepResult[] = [];
    for (const [step, work] of this.steps(now)) {
      const result = await this.inTransaction(step, dryRun, (tx) =>
        work(tx, dryRun),
      );
      this.logger.log({ ...result, dryRun }, '파기 단계');
      steps.push(result);
    }
    return {
      dryRun,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      steps,
    };
  }

  private steps(
    now: Date,
  ): [PurgeStep, (tx: Tx, dryRun: boolean) => Promise<StepOutcome>][] {
    const softDeleted = cutoff(now, RETENTION.softDeletedGroup);
    const groupRecords = cutoff(now, RETENTION.groupRecords);
    const rawPayload = cutoff(now, RETENTION.rawPayload);
    const removedMethod = cutoff(now, RETENTION.removedPaymentMethod);
    const revokedConnection = cutoff(now, RETENTION.revokedConnection);
    const inactive = cutoff(now, RETENTION.inactiveUser);
    const consent = cutoff(now, RETENTION.withdrawnConsent);
    const accessLog = cutoff(now, RETENTION.accessLog);
    const deletion = cutoff(now, RETENTION.accountDeletion);
    const counters = cutoff(now, RETENTION.cardImportCounters);
    const { rows, groups } = PURGE_LIMITS;

    return [
      [
        'SOFT_DELETED_GROUPS',
        (tx, dryRun) => {
          const where: Prisma.GroupWhereInput = {
            OR: [
              { deletedAt: { lte: softDeleted } },
              { trip: { deletedAt: { lte: softDeleted } } },
            ],
          };
          return sweep(dryRun, groups, {
            count: () => tx.group.count({ where }),
            find: (take) =>
              tx.group.findMany({ where, select: { id: true }, take }),
            remove: (ids) => this.purgeGroups(tx, ids),
          });
        },
      ],
      [
        'EXPIRED_GROUP_RECORDS',
        (tx, dryRun) => {
          // 여정 종료일 = 실제 종료 시각(endedAt). 종료되지 않은 여정은 예정 종료 시각(autoEndAt)
          const where: Prisma.GroupWhereInput = {
            trip: {
              OR: [
                { endedAt: { lte: groupRecords } },
                { endedAt: null, autoEndAt: { lte: groupRecords } },
              ],
            },
          };
          return sweep(dryRun, groups, {
            count: () => tx.group.count({ where }),
            find: (take) =>
              tx.group.findMany({ where, select: { id: true }, take }),
            remove: (ids) => this.purgeGroups(tx, ids),
          });
        },
      ],
      [
        'RAW_PAYLOADS',
        (tx, dryRun) => {
          const where: Prisma.TransactionWhereInput = {
            rawPayloadEnc: { not: null },
            importedAt: { lte: rawPayload },
          };
          return sweep(dryRun, rows, {
            count: () => tx.transaction.count({ where }),
            find: (take) =>
              tx.transaction.findMany({ where, select: { id: true }, take }),
            remove: (ids) =>
              tx.transaction.updateMany({
                where: { id: { in: ids } },
                data: { rawPayloadEnc: null },
              }),
          });
        },
      ],
      [
        'CONNECTION_ATTEMPTS',
        (tx, dryRun) => {
          const where: Prisma.ConnectionAttemptWhereInput = {
            expiresAt: { lte: now },
          };
          return sweep(dryRun, rows, {
            count: () => tx.connectionAttempt.count({ where }),
            find: (take) =>
              tx.connectionAttempt.findMany({
                where,
                select: { id: true },
                take,
              }),
            remove: (ids) =>
              tx.connectionAttempt.deleteMany({ where: { id: { in: ids } } }),
          });
        },
      ],
      [
        'SIGNUP_TICKETS',
        (tx, dryRun) => {
          const where: Prisma.SignupTicketWhereInput = {
            expiresAt: { lte: now },
          };
          return sweep(dryRun, rows, {
            count: () => tx.signupTicket.count({ where }),
            find: (take) =>
              tx.signupTicket.findMany({ where, select: { id: true }, take }),
            remove: (ids) =>
              tx.signupTicket.deleteMany({ where: { id: { in: ids } } }),
          });
        },
      ],
      [
        'SESSIONS',
        (tx, dryRun) => {
          const where: Prisma.SessionWhereInput = {
            OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
          };
          return sweep(dryRun, rows, {
            count: () => tx.session.count({ where }),
            find: (take) =>
              tx.session.findMany({ where, select: { id: true }, take }),
            remove: (ids) =>
              tx.session.deleteMany({ where: { id: { in: ids } } }),
          });
        },
      ],
      [
        'REMOVED_PAYMENT_METHODS',
        (tx, dryRun) => {
          const where: Prisma.PaymentMethodWhereInput = {
            status: 'REMOVED',
            removedAt: { lte: removedMethod },
            transactions: { none: {} },
          };
          return sweep(dryRun, rows, {
            count: () => tx.paymentMethod.count({ where }),
            find: (take) =>
              tx.paymentMethod.findMany({ where, select: { id: true }, take }),
            remove: (ids) =>
              tx.paymentMethod.deleteMany({ where: { id: { in: ids } } }),
          });
        },
      ],
      [
        'REVOKED_CONNECTIONS',
        (tx, dryRun) => {
          // REVOKED 뒤에는 행이 바뀌지 않으므로 updatedAt을 해제 시각으로 본다
          const where: Prisma.PaymentConnectionWhereInput = {
            status: 'REVOKED',
            updatedAt: { lte: revokedConnection },
            methods: { none: {} },
          };
          return sweep(dryRun, rows, {
            count: () => tx.paymentConnection.count({ where }),
            find: (take) =>
              tx.paymentConnection.findMany({
                where,
                select: { id: true },
                take,
              }),
            remove: (ids) =>
              tx.paymentConnection.deleteMany({ where: { id: { in: ids } } }),
          });
        },
      ],
      [
        'INACTIVE_USERS',
        (tx, dryRun) => {
          const where: Prisma.UserWhereInput = {
            lastLoginAt: { lte: inactive },
          };
          return sweep(dryRun, PURGE_LIMITS.inactiveUsers, {
            count: () => tx.user.count({ where }),
            find: (take) =>
              tx.user.findMany({
                where,
                select: { id: true },
                orderBy: { lastLoginAt: 'asc' },
                take,
              }),
            remove: (ids) => this.deleteInactiveUsers(ids, now),
          });
        },
      ],
      [
        'USER_CONSENTS',
        (tx, dryRun) => {
          const where: Prisma.UserConsentWhereInput = {
            withdrawnAt: { lte: consent },
          };
          return sweep(dryRun, rows, {
            count: () => tx.userConsent.count({ where }),
            find: (take) =>
              tx.userConsent.findMany({ where, select: { id: true }, take }),
            remove: (ids) =>
              tx.userConsent.deleteMany({ where: { id: { in: ids } } }),
          });
        },
      ],
      [
        'ACCESS_LOGS',
        (tx, dryRun) => {
          const where: Prisma.AccessLogWhereInput = { at: { lte: accessLog } };
          return sweep(dryRun, rows, {
            count: () => tx.accessLog.count({ where }),
            find: (take) =>
              tx.accessLog.findMany({ where, select: { id: true }, take }),
            remove: (ids) =>
              tx.accessLog.deleteMany({ where: { id: { in: ids } } }),
          });
        },
      ],
      [
        'ACCOUNT_DELETIONS',
        (tx, dryRun) => {
          // 처리하지 않은 채 남은 요청(요청 코드 만료 등)도 요청일 + 3년이면 지운다
          const where: Prisma.AccountDeletionWhereInput = {
            OR: [
              { completedAt: { lte: deletion } },
              { completedAt: null, requestedAt: { lte: deletion } },
            ],
          };
          return sweep(dryRun, rows, {
            count: () => tx.accountDeletion.count({ where }),
            find: (take) =>
              tx.accountDeletion.findMany({
                where,
                select: { id: true },
                take,
              }),
            remove: (ids) =>
              tx.accountDeletion.deleteMany({ where: { id: { in: ids } } }),
          });
        },
      ],
      [
        'CARD_IMPORT_COUNTERS',
        async (tx, dryRun) => {
          // 행이 작고(사용자·기관·날짜·개수) 많지 않아 한 번에 지운다. 잠금은 만료된 것만(진행 중 조회는 건드리지 않는다)
          const failures = { lastFailedAt: { lte: counters } };
          const usage = { day: { lte: counters } };
          const locks = { expiresAt: { lte: now } };
          if (dryRun) {
            const counts = await Promise.all([
              tx.cardImportLoginFailure.count({ where: failures }),
              tx.codefDailyUsage.count({ where: usage }),
              tx.cardImportLock.count({ where: locks }),
            ]);
            return { count: counts.reduce((a, b) => a + b, 0), hasMore: false };
          }
          const results = await Promise.all([
            tx.cardImportLoginFailure.deleteMany({ where: failures }),
            tx.codefDailyUsage.deleteMany({ where: usage }),
            tx.cardImportLock.deleteMany({ where: locks }),
          ]);
          return {
            count: results.reduce((a, r) => a + r.count, 0),
            hasMore: false,
          };
        },
      ],
    ];
  }

  private async inTransaction(
    step: PurgeStep,
    dryRun: boolean,
    work: (tx: Tx) => Promise<StepOutcome>,
  ): Promise<PurgeStepResult> {
    return this.prisma.$transaction(async (tx) => {
      // 드라이런은 읽기만 하므로 잠그지 않는다(실제 실행을 막지 않게)
      if (!dryRun) {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext('yeojeong:jobs:purge')) AS locked`;
        if (!locked) {
          return { step, count: 0, hasMore: false, skipped: 'LOCKED' as const };
        }
      }
      return { step, ...(await work(tx)) };
    }, TX_OPTIONS);
  }

  /**
   * 그룹·여정과 그 아래 기록 일체를 지운다(RESTRICT FK 순서). 공동·개인 결제, 부담, 변경 이력, 정산 스냅샷,
   * 1회성 이벤트, 멤버십(탈퇴한 멤버 포함). 이 여정에만 쓰인 거래 원본(과 그 동일 사용자 중복 표시 행)도 함께 지운다.
   */
  private async purgeGroups(tx: Tx, groupIds: string[]) {
    const trips = await tx.trip.findMany({
      where: { groupId: { in: groupIds } },
      select: { id: true },
    });
    const tripIds = trips.map((t) => t.id);
    // 직접 입력한 지갑 항목(source MANUAL)은 여정이 지워져도 사용자 지갑에 남긴다(연결만 끊긴다)
    const linked = await tx.expense.findMany({
      where: {
        tripId: { in: tripIds },
        transaction: { is: { source: 'PROVIDER' } },
      },
      select: { transactionId: true },
      distinct: ['transactionId'],
    });
    const candidateTxIds = linked.flatMap((e) =>
      e.transactionId ? [e.transactionId] : [],
    );

    await tx.expenseChangeLog.deleteMany({
      where: { tripId: { in: tripIds } },
    });
    // ExpenseShare·환불 자식은 CASCADE
    await tx.expense.deleteMany({ where: { tripId: { in: tripIds } } });
    // SettlementMember·SettlementTransfer는 CASCADE
    await tx.settlement.deleteMany({ where: { tripId: { in: tripIds } } });
    await tx.tripEvent.deleteMany({ where: { tripId: { in: tripIds } } });
    // users.last_viewed_trip_id는 SET NULL
    await tx.trip.deleteMany({ where: { id: { in: tripIds } } });
    await tx.membership.deleteMany({ where: { groupId: { in: groupIds } } });
    const deleted = await tx.group.deleteMany({
      where: { id: { in: groupIds } },
    });

    if (candidateTxIds.length > 0) {
      // 겹치는 다른 여정(미결 Q-13)에서 아직 쓰는 거래는 남긴다
      const stillUsed = await tx.expense.findMany({
        where: { transactionId: { in: candidateTxIds } },
        select: { transactionId: true },
      });
      const used = new Set(stillUsed.map((e) => e.transactionId));
      const orphanIds = candidateTxIds.filter((id) => !used.has(id));
      if (orphanIds.length > 0) {
        const duplicates = await tx.transaction.findMany({
          where: {
            sameUserDuplicateOfId: { in: orphanIds },
            expenses: { none: {} },
          },
          select: { id: true },
        });
        await tx.transaction.deleteMany({
          where: { id: { in: [...orphanIds, ...duplicates.map((d) => d.id)] } },
        });
      }
    }
    return deleted;
  }

  /**
   * 7단계: 마지막 로그인 + 3년이면 탈퇴로 보고 회원마다 FR-109 파이프라인(channel INACTIVE)을 돈다.
   * 회원마다 자기 트랜잭션이라(이 단계의 잠금 트랜잭션과 별개) 한 명이 실패해도 앞의 회원은 지워진 채로 남는다.
   */
  private async deleteInactiveUsers(ids: string[], now: Date) {
    let count = 0;
    for (const id of ids) {
      const result = await this.accountDeletion.deleteAccount(id, {
        channel: 'INACTIVE',
        now,
      });
      if (result.status === 'DELETED') count += 1;
    }
    return { count };
  }
}

/** 드라이런이면 세기만 하고, 아니면 상한까지 id를 골라 지운다 */
async function sweep(
  dryRun: boolean,
  limit: number,
  ops: {
    count: () => Promise<number>;
    find: (take: number) => Promise<{ id: string }[]>;
    remove: (ids: string[]) => Promise<{ count: number }>;
  },
): Promise<StepOutcome> {
  if (dryRun) return { count: await ops.count(), hasMore: false };
  const rows = await ops.find(limit + 1);
  const ids = rows.slice(0, limit).map((row) => row.id);
  if (ids.length === 0) return { count: 0, hasMore: false };
  const { count } = await ops.remove(ids);
  return { count, hasMore: rows.length > limit };
}
