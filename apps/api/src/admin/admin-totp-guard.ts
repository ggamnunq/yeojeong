import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * TOTP 같은 코드 재사용 금지(RFC 6238 5.2). 관리자마다 마지막으로 받은 창 번호를 admin_totp_counters에 두고,
 * 그보다 큰 창만 원자적으로 받는다(INSERT … ON CONFLICT DO UPDATE … WHERE last_counter < 새 창 RETURNING).
 * 인스턴스가 여럿이어도, 같은 코드로 동시에 두 번 보내도 한 번만 성공한다. 로그인·재인증이 같은 카운터를 쓴다
 */
@Injectable()
export class AdminTotpGuard {
  constructor(private readonly prisma: PrismaService) {}

  /** 이 창 번호를 처음 쓰면 true(기록), 이미 쓴(또는 더 늦은 창을 쓴) 적이 있으면 false */
  async claim(actorId: string, counter: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ actor_id: string }[]>`
      INSERT INTO admin_totp_counters (actor_id, last_counter, updated_at)
      VALUES (${actorId}::uuid, ${BigInt(counter)}, now())
      ON CONFLICT (actor_id) DO UPDATE
        SET last_counter = EXCLUDED.last_counter, updated_at = now()
        WHERE admin_totp_counters.last_counter < EXCLUDED.last_counter
      RETURNING actor_id`;
    return rows.length > 0;
  }
}
