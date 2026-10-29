import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuditAction, AuditResourceType } from './audit-actions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_KEY_LENGTH = 32;

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  /** UUID가 아니면 NULL로 남긴다(경로 값이 섞여 들어오지 않게) */
  resourceId?: string | null;
  /** 원문은 저장하지 않고 HMAC만 남긴다 */
  ip?: string | null;
  requestId?: string | null;
  ua?: string | null;
}

type AccessLogWriter = Pick<Prisma.TransactionClient, 'accessLog'>;

/**
 * 금융 데이터 접근 로그(AccessLog, 기능명세 8-1). 누가·무엇을·언제만 남기고 금액·가맹점·개인정보는 남기지 않는다.
 * 라우트에는 @Audited()를 붙이고, 라우트 밖(서비스 안 트랜잭션 등)에서는 record()를 직접 부른다.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly ipKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const key = config.get<string>('AUDIT_HMAC_KEY') || null;
    if (key && key.length < MIN_KEY_LENGTH) {
      throw new Error(`AUDIT_HMAC_KEY는 ${MIN_KEY_LENGTH}자 이상이어야 합니다`);
    }
    this.ipKey = key;
  }

  /** AUDIT_HMAC_KEY가 있어 IP를 해시로 남길 수 있는지 */
  get ipHashEnabled(): boolean {
    return this.ipKey !== null;
  }

  /**
   * 접속 IP의 HMAC-SHA256(hex 64자). 접근 기록(access_logs)과 동의 기록(user_consents)이 같은 키를 쓴다. IPv4는 경우의 수가 적어 키 없는 해시는 되돌릴 수 있으므로
   * AUDIT_HMAC_KEY가 없으면 NULL을 돌려준다(남기지 않는다).
   */
  hashIp(ip: string | null | undefined): string | null {
    if (!this.ipKey || !ip || isIP(ip) === 0) return null;
    return createHmac('sha256', this.ipKey).update(ip).digest('hex');
  }

  /**
   * AccessLog 한 줄을 쓰고 id를 돌려준다. 트랜잭션 안이면 tx를 넘긴다.
   */
  async record(
    entry: AuditEntry,
    client: AccessLogWriter = this.prisma,
  ): Promise<string> {
    const resourceId =
      entry.resourceId && UUID.test(entry.resourceId) ? entry.resourceId : null;
    const row = await client.accessLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId,
        ipHash: this.hashIp(entry.ip),
        requestId: entry.requestId?.slice(0, 128) ?? null,
        ua: entry.ua?.slice(0, 512) ?? null,
      },
      select: { id: true },
    });
    this.logger.log(
      {
        accessLogId: row.id,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId,
      },
      '접근 기록',
    );
    return row.id;
  }
}
