import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CARD_IMPORT_FETCH_LIMIT,
  CARD_IMPORT_LOCK_RISK_LIMIT,
  CARD_IMPORT_LOCKOUT_ACK_LIMIT,
  CARD_IMPORT_LOGIN_LIMIT,
  type CardImportRetryDetails,
  type CardLoginLockedDetails,
} from '@yeojeong/shared';
import { AppException } from '../common/errors/index.js';
import { kstDate } from '../expenses/kst.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** 서비스 전체 CODEF 일일 호출 예산 기본값(env CODEF_DAILY_CALL_BUDGET) */
export const DEFAULT_CODEF_DAILY_CALL_BUDGET = 100;
/**
 * 새 조회 한 번에 미리 예약하는 CODEF 호출 수 = 조회 1 + 추가 인증 이어가기 최대 3(direct),
 * 또는 계정 등록 1 + 조회 1(account). 쓰지 않은 만큼은 조회가 끝나면 돌려준다. 계정 삭제는 예약과 무관하게 늘 보내고 따로 센다
 */
export const CODEF_CALLS_PER_FETCH = 4;
/** 추가 인증 이어가기 시도 상한(같은 토큰) */
export const TWO_WAY_MAX_ATTEMPTS = 3;
/** 연속 실패로 세는 결과(카드사 로그인 정보가 틀렸다) */
export type LoginFailureCode =
  | 'CARD_LOGIN_FAILED'
  | 'CARD_NUMBER_INVALID'
  | 'CARD_PASSWORD_INVALID'
  /** 현대·하나만: 매핑 밖 CODEF 오류(잠김 위험으로 센다, 응답은 502 그대로) */
  | 'CARD_IMPORT_FAILED';
/** 조회 잠금 수명: CODEF 조회 제한 시간(30초) + 계정 삭제 재시도 + 여유. 그 안에 요청이 끝나면 바로 푼다 */
const LOCK_TTL_MS = 3 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 날짜 → Prisma @db.Date 값(UTC 자정) */
export const kstDay = (now: Date) => new Date(`${kstDate(now)}T00:00:00Z`);
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

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** 예약한 CODEF 호출(돌려줄 때 같은 날짜로) */
export interface BudgetReservation {
  day: Date;
  calls: number;
}

/** 이어가기 시도 1번(시도 수를 올리고 예약 호출 1개를 썼다) */
export interface TwoWayAttempt {
  nonceHash: string;
  attempts: number;
  callsLeft: number;
  budgetDay: Date;
}

/**
 * 카드 승인내역 불러오기 호출 보호(S8 — CODEF 데모 키 호출 제한·카드사 계정 잠김 예방). 모두 DB 기준이라 Cloud Run 인스턴스가 여럿이어도 같다.
 * - 동시 1건: card_import_locks 행(만료 시각이 지난 행만 다시 잡힌다). 409 CARD_IMPORT_IN_PROGRESS
 * - 사용자 횟수: 접근 기록(FETCH_CARD_APPROVALS, step START)으로 10분 3회·KST 하루 10회. START 행은 잠금 안에서 CODEF 호출 전에 쓴다. 429 CARD_IMPORT_RATE_LIMITED
 * - 로그인 연속 실패: card_import_login_failures(사용자·기관). 30분 안 3회째부터 30분 429 CARD_IMPORT_LOGIN_COOLDOWN
 * - 서비스 전체 일일 예산: codef_daily_usage(KST 날짜별). 새 조회마다 4를 원자적으로 예약(넘으면 503 CARD_IMPORT_DAILY_LIMIT), 끝나면 남은 만큼 돌려준다
 * - 추가 인증 이어가기: card_import_two_way_sessions(토큰 nonce 해시) — 시도 3회, 결과·종료 오류면 바로 지운다
 * 기록·카운터 쓰기 실패는 삼키지 않는다(조회를 실패시킨다 — fail closed). 테이블에는 사용자 ID·날짜·개수·기관 코드만 둔다.
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

  /** min(사용자 남은 횟수, floor(서비스 남은 예산 / 조회 1회 예약 수)). 예산이 다 떨어졌으면 0 */
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

  /** 새 조회 전(잠금 안): 사용자 횟수 → 로그인 쿨다운. 예산 예약은 reserveFetch */
  /**
   * 새 조회 시작 검사. lockRisk(현대·하나)면 일반 연속 실패 대신 잠김 위험 카운터를 본다:
   * 2 이상이면 성공할 때까지 429 CARD_IMPORT_LOGIN_LOCKED(시간 제한 없음), 1이면 acknowledged가 있어야 한다(없으면 409)
   */
  async checkStart(
    userId: string,
    organization: string,
    now = new Date(),
    lockRisk?: { acknowledged: boolean },
  ): Promise<void> {
    await this.checkUserRate(userId, now);
    if (lockRisk) {
      await this.checkLockRisk(userId, organization, lockRisk.acknowledged);
    } else {
      await this.checkLoginCooldown(userId, organization, now);
    }
  }

  private async checkUserRate(userId: string, now: Date) {
    const windowMs = CARD_IMPORT_FETCH_LIMIT.WINDOW_SECONDS * 1000;
    const recent = await this.prisma.accessLog.findMany({
      where: startedFetch(userId, new Date(now.getTime() - windowMs)),
      orderBy: { at: 'asc' },
      select: { at: true },
    });
    // 두 한도에 동시에 걸리면 더 늦게 풀리는 시각을 알려 준다(자정 직후 10분 창이 하루 한도를 가리지 않게)
    let until: Date | null = null;
    if (recent.length >= CARD_IMPORT_FETCH_LIMIT.COUNT) {
      const oldest = recent[recent.length - CARD_IMPORT_FETCH_LIMIT.COUNT].at;
      until = new Date(oldest.getTime() + windowMs);
    }
    if (
      (await this.startedToday(userId, now)) >= CARD_IMPORT_FETCH_LIMIT.DAILY
    ) {
      const midnight = nextKstMidnight(now);
      if (!until || midnight > until) until = midnight;
    }
    if (until) {
      throw AppException.of('CARD_IMPORT_RATE_LIMITED', {
        details: retryDetails(until, now),
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

  private async checkLockRisk(
    userId: string,
    organization: string,
    acknowledged: boolean,
  ) {
    const row = await this.prisma.cardImportLoginFailure.findUnique({
      where: { userId_organization: { userId, organization } },
      select: { lockRiskFailures: true, lockRiskLastFailedAt: true },
    });
    const failures = row?.lockRiskFailures ?? 0;
    const decision = lockRiskDecision(failures, acknowledged);
    if (decision === 'LOCKED') {
      throw lockedError(failures, row?.lockRiskLastFailedAt ?? new Date(0));
    }
    if (decision === 'CONFIRM') {
      throw AppException.of('CARD_LOCK_RISK_CONFIRM_REQUIRED', {
        details: { failedAttempts: failures },
      });
    }
  }

  /**
   * 로그인 실패를 센다(30분이 지난 이전 실패는 새로 센다). 3회째면 쿨다운 예외, 아니면 code { failedAttempts }를 던진다.
   * 아이디·비밀번호(CARD_LOGIN_FAILED)·카드번호(CARD_NUMBER_INVALID)·카드 비밀번호(CARD_PASSWORD_INVALID) 실패를 같은 행에서 센다.
   * lockRisk(현대·하나)면 같은 행의 잠김 위험 카운터(lock_risk_*)를 센다: 성공해야 0, 2회째부터 CARD_IMPORT_LOGIN_LOCKED.
   * 현대카드는 카드 비밀번호 3회 오류면 계정이 잠긴다(KR_CD_P_002 현대카드 특이사항)
   */
  async loginFailed(
    userId: string,
    organization: string,
    now = new Date(),
    code: LoginFailureCode = 'CARD_LOGIN_FAILED',
    options: { lockRisk?: boolean } = {},
  ): Promise<never> {
    if (options.lockRisk) {
      return this.lockRiskFailed(userId, organization, now, code);
    }
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
    throw AppException.of(code, {
      details: { failedAttempts: failures },
    });
  }

  /** 현대·하나 잠김 위험 카운터 +1(시간으로 리셋하지 않는다). 2회째면 CARD_IMPORT_LOGIN_LOCKED, 아니면 code { failedAttempts } */
  private async lockRiskFailed(
    userId: string,
    organization: string,
    now: Date,
    code: LoginFailureCode,
  ): Promise<never> {
    // last_failed_at도 함께 올린다(파기 배치 기준 — 마지막 실패 뒤 7일이면 행이 지워져 풀린다). 일반 카운터(failures)는 건드리지 않는다
    const [row] = await this.prisma.$queryRaw<{ failures: number }[]>`
      INSERT INTO card_import_login_failures
        (user_id, organization, failures, last_failed_at, lock_risk_failures, lock_risk_last_failed_at)
      VALUES (${userId}::uuid, ${organization}, 0, ${now}, 1, ${now})
      ON CONFLICT (user_id, organization) DO UPDATE SET
        lock_risk_failures = card_import_login_failures.lock_risk_failures + 1,
        lock_risk_last_failed_at = EXCLUDED.lock_risk_last_failed_at,
        last_failed_at = GREATEST(card_import_login_failures.last_failed_at, EXCLUDED.last_failed_at)
      RETURNING lock_risk_failures AS failures`;
    const failures = row?.failures ?? 1;
    if (failures >= CARD_IMPORT_LOCK_RISK_LIMIT.FAILURES) {
      throw lockedError(failures, now);
    }
    throw AppException.of(code, { details: { failedAttempts: failures } });
  }

  /**
   * 잠김 해제 확인(현대·하나, POST /api/card-import/lockout/ack): 사용자가 카드사 홈페이지에서 로그인을 확인했다고 밝히면
   * 그 카드사 잠김 위험 카운터를 0으로 한다. 순서: 카운터 2 미만이면 409 → 마지막 실패 30분 전이면 429 CARD_LOCKOUT_ACK_TOO_EARLY(retryAfter) →
   * 오늘(KST) 2회 넘으면 429 CARD_LOCKOUT_ACK_DAILY_LIMIT. 0으로 바꾸기와 접근 기록(CARD_LOCKOUT_ACK, 기관 코드만)은 한 트랜잭션.
   * 호출하는 쪽이 사용자 잠금(acquire) 안에서 부른다
   */
  async ackLockout(
    userId: string,
    organization: string,
    now = new Date(),
  ): Promise<void> {
    const row = await this.prisma.cardImportLoginFailure.findUnique({
      where: { userId_organization: { userId, organization } },
      select: { lockRiskFailures: true, lockRiskLastFailedAt: true },
    });
    if (
      !row ||
      row.lockRiskFailures < CARD_IMPORT_LOCK_RISK_LIMIT.FAILURES ||
      !row.lockRiskLastFailedAt
    ) {
      throw AppException.of('CARD_LOCKOUT_ACK_NOT_NEEDED');
    }
    const available = lockoutAckAvailableAt(row.lockRiskLastFailedAt);
    if (available > now) {
      throw AppException.of('CARD_LOCKOUT_ACK_TOO_EARLY', {
        details: retryDetails(available, now),
      });
    }
    const acksToday = await this.prisma.accessLog.count({
      where: {
        userId,
        action: 'CARD_LOCKOUT_ACK',
        at: { gte: new Date(kstDay(now).getTime() - KST_OFFSET_MS) },
      },
    });
    if (acksToday >= CARD_IMPORT_LOCKOUT_ACK_LIMIT.DAILY) {
      throw AppException.of('CARD_LOCKOUT_ACK_DAILY_LIMIT', {
        details: retryDetails(nextKstMidnight(now), now),
      });
    }
    await this.prisma.$transaction([
      this.prisma.cardImportLoginFailure.updateMany({
        where: {
          userId,
          organization,
          lockRiskFailures: { gte: CARD_IMPORT_LOCK_RISK_LIMIT.FAILURES },
        },
        data: { lockRiskFailures: 0 },
      }),
      this.prisma.accessLog.create({
        data: {
          userId,
          action: 'CARD_LOCKOUT_ACK',
          resourceType: 'USER',
          resourceId: userId,
          details: { organization },
        },
      }),
    ]);
  }

  /** 로그인에 성공하면(결과를 받았거나 추가 인증까지 갔으면) 연속 실패를 지운다(잠김 위험 카운터 포함) */
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

  /**
   * 새 조회 한 번 분량(4)을 원자적으로 예약한다. 예산을 넘으면 아무것도 늘리지 않고 503.
   * INSERT … ON CONFLICT DO UPDATE … WHERE calls + n <= budget RETURNING — 동시에 와도 예산을 넘지 않는다
   */
  async reserveFetch(now = new Date()): Promise<BudgetReservation> {
    const day = kstDay(now);
    const calls = CODEF_CALLS_PER_FETCH;
    const rows =
      calls > this.dailyBudget
        ? []
        : await this.prisma.$queryRaw<{ calls: number }[]>`
      INSERT INTO codef_daily_usage (day, calls, updated_at)
      VALUES (${day}::date, ${calls}, now())
      ON CONFLICT (day) DO UPDATE
        SET calls = codef_daily_usage.calls + EXCLUDED.calls, updated_at = now()
        WHERE codef_daily_usage.calls + EXCLUDED.calls <= ${this.dailyBudget}
      RETURNING calls`;
    if (rows.length === 0) {
      this.logger.warn(
        { budget: this.dailyBudget },
        'CODEF 일일 호출 예산 소진',
      );
      throw AppException.of('CARD_IMPORT_DAILY_LIMIT');
    }
    return { day, calls };
  }

  /** 쓰지 않은 예약을 돌려준다(0 아래로 내려가지 않는다) */
  async refund(day: Date, calls: number): Promise<void> {
    if (calls <= 0) return;
    await this.prisma.$executeRaw`
      UPDATE codef_daily_usage
      SET calls = GREATEST(calls - ${calls}, 0), updated_at = now()
      WHERE day = ${day}::date`;
  }

  /** 예약과 무관하게 보내는 CODEF 호출(계정 삭제) 한 번을 센다. 삭제를 막지 않도록 실패는 로그만 */
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

  // ─── 추가 인증 이어가기 ───

  /** 이어가기 1건을 연다. nonce 원문은 토큰 안에만 두고 DB에는 해시만 */
  async openTwoWay(
    userId: string,
    reservation: { day: Date; callsLeft: number },
    expiresAt: Date,
  ): Promise<string> {
    const nonce = randomBytes(18).toString('base64url');
    await this.prisma.cardImportTwoWaySession.create({
      data: {
        nonceHash: sha256(nonce),
        userId,
        callsLeft: reservation.callsLeft,
        budgetDay: reservation.day,
        expiresAt,
      },
    });
    return nonce;
  }

  /**
   * 이어가기 시도 1번: 시도 수 +1, 예약 호출 −1을 원자적으로. 없는 토큰·다른 사용자·만료·시도 3회 초과·예약 소진이면 410
   */
  async consumeTwoWay(
    userId: string,
    nonce: string,
    now = new Date(),
  ): Promise<TwoWayAttempt> {
    const nonceHash = sha256(nonce);
    const rows = await this.prisma.$queryRaw<
      { attempts: number; calls_left: number; budget_day: Date }[]
    >`
      UPDATE card_import_two_way_sessions
      SET attempts = attempts + 1, calls_left = calls_left - 1
      WHERE nonce_hash = ${nonceHash}
        AND user_id = ${userId}::uuid
        AND expires_at > ${now}
        AND attempts < ${TWO_WAY_MAX_ATTEMPTS}
        AND calls_left > 0
      RETURNING attempts, calls_left, budget_day`;
    const row = rows[0];
    if (!row) throw AppException.of('CARD_TWO_WAY_EXPIRED');
    return {
      nonceHash,
      attempts: row.attempts,
      callsLeft: row.calls_left,
      budgetDay: row.budget_day,
    };
  }

  /** 이어가기를 끝낸다(결과·종료 오류·시도 소진): 행을 지우고 남은 예약을 돌려준다 */
  async closeTwoWay(nonceHash: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<
      { calls_left: number; budget_day: Date }[]
    >`
      DELETE FROM card_import_two_way_sessions WHERE nonce_hash = ${nonceHash}
      RETURNING calls_left, budget_day`;
    const row = rows[0];
    if (row) await this.refund(row.budget_day, row.calls_left);
  }

  /**
   * 버려진(만료된) 이어가기 행을 지우고 남은 예약을 그날 예산에 돌려준다(0 아래로는 내려가지 않는다). 파기 배치가 부른다
   */
  static async purgeExpiredTwoWays(
    tx: Pick<PrismaService, '$queryRaw' | '$executeRaw'>,
    now: Date,
    dryRun: boolean,
  ): Promise<number> {
    if (dryRun) {
      const [row] = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM card_import_two_way_sessions WHERE expires_at <= ${now}`;
      return Number(row?.n ?? 0);
    }
    const gone = await tx.$queryRaw<{ calls_left: number; budget_day: Date }[]>`
      DELETE FROM card_import_two_way_sessions WHERE expires_at <= ${now}
      RETURNING calls_left, budget_day`;
    const byDay = new Map<string, { day: Date; calls: number }>();
    for (const row of gone) {
      const key = row.budget_day.toISOString();
      const entry = byDay.get(key) ?? { day: row.budget_day, calls: 0 };
      entry.calls += Math.max(row.calls_left, 0);
      byDay.set(key, entry);
    }
    for (const { day, calls } of byDay.values()) {
      if (calls <= 0) continue;
      await tx.$executeRaw`
        UPDATE codef_daily_usage
        SET calls = GREATEST(calls - ${calls}, 0), updated_at = now()
        WHERE day = ${day}::date`;
    }
    return gone.length;
  }

  // ─── 접근 기록(사용자 횟수의 기준) ───

  /**
   * 조회 시도 기록을 CODEF 호출 전에 쓴다(잠금 안 — 사용자 횟수의 기준). 실패하면 조회를 하지 않는다(fail closed).
   * 결과(건수·결과 코드)는 끝난 뒤 finishAttempt로 채운다
   */
  async recordAttempt(
    userId: string,
    organization: string,
    step: 'START' | 'TWO_WAY',
  ): Promise<string> {
    const row = await this.prisma.accessLog.create({
      data: {
        userId,
        action: 'FETCH_CARD_APPROVALS',
        resourceType: 'USER',
        resourceId: userId,
        details: { organization, count: 0, result: 'PENDING', step },
      },
      select: { id: true },
    });
    return row.id;
  }

  async finishAttempt(
    id: string,
    details: {
      organization: string;
      count: number;
      result: string;
      step: string;
    },
  ): Promise<void> {
    await this.prisma.accessLog.update({ where: { id }, data: { details } });
    // 애플리케이션 로그에는 결과 코드·건수만(요청 ID는 요청 로거가 붙인다). 기관 코드는 access_logs에만
    this.logger.log(
      {
        accessLogId: id,
        result: details.result,
        count: details.count,
        step: details.step,
      },
      '접근 기록',
    );
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

/**
 * 잠김 위험 카운터(현대·하나)로 새 조회를 어떻게 할지: 2 이상 = LOCKED(성공할 때까지, 시간 제한 없음),
 * 1 = 확인(acknowledgeLockRisk) 없으면 CONFIRM, 0 = OK
 */
export function lockRiskDecision(
  failures: number,
  acknowledged: boolean,
): 'OK' | 'CONFIRM' | 'LOCKED' {
  if (failures >= CARD_IMPORT_LOCK_RISK_LIMIT.FAILURES) return 'LOCKED';
  if (failures >= 1 && !acknowledged) return 'CONFIRM';
  return 'OK';
}

/** 잠김 해제 확인(lockout/ack)을 받기 시작하는 시각 = 마지막 실패 + 30분 */
export function lockoutAckAvailableAt(lastFailedAt: Date): Date {
  return new Date(
    lastFailedAt.getTime() +
      CARD_IMPORT_LOCKOUT_ACK_LIMIT.COOLDOWN_SECONDS * 1000,
  );
}

function lockedError(failures: number, lastFailedAt: Date): AppException {
  const details: CardLoginLockedDetails = {
    failedAttempts: failures,
    action: 'CHECK_CARD_COMPANY_SITE',
    ackAvailableAt: lockoutAckAvailableAt(lastFailedAt).toISOString(),
  };
  return AppException.of('CARD_IMPORT_LOGIN_LOCKED', { details });
}
