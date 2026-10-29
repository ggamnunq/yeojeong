import { Injectable } from '@nestjs/common';
import { ADMIN_LOGIN_LIMIT } from '@yeojeong/shared';
import { retryDetails } from '../card-import/card-import-limits.js';
import { AppException } from '../common/errors/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ADMIN_GLOBAL_THROTTLE_KEY,
  ADMIN_LOGIN_WINDOW_MS,
} from './admin.constants.js';

/**
 * 관리자 로그인 시도 제한(admin_login_throttles). 비밀번호를 확인하기 **전에** 시도를 원자적으로 센다
 * (INSERT … ON CONFLICT DO UPDATE … RETURNING) — 동시에 여러 요청을 보내도, 인스턴스가 여럿이어도 한도를 넘겨 확인하지 못한다.
 * - IP당: 15분 고정 창에 5번까지. 넘으면 429 ADMIN_LOGIN_RATE_LIMITED(창이 끝날 때까지)
 * - 전체: 성공 없이 15분 창에 20번까지. 넘으면 그 창이 끝날 때까지 모든 IP가 429(분산 대입 잠금)
 * 성공하면 그 IP와 전체 카운터를 지운다. 키에는 IP 원문 대신 HMAC(AUDIT_HMAC_KEY)만 쓴다.
 */
@Injectable()
export class AdminLoginThrottle {
  constructor(private readonly prisma: PrismaService) {}

  static ipKey(ipHash: string | null): string {
    // AUDIT_HMAC_KEY가 없는 로컬에서는 IP를 나누지 않는다(운영은 키가 늘 있다)
    return `ip:${ipHash ?? 'unknown'}`;
  }

  /** IP → 전체 순으로 시도 1번을 센다. 한도를 넘으면 429(IP에서 막히면 전체는 세지 않는다) */
  async consume(ipKey: string, now = new Date()): Promise<void> {
    await this.count(ipKey, ADMIN_LOGIN_LIMIT.IP_ATTEMPTS, now);
    await this.count(
      ADMIN_GLOBAL_THROTTLE_KEY,
      ADMIN_LOGIN_LIMIT.GLOBAL_ATTEMPTS,
      now,
    );
  }

  /** 로그인 성공: 그 IP와 전체 카운터를 비운다 */
  async reset(ipKey: string): Promise<void> {
    await this.prisma.adminLoginThrottle.deleteMany({
      where: { key: { in: [ipKey, ADMIN_GLOBAL_THROTTLE_KEY] } },
    });
  }

  private async count(key: string, limit: number, now: Date) {
    const windowStart = new Date(now.getTime() - ADMIN_LOGIN_WINDOW_MS);
    const [row] = await this.prisma.$queryRaw<
      { attempts: number; window_started_at: Date }[]
    >`
      INSERT INTO admin_login_throttles (key, attempts, window_started_at, updated_at)
      VALUES (${key}, 1, ${now}, ${now})
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE WHEN admin_login_throttles.window_started_at <= ${windowStart}
                        THEN 1 ELSE admin_login_throttles.attempts + 1 END,
        window_started_at = CASE WHEN admin_login_throttles.window_started_at <= ${windowStart}
                                 THEN ${now} ELSE admin_login_throttles.window_started_at END,
        updated_at = ${now}
      RETURNING attempts, window_started_at`;
    if (!row) throw new Error('관리자 로그인 시도를 세지 못함');
    if (row.attempts > limit) {
      throw AppException.of('ADMIN_LOGIN_RATE_LIMITED', {
        details: retryDetails(
          new Date(row.window_started_at.getTime() + ADMIN_LOGIN_WINDOW_MS),
          now,
        ),
      });
    }
  }
}
