import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { mergeMap, type Observable } from 'rxjs';
import { AuditService } from './audit.service.js';
import { getRequestId } from '../common/logging/request-id.js';
import { AUDITED_KEY, type AuditedMetadata } from './audited.decorator.js';

/**
 * 전역 인터셉터. @Audited()가 붙은 라우트가 성공했을 때만 AccessLog를 남긴다. 메타데이터가 없으면 아무것도 하지 않는다.
 * 실패한 요청(4xx·5xx)은 접근이 일어나지 않았으므로 남기지 않는다.
 * 기록에 실패해도 응답은 그대로 보낸다(로그에 오류 코드만 남긴다).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const meta = this.reflector.get<AuditedMetadata | undefined>(
      AUDITED_KEY,
      ctx.getHandler(),
    );
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request>();
    // 핸들러가 사용자를 지우는 경우(탈퇴)가 있어 값은 핸들러 전에 읽어 둔다
    const userId = req.auth?.user.id;
    if (!userId) return next.handle();
    const entry = {
      userId,
      action: meta.action,
      resourceType: meta.resourceType,
      resourceId: meta.resourceId?.(req) ?? null,
      ip: req.ip,
      requestId: getRequestId(req),
      ua: req.get('user-agent'),
    };

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        try {
          await this.audit.record(entry);
        } catch (err) {
          this.logger.error(
            {
              action: entry.action,
              errorName: err instanceof Error ? err.name : typeof err,
              errorCode: (err as { code?: unknown } | null)?.code,
            },
            '접근 기록 실패',
          );
        }
        return body;
      }),
    );
  }
}
