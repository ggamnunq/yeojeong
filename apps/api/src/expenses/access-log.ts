import { Injectable, Logger } from '@nestjs/common';
import type { AccessAction } from '@yeojeong/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** 로그에는 오류 코드만 남긴다(입력값이 섞일 수 있는 메시지·meta는 남기지 않는다) */
export function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === 'string') return code;
    if (typeof name === 'string') return name;
  }
  return 'UNKNOWN';
}

/**
 * 금융 데이터 접근 기록(기능명세 8-2 "접근 로그": 누가·무엇을·언제, 내용 없음).
 * audit 모듈이 생기면 그쪽 서비스로 바꾼다. 기록 실패는 조회를 막지 않는다.
 */
@Injectable()
export class ExpenseAccessLog {
  private readonly logger = new Logger(ExpenseAccessLog.name);

  constructor(private readonly prisma: PrismaService) {}

  record(
    userId: string,
    action: Extract<
      AccessAction,
      'LIST_EXPENSES' | 'VIEW_EXPENSE_DETAIL' | 'VIEW_CANDIDATES'
    >,
    resource: { type: 'Trip' | 'Expense'; id: string },
  ): void {
    const fail = (error: unknown) =>
      this.logger.warn(
        { action, errorCode: errorCodeOf(error) },
        '접근 기록을 남기지 못했습니다',
      );
    try {
      void this.prisma.accessLog
        .create({
          data: {
            userId,
            action,
            resourceType: resource.type,
            resourceId: resource.id,
          },
        })
        .catch(fail);
    } catch (error) {
      fail(error);
    }
  }
}
