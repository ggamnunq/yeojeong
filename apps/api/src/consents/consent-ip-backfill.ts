import { Injectable, Logger } from '@nestjs/common';
import type { ConsentIpBackfillResult } from '@yeojeong/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;
type CountClient = Pick<Prisma.TransactionClient, 'userConsent'>;

/** 한 트랜잭션에서 바꾸는 행 수 */
export const CONSENT_IP_BATCH = 500;
/** 한 번 실행의 배치 상한(Cloud Run 요청 30초 안). 남으면 다음 실행이 이어서 한다 */
const MAX_BATCHES = 20;
const TX_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;

export interface ConsentIpBatchOutcome {
  count: number;
  hasMore: boolean;
}

/** 접속 IP 평문이 남은 동의 기록 수(0이면 평문 컬럼을 지우는 contract 단계로 갈 수 있다) */
export function countPlaintextConsentIps(client: CountClient): Promise<number> {
  return client.userConsent.count({ where: { ip: { not: null } } });
}

/**
 * 접속 IP 평문이 남은 동의 기록을 limit건까지 HMAC으로 옮기고 평문을 NULL로 지운다(멱등).
 * 같은 행을 다른 실행(이관 잡·파기 배치)이 잡고 있으면 건너뛴다(SKIP LOCKED).
 * hash가 null을 돌려주면(키 없음) 평문을 지우지 않고 예외를 던진다 — 호출 전에 키가 있는지 확인한다.
 */
export async function hashConsentIpBatch(
  tx: Tx,
  hash: (ip: string) => string | null,
  limit: number,
): Promise<ConsentIpBatchOutcome> {
  const rows = await tx.$queryRaw<{ id: string; ip: string }[]>`
    SELECT "id"::text AS "id", host("ip") AS "ip"
    FROM "user_consents"
    WHERE "ip" IS NOT NULL
    ORDER BY "id"
    LIMIT ${limit + 1}
    FOR UPDATE SKIP LOCKED`;
  const batch = rows.slice(0, limit);
  if (batch.length === 0) return { count: 0, hasMore: false };

  const ids: string[] = [];
  const hashes: string[] = [];
  for (const row of batch) {
    const digest = hash(row.ip);
    if (digest === null) {
      throw new Error('동의 기록 IP를 해시할 수 없습니다(AUDIT_HMAC_KEY 확인)');
    }
    ids.push(row.id);
    hashes.push(digest);
  }
  const count = await tx.$executeRaw`
    UPDATE "user_consents" AS u
    SET "ip_hash" = v."hash", "ip" = NULL, "updated_at" = now()
    FROM unnest(${ids}::uuid[], ${hashes}::text[]) AS v("id", "hash")
    WHERE u."id" = v."id" AND u."ip" IS NOT NULL`;
  return { count, hasMore: rows.length > limit };
}

/**
 * 동의 기록 IP 평문 → HMAC 이관(expand 단계의 데이터 이관). 내부 잡 POST /api/internal/jobs/consent-ip-backfill.
 * 배포 중 옛 리비전이 남긴 평문도 잡히도록 파기 배치(CONSENT_IP_PLAINTEXT 단계)가 같은 함수를 매일 돈다.
 * 절차는 prisma/README.md "동의 기록 IP".
 */
@Injectable()
export class ConsentIpBackfillService {
  private readonly logger = new Logger(ConsentIpBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async run(): Promise<ConsentIpBackfillResult> {
    if (!this.audit.ipHashEnabled) {
      const remaining = await countPlaintextConsentIps(this.prisma);
      this.logger.warn(
        { remaining },
        'AUDIT_HMAC_KEY가 없어 동의 기록 IP 이관을 건너뜁니다',
      );
      return { hashed: 0, remaining, skipped: 'NO_KEY' };
    }

    let hashed = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const outcome = await this.prisma.$transaction(
        (tx) =>
          hashConsentIpBatch(
            tx,
            (ip) => this.audit.hashIp(ip),
            CONSENT_IP_BATCH,
          ),
        TX_OPTIONS,
      );
      hashed += outcome.count;
      if (!outcome.hasMore || outcome.count === 0) break;
    }
    const remaining = await countPlaintextConsentIps(this.prisma);
    this.logger.log({ hashed, remaining }, '동의 기록 IP 이관');
    return { hashed, remaining };
  }
}
