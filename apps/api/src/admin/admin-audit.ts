import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type { AuditAction, AuditResourceType } from '../audit/index.js';
import { AuditService } from '../audit/index.js';
import { getRequestId } from '../common/logging/request-id.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminConfig } from './admin-config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminAuditEntry {
  resourceType: AuditResourceType;
  /** 대상 회원 ID 등. UUID가 아니면 NULL */
  resourceId?: string | null;
  /** 건수·코드 값·탈퇴 처리 사유만. 비밀번호·아이디·검색어는 넣지 않는다 */
  details?: Readonly<Record<string, number | string>>;
}

/**
 * 관리자 열람·조치 접근 기록(access_logs, 1년 보존 — 개인정보취급자 접속 기록).
 * user_id = 관리자 행위자 ID(AdminConfig.actorId, 아이디에서 만든 UUID), IP는 HMAC만, 요청 ID·UA를 남긴다.
 * 열람·조치 기록은 **응답 전에** 쓰고 실패하면 요청을 실패시킨다(fail closed — 기록 없는 열람이 없게).
 * 애플리케이션 로그(Cloud Logging)에는 행위·대상만 남기고 details(탈퇴 사유)는 남기지 않는다.
 */
@Injectable()
export class AdminAuditLog {
  private readonly logger = new Logger(AdminAuditLog.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly admin: AdminConfig,
  ) {}

  /** IP HMAC(로그인 시도 제한 키에도 쓴다) */
  ipHash(req: Request): string | null {
    return this.audit.hashIp(req.ip);
  }

  async record(
    req: Request,
    action: AuditAction,
    entry: AdminAuditEntry,
  ): Promise<string> {
    const actorId = this.admin.actorId;
    if (!actorId) throw new Error('관리자 기능이 꺼져 있다');
    const resourceId =
      entry.resourceId && UUID.test(entry.resourceId) ? entry.resourceId : null;
    const row = await this.prisma.accessLog.create({
      data: {
        userId: actorId,
        action,
        resourceType: entry.resourceType,
        resourceId,
        ipHash: this.audit.hashIp(req.ip),
        requestId: getRequestId(req).slice(0, 128) || null,
        ua: req.get('user-agent')?.slice(0, 512) ?? null,
        ...(entry.details && { details: { ...entry.details } }),
      },
      select: { id: true },
    });
    this.logger.log(
      {
        accessLogId: row.id,
        action,
        resourceType: entry.resourceType,
        resourceId,
      },
      '관리자 접근 기록',
    );
    return row.id;
  }

  /** 조치 결과를 같은 행에 채운다(탈퇴 처리처럼 시도를 먼저 기록한 경우) */
  async finish(
    id: string,
    details: Readonly<Record<string, number | string>>,
  ): Promise<void> {
    await this.prisma.accessLog.update({
      where: { id },
      data: { details: { ...details } },
    });
  }

  /** 로그인 실패 기록처럼 응답을 바꾸지 않는 기록. 실패하면 오류 로그만 남긴다 */
  async recordQuietly(
    req: Request,
    action: AuditAction,
    entry: AdminAuditEntry,
  ): Promise<void> {
    try {
      await this.record(req, action, entry);
    } catch (err) {
      this.logger.error(
        {
          action,
          errorName: err instanceof Error ? err.name : typeof err,
          errorCode: (err as { code?: unknown } | null)?.code,
        },
        '관리자 접근 기록 실패',
      );
    }
  }
}
