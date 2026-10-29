import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CARD_IMPORT_FETCH_LIMIT,
  CARD_IMPORT_LOGIN_LIMIT,
  type CardImportRetryDetails,
} from '@yeojeong/shared';
import { AppException } from '../common/errors/index.js';
import { kstDate } from '../expenses/kst.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** 서비스 전체 CODEF 일일 호출 예산 기본값(env CODEF_DAILY_CALL_BUDGET) */
export const DEFAULT_CODEF_DAILY_CALL_BUDGET = 100;
/**
 * 새 조회 한 번에 필요할 수 있는 최대 CODEF 호출 수: (account 모드) 계정 등록 + 조회 + 추가 인증 이어가기 + 계정 삭제 = 4.
 * 남은 예산이 이보다 적으면 새 조회를 시작하지 않는다(시작한 조회의 추가 인증·계정 삭제는 막지 않는다)
 */
export const CODEF_CALLS_PER_FETCH = 4;
/** 조회 잠금 수명: CODEF 조회 제한 시간(30초) + 계정 삭제 재시도 + 여유. 그 안에 요청이 끝나면 바로 푼다 */
const LOCK_TTL_MS = 3 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 날짜 → Prisma @db.Date 값(UTC 자정) */
const kstDay = (now: Date) => new Date(`${kstDate(now)}T00:00:00Z`);
/** 다음 KST 자정 */
const nextKstMidnight = (now: Date) =>
  new Date(
    Date.parse(`${kstDate(now)}T00:00:00Z`) + 86_400_000 - KST_OFFSET_MS,
  );

export function retryDetails(until: Date, now: Date): CardImportRetryDetails {
  return {
    // ISO 8601 UTC(명세 4-12-9). HTTP Retry-After 헤더(초)는 전역 예외 필터가 retryAfterSec으로 붙인다
    retryAfter: until.toISOString(),
    retryAfterSec: Math.max(
      1,
      Math.ceil((until.getTime() - now.getTime()) / 1000),
    ),
  };
}

/** 접근 기록에서 "새 조회"로 센 행(추가 인증 이어가기는 step TWO_WAY라 빠진다) */
const startedFetch = (userId: string, gte: Date) => ({
  userId,
  action: 'FETCH_CARD_APPROVALS',
  at: { gte },
  details: { path: ['step'], equals: 'START' },
});

/**
 * 카드 승인내역 불러오기 호출 보호(S8 — CODEF 데모 키 호출 제한·카드사 계정 잠김 예방). 모두 DB 기준이라 Cloud Run 인스턴스가 여럿이어도 같다.
 * - 동시 1건: card_import_locks 행(만료 시각이 지난 행만 다시 잡힌다). 409 CARD_IMPORT_IN_PROGRESS
 * - 사용자 횟수: 접근 기록(FETCH_CARD_APPROVALS, step START)으로 10분 3회·KST 하루 10회. 429 CARD_IMPORT_RATE_LIMITED
 * - 로그인 연속 실패: card_import_login_failures(사용자·기관). 30분 안 3회째부터 30분 429 CARD_IMPORT_LOGIN_COOLDOWN
 * - 서비스 전체 일일 예산: codef_daily_usage(KST 날짜별 CODEF API 호출 수). 남은 예산 < 4면 503 CARD_IMPORT_DAILY_LIMIT
 * 테이블에는 사용자 ID·날짜·개수·기관 코드만 둔다(내역·로그인 정보 없음).
 */
@Injectable()
export class CardImportLimits {
  private readonly logger = new Logger(CardImportLimits.name);
  readonly dailyBudget: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = config.get<string>('CODEF_DAILY_CALL_BUDGET')?.trim();
    const value = raw ? Number(raw) : DEFAULT_CODEF_DAILY_CALL_BUDGET;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `CODEF_DAILY_CALL_BUDGET는 0 이상의 정수여야 합니다: ${raw}`,
      );
    }
    this.dailyBudget = value;
  }

  // ─── 동시 1건 ───

  /** 잠금을 잡고 푸는 함수를 돌려준다. 이미 진행 중이면 409 */
  async acquire(
    userId: string,
    now = new Date(),
  ): Promise<() => Promise<void>> {
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    const rows = await this.prisma.$queryRaw<{ user_id: string }[]>`
      INSERT INTO card_import_locks (user_id, expires_at)
      VALUES (${userId}::uuid, ${expiresAt})
      ON CONFLICT (user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at
      WHERE card_import_locks.expires_at <= ${now}
      RETURNING user_id`;
    if (rows.length === 0) throw AppException.of('CARD_IMPORT_IN_PROGRESS');
    return async () => {
      try {
        await this.prisma.cardImportLock.deleteMany({
          where: { userId, expiresAt },
        });
      } catch {
        // 못 풀어도 만료 시각에 풀린다
        this.logger.warn('카드 승인내역 조회 잠금을 풀지 못함');
      }
    };
  }

  // ─── 사용자 횟수 ───

  async startedToday(userId: string, now = new Date()): Promise<number> {
    return this.prisma.accessLog.count({
      where: startedFetch(
        userId,
        new Date(kstDay(now).getTime() - KST_OFFSET_MS),
      ),
    });
  }

  /** min(사용자 남은 횟수, floor(서비스 남은 예산 / 조회 1회 최소 호출 수)). 예산이 다 떨어졌으면 0 */
  async remainingToday(userId: string, now = new Date()): Promise<number> {
    const [started, calls] = await Promise.all([
      this.startedToday(userId, now),
      this.callsToday(now),
    ]);
    const user = CARD_IMPORT_FETCH_LIMIT.DAILY - started;
    const service = Math.floor(
      (this.dailyBudget - calls) / CODEF_CALLS_PER_FETCH,
    );
    return Math.max(0, Math.min(user, service));
  }

  /** 새 조회 전: 사용자 횟수 → 로그인 쿨다운 → 서비스 예산 순서로 본다 */
  async checkStart(
    userId: string,
    organization: string,
    now = new Date(),
  ): Promise<void> {
    await this.checkUserRate(userId, now);
    await this.checkLoginCooldown(userId, organization, now);
    await this.checkBudget();
  }

  private async checkUserRate(userId: string, now: Date) {
    const windowMs = CARD_IMPORT_FETCH_LIMIT.WINDOW_SECONDS * 1000;
    const recent = await this.prisma.accessLog.findMany({
      where: startedFetch(userId, new Date(now.getTime() - windowMs)),
      orderBy: { at: 'asc' },
      select: { at: true },
    });
    if (recent.length >= CARD_IMPORT_FETCH_LIMIT.COUNT) {
      const oldest = recent[recent.length - CARD_IMPORT_FETCH_LIMIT.COUNT].at;
      throw AppException.of('CARD_IMPORT_RATE_LIMITED', {
        details: retryDetails(new Date(oldest.getTime() + windowMs), now),
      });
    }
    if (
      (await this.startedToday(userId, now)) >= CARD_IMPORT_FETCH_LIMIT.DAILY
    ) {
      throw AppException.of('CARD_IMPORT_RATE_LIMITED', {
        details: retryDetails(nextKstMidnight(now), now),
      });
    }
  }

  // ─── 로그인 연속 실패 ───

  private async checkLoginCooldown(
    userId: string,
    organization: string,
    now: Date,
  ) {
    const row = await this.prisma.cardImportLoginFailure.findUnique({
      where: { userId_organization: { userId, organization } },
      select: { failures: true, lastFailedAt: true },
    });
    const until = row ? cooldownUntil(row, now) : null;
    if (until) {
      throw AppException.of('CARD_IMPORT_LOGIN_COOLDOWN', {
        details: retryDetails(until, now),
      });
    }
  }

  /**
   * 로그인 실패를 센다(30분이 지난 이전 실패는 새로 센다). 3회째면 쿨다운 예외, 아니면 CARD_LOGIN_FAILED { failedAttempts }를 던진다
   */
  async loginFailed(
    userId: string,
    organization: string,
    now = new Date(),
  ): Promise<never> {
    const windowStart = new Date(
      now.getTime() - CARD_IMPORT_LOGIN_LIMIT.WINDOW_SECONDS * 1000,
    );
    const [row] = await this.prisma.$queryRaw<{ failures: number }[]>`
      INSERT INTO card_import_login_failures (user_id, organization, failures, last_failed_at)
      VALUES (${userId}::uuid, ${organization}, 1, ${now})
      ON CONFLICT (user_id, organization) DO UPDATE SET
        failures = CASE WHEN card_import_login_failures.last_failed_at < ${windowStart}
                        THEN 1 ELSE card_import_login_failures.failures + 1 END,
        last_failed_at = EXCLUDED.last_failed_at
      RETURNING failures`;
    const failures = row?.failures ?? 1;
    if (failures >= CARD_IMPORT_LOGIN_LIMIT.FAILURES) {
      throw AppException.of('CARD_IMPORT_LOGIN_COOLDOWN', {
        details: retryDetails(
          new Date(
            now.getTime() + CARD_IMPORT_LOGIN_LIMIT.COOLDOWN_SECONDS * 1000,
          ),
          now,
        ),
      });
    }
    throw AppException.of('CARD_LOGIN_FAILED', {
      details: { failedAttempts: failures },
    });
  }

  /** 로그인에 성공하면(결과를 받았거나 추가 인증까지 갔으면) 연속 실패를 지운다 */
  async loginSucceeded(userId: string, organization: string): Promise<void> {
    await this.prisma.cardImportLoginFailure.deleteMany({
      where: { userId, organization },
    });
  }

  // ─── 서비스 전체 예산 ───

  async callsToday(now = new Date()): Promise<number> {
    const row = await this.prisma.codefDailyUsage.findUnique({
      where: { day: kstDay(now) },
      select: { calls: true },
    });
    return row?.calls ?? 0;
  }

  private async checkBudget() {
    if (this.dailyBudget - (await this.callsToday()) < CODEF_CALLS_PER_FETCH) {
      this.logger.warn(
        { budget: this.dailyBudget },
        'CODEF 일일 호출 예산 소진',
      );
      throw AppException.of('CARD_IMPORT_DAILY_LIMIT');
    }
  }

  /** CODEF API 호출 한 번을 센다(계정 삭제 포함 — 삭제는 예산과 무관하게 늘 보낸다). 실패해도 호출을 막지 않는다 */
  async recordCodefCall(now = new Date()): Promise<void> {
    try {
      await this.prisma.codefDailyUsage.upsert({
        where: { day: kstDay(now) },
        create: { day: kstDay(now), calls: 1 },
        update: { calls: { increment: 1 } },
      });
    } catch {
      this.logger.warn('CODEF 호출 수를 남기지 못함');
    }
  }
}

/** 30분 안 3회 이상 실패했으면 쿨다운이 끝나는 시각, 아니면 null */
export function cooldownUntil(
  row: { failures: number; lastFailedAt: Date },
  now: Date,
): Date | null {
  if (row.failures < CARD_IMPORT_LOGIN_LIMIT.FAILURES) return null;
  const until = new Date(
    row.lastFailedAt.getTime() +
      CARD_IMPORT_LOGIN_LIMIT.COOLDOWN_SECONDS * 1000,
  );
  return until > now ? until : null;
}
