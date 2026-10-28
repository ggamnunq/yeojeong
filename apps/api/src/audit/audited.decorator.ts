import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuditAction, AuditResourceType } from './audit-actions.js';

export const AUDITED_KEY = 'audit:audited';

/** 요청에서 리소스 UUID를 꺼낸다. UUID가 아니면 버리고 NULL로 남긴다 */
export type AuditResourceIdResolver = (req: Request) => string | undefined;

export interface AuditedOptions {
  resourceType: AuditResourceType;
  /** 기본은 NULL. fromParam('expenseId'), fromCurrentUser 같은 것을 넘긴다 */
  resourceId?: AuditResourceIdResolver;
}

export interface AuditedMetadata extends AuditedOptions {
  action: AuditAction;
}

/**
 * 이 라우트가 성공(2xx)하면 AccessLog에 한 줄 남긴다(누가·무엇을·언제, 내용 없음).
 * 전역 AuditInterceptor가 이 메타데이터가 있는 라우트에서만 동작한다. 로그인하지 않은 요청은 남기지 않는다.
 * @example
 *   @Audited('VIEW_EXPENSE_DETAIL', { resourceType: 'EXPENSE', resourceId: fromParam('expenseId') })
 *   @Get('trips/:tripId/expenses/:expenseId')
 */
export const Audited = (action: AuditAction, options: AuditedOptions) =>
  SetMetadata(AUDITED_KEY, { action, ...options } satisfies AuditedMetadata);

/** 경로 파라미터 값. 예: fromParam('expenseId') */
export const fromParam =
  (name: string): AuditResourceIdResolver =>
  (req) => {
    const value: unknown = (req.params as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  };

/** 로그인한 사용자 자신이 대상일 때(탈퇴 등) */
export const fromCurrentUser: AuditResourceIdResolver = (req) =>
  req.auth?.user.id;
