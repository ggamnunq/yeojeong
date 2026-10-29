import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ADMIN_LOGIN_LIMIT, ADMIN_STEP_UP_LIMIT } from '@yeojeong/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ADMIN_GLOBAL_THROTTLE_KEY,
  ADMIN_LOGIN_WINDOW_MS,
} from './admin.constants.js';

/** IP · 전체 · 장치 쿠키 · 재인증(세션) */
export type ThrottleScope = 'IP' | 'GLOBAL' | 'DEVICE' | 'STEP_UP';

export interface ThrottleKey {
  key: string;
  limit: number;
  scope: ThrottleScope;
}

export interface ThrottleBlock {
  scope: ThrottleScope;
  /** 이 창이 끝나는 시각 */
  until: Date;
  /** 이 키·창에서 처음 한도를 넘은 요청인지(접근 기록은 이때 한 번만 쓴다. 나머지는 attempts 카운터로만 센다) */
  first: boolean;
}

/**
 * 시도 제한에 쓰는 주소. IPv4는 그대로, IPv4-mapped IPv6는 IPv4로, IPv6는 /64 접두어("2001:db8:1:2::")로 자른다
 * (한 회선이 /64를 통째로 받는 경우가 흔해서 주소를 바꿔 가며 제한을 피하지 못하게). IP가 아니면 null
 */
export function rateLimitAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const kind = isIP(ip);
  if (kind === 4) return ip;
  if (kind !== 6) return null;
  const groups = expandIPv6(ip);
  if (!groups) return null;
  const mapped =
    groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) {
    return [
      groups[6] >> 8,
      groups[6] & 255,
      groups[7] >> 8,
      groups[7] & 255,
    ].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::`;
}

/** IPv6 → 16비트 8개(:: 펼침, 끝의 IPv4 표기 포함, zone id 무시) */
function expandIPv6(ip: string): number[] | null {
  let text = ip.split('%')[0].toLowerCase();
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const parse = (part: string | undefined) =>
    part ? part.split(':').map((g) => parseInt(g, 16)) : [];
  const left = parse(head);
  const right = parse(tail);
  const fill = text.includes('::') ? 8 - left.length - right.length : 0;
  const groups = [
    ...left,
    ...Array<number>(Math.max(fill, 0)).fill(0),
    ...right,
  ];
  return groups.length === 8 &&
    groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

/**
 * 관리자 로그인·재인증 시도 제한(admin_login_throttles). 비밀번호를 확인하기 **전에** 시도를 원자적으로 센다
 * (INSERT … ON CONFLICT DO UPDATE … RETURNING) — 동시에 여러 요청을 보내도, 인스턴스가 여럿이어도 한도를 넘겨 확인하지 못한다.
 * - 장치 쿠키 없는 로그인: IP(IPv6 /64) 15분 5번 + 전체 15분 20번(분산 대입 잠금)
 * - 장치 쿠키 있는 로그인(이 브라우저로 로그인에 성공한 적이 있다): 전체 잠금에서 빠지고 그 장치만 15분 5번 — 운영자가 전체 잠금으로 막히지 않는다
 * - 재인증(탈퇴 처리 step-up): 관리자 세션마다 15분 5번
 * 성공하면 그 요청의 키를 지운다. 키에는 IP 원문 대신 HMAC(AUDIT_HMAC_KEY), 장치·세션은 ID만 쓴다.
 */
@Injectable()
export class AdminLoginThrottle {
  constructor(private readonly prisma: PrismaService) {}

  /** 장치 쿠키 없는 로그인의 키(IP → 전체 순) */
  static anonymousKeys(ipHash: string | null): ThrottleKey[] {
    return [
      // AUDIT_HMAC_KEY가 없는 로컬에서는 IP를 나누지 않는다(운영은 키가 늘 있다)
      {
        key: `ip:${ipHash ?? 'unknown'}`,
        limit: ADMIN_LOGIN_LIMIT.IP_ATTEMPTS,
        scope: 'IP',
      },
      {
        key: ADMIN_GLOBAL_THROTTLE_KEY,
        limit: ADMIN_LOGIN_LIMIT.GLOBAL_ATTEMPTS,
        scope: 'GLOBAL',
      },
    ];
  }

  static deviceKeys(deviceId: string): ThrottleKey[] {
    return [
      {
        key: `dev:${deviceId}`,
        limit: ADMIN_LOGIN_LIMIT.DEVICE_ATTEMPTS,
        scope: 'DEVICE',
      },
    ];
  }

  static stepUpKeys(sessionId: string): ThrottleKey[] {
    return [
      {
        key: `stepup:${sessionId}`,
        limit: ADMIN_STEP_UP_LIMIT.ATTEMPTS,
        scope: 'STEP_UP',
      },
    ];
  }

  /** 키를 순서대로 1번씩 센다. 한도를 넘은 첫 키에서 멈추고 그 정보를 돌려준다(뒤 키는 세지 않는다). 통과면 null */
  async consume(
    keys: ThrottleKey[],
    now = new Date(),
  ): Promise<ThrottleBlock | null> {
    for (const { key, limit, scope } of keys) {
      const block = await this.count(key, limit, scope, now);
      if (block) return block;
    }
    return null;
  }

  /** 성공: 그 요청의 카운터를 비운다 */
  async reset(keys: ThrottleKey[]): Promise<void> {
    await this.prisma.adminLoginThrottle.deleteMany({
      where: { key: { in: keys.map((k) => k.key) } },
    });
  }

  private async count(
    key: string,
    limit: number,
    scope: ThrottleScope,
    now: Date,
  ): Promise<ThrottleBlock | null> {
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
    if (row.attempts <= limit) return null;
    return {
      scope,
      until: new Date(row.window_started_at.getTime() + ADMIN_LOGIN_WINDOW_MS),
      first: row.attempts === limit + 1,
    };
  }
}
