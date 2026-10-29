import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ADMIN_CODEF_DAYS,
  ADMIN_CODEF_TOP_USERS,
  CARD_IMPORT_FETCH_LIMIT,
  CARD_IMPORT_LOGIN_LIMIT,
  type AdminCodefDay,
  type AdminCodefResultCount,
  type AdminCodefUsage,
} from '@yeojeong/shared';
import { CardImportLimits, kstDay } from '../card-import/card-import-limits.js';
import { CodefConfig } from '../card-import/codef/codef.config.js';
import {
  FeatureFlags,
  parseAllowedUserIds,
  parseCardImportMode,
} from '../common/features.js';
import { kstDate, toKstIso } from '../expenses/kst.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 성공·실패 어느 쪽도 아닌 결과(추가 인증으로 넘어감 · 진행 중) */
const NEUTRAL_RESULTS = new Set(['OK', 'TWO_WAY_REQUIRED', 'PENDING']);

interface FetchRow {
  day: string;
  step: string | null;
  result: string | null;
  organization: string | null;
  n: number;
}

/**
 * CODEF 호출 현황(읽기 전용). S8의 기존 카운터만 읽는다(apps/api/src/card-import/README.md "호출 보호"):
 * codef_daily_usage(일일 예산 · 7일), access_logs FETCH_CARD_APPROVALS(사용자별 횟수·결과 코드 · 1년),
 * card_import_login_failures(쿨다운), card_import_two_way_sessions(이어가기 예약), card_import_locks(진행 중), codef_pending_deletions.
 * 사용자 ID·닉네임·건수·결과 코드·기관 코드 집계만 내보낸다(조회 내용 없음 — 원래 저장하지 않는다).
 */
@Injectable()
export class AdminCodefService {
  private readonly featureCardImport: string;
  private readonly allowlistCount: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: CardImportLimits,
    private readonly codef: CodefConfig,
    private readonly features: FeatureFlags,
    config: ConfigService,
  ) {
    this.featureCardImport = parseCardImportMode(
      config.get<string>('FEATURE_CARD_IMPORT'),
    );
    this.allowlistCount = parseAllowedUserIds(
      config.get<string>('CARD_IMPORT_ALLOWED_USER_IDS'),
    ).size;
  }

  async usage(now = new Date()): Promise<AdminCodefUsage> {
    const today = kstDay(now);
    const todayStart = new Date(today.getTime() - KST_OFFSET_MS);
    const firstDay = new Date(
      today.getTime() - (ADMIN_CODEF_DAYS - 1) * DAY_MS,
    );
    const since = new Date(firstDay.getTime() - KST_OFFSET_MS);
    const cooldownSince = new Date(
      now.getTime() - CARD_IMPORT_LOGIN_LIMIT.COOLDOWN_SECONDS * 1000,
    );

    const [
      usageRows,
      fetchRows,
      topRows,
      cooldown,
      reserved,
      inProgress,
      pending,
    ] = await Promise.all([
      this.prisma.codefDailyUsage.findMany({
        where: { day: { gte: firstDay } },
        select: { day: true, calls: true },
      }),
      this.prisma.$queryRaw<FetchRow[]>`
          SELECT to_char((at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS day,
                 details->>'step' AS step,
                 details->>'result' AS result,
                 details->>'organization' AS organization,
                 count(*)::int AS n
          FROM access_logs
          WHERE action = 'FETCH_CARD_APPROVALS' AND at >= ${since}
          GROUP BY 1, 2, 3, 4`,
      this.prisma.$queryRaw<{ user_id: string; n: number }[]>`
          SELECT user_id, count(*)::int AS n
          FROM access_logs
          WHERE action = 'FETCH_CARD_APPROVALS' AND at >= ${todayStart}
            AND details->>'step' = 'START'
          GROUP BY user_id
          ORDER BY n DESC, user_id
          LIMIT ${ADMIN_CODEF_TOP_USERS}`,
      // 쿨다운: 30분 안 3회 이상 실패하고 마지막 실패 뒤 30분이 지나지 않은 사용자(card-import-limits.ts cooldownUntil과 같은 기준)
      this.prisma.$queryRaw<{ n: number }[]>`
          SELECT count(DISTINCT user_id)::int AS n
          FROM card_import_login_failures
          WHERE failures >= ${CARD_IMPORT_LOGIN_LIMIT.FAILURES} AND last_failed_at > ${cooldownSince}`,
      this.prisma.cardImportTwoWaySession.aggregate({
        where: { budgetDay: today, expiresAt: { gt: now } },
        _sum: { callsLeft: true },
      }),
      this.prisma.cardImportLock.count({ where: { expiresAt: { gt: now } } }),
      this.prisma.codefPendingDeletion.aggregate({
        _count: { _all: true },
        _min: { createdAt: true },
      }),
    ]);

    const todayKey = kstDate(now);
    const usageByDay = new Map(
      usageRows.map((row) => [row.day.toISOString().slice(0, 10), row.calls]),
    );
    const days = new Map<string, AdminCodefDay>();
    for (let i = 0; i < ADMIN_CODEF_DAYS; i += 1) {
      const key = new Date(firstDay.getTime() + i * DAY_MS)
        .toISOString()
        .slice(0, 10);
      days.set(key, {
        day: key,
        codefCalls: usageByDay.get(key) ?? null,
        fetchStarts: 0,
        successes: 0,
        failures: 0,
      });
    }
    // 오늘 카운터 행이 아직 없으면 0(보관 기간이 지나 지워진 날만 null)
    const todayRow = days.get(todayKey);
    if (todayRow && todayRow.codefCalls === null) todayRow.codefCalls = 0;

    const byResult = new Map<string, AdminCodefResultCount>();
    const byOrganization = new Map<string, number>();
    for (const row of fetchRows) {
      const day = days.get(row.day);
      if (!day) continue;
      const step = row.step ?? 'UNKNOWN';
      const result = row.result ?? 'UNKNOWN';
      if (step === 'START') day.fetchStarts += row.n;
      if (result === 'OK') day.successes += row.n;
      else if (!NEUTRAL_RESULTS.has(result)) day.failures += row.n;
      if (row.day !== todayKey) continue;
      const key = `${step}|${result}`;
      const entry = byResult.get(key) ?? { step, result, count: 0 };
      entry.count += row.n;
      byResult.set(key, entry);
      if (step === 'START' && row.organization) {
        byOrganization.set(
          row.organization,
          (byOrganization.get(row.organization) ?? 0) + row.n,
        );
      }
    }

    const topIds = topRows.map((row) => row.user_id);
    const nicknames = new Map(
      topIds.length === 0
        ? []
        : (
            await this.prisma.user.findMany({
              where: { id: { in: topIds } },
              select: { id: true, nickname: true },
            })
          ).map((u) => [u.id, u.nickname]),
    );

    const calls = usageByDay.get(todayKey) ?? 0;
    const budget = this.limits.dailyBudget;
    const todayDay = days.get(todayKey);
    return {
      asOf: toKstIso(now),
      today: {
        day: todayKey,
        calls,
        budget,
        reserved: reserved._sum.callsLeft ?? 0,
        inProgress,
        remaining: Math.max(0, budget - calls),
        fetchStarts: todayDay?.fetchStarts ?? 0,
        successes: todayDay?.successes ?? 0,
        failures: todayDay?.failures ?? 0,
        byResult: [...byResult.values()].sort(
          (a, b) =>
            b.count - a.count ||
            a.step.localeCompare(b.step) ||
            a.result.localeCompare(b.result),
        ),
        byOrganization: [...byOrganization.entries()]
          .map(([organization, count]) => ({ organization, count }))
          .sort(
            (a, b) =>
              b.count - a.count || a.organization.localeCompare(b.organization),
          ),
      },
      days: [...days.values()],
      topUsers: topRows.map((row) => ({
        userId: row.user_id,
        nickname: nicknames.get(row.user_id) ?? null,
        count: row.n,
        limit: CARD_IMPORT_FETCH_LIMIT.DAILY,
      })),
      loginCooldownUsers: cooldown[0]?.n ?? 0,
      pendingDeletions: {
        count: pending._count._all,
        oldestCreatedAt: pending._min.createdAt
          ? toKstIso(pending._min.createdAt)
          : null,
      },
      flags: {
        featureCardImport: this.featureCardImport,
        effectiveMode: this.features.cardImportMode,
        codefEnv: this.codef.env,
        codefLoginMode: this.codef.loginMode,
        allowlistCount: this.allowlistCount,
      },
    };
  }
}
