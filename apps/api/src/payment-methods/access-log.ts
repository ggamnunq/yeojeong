import { Injectable, Logger } from '@nestjs/common';
import type { AccessAction } from '@yeojeong/shared';
import { AuditService, type AuditResourceType } from '../audit/index.js';

/**
 * 금융 데이터 접근 로그(기능명세 8-1, AccessLog: 누가·무엇을·언제, 내용 없음).
 * S2D 공통 감사 서비스(AuditService.record)에 맡긴다. 서비스 안에서 남기므로 IP는 넘기지 않는다.
 * 기록 실패가 사용자 요청을 막지 않게 오류는 로그(ID만)로 남기고 넘어간다.
 */
@Injectable()
export class FinancialAccessLog {
  private readonly logger = new Logger(FinancialAccessLog.name);

  constructor(private readonly audit: AuditService) {}

  async record(
    userId: string,
    action: AccessAction,
    resourceType: AuditResourceType,
    resourceId?: string | null,
  ): Promise<void> {
    try {
      await this.audit.record({ userId, action, resourceType, resourceId });
    } catch (error) {
      this.logger.error(
        { userId, action, errorCode: (error as { code?: string }).code },
        '금융 데이터 접근 로그를 남기지 못함',
      );
    }
  }
}
