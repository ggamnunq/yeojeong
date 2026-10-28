import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ForbiddenError } from '../common/errors/index.js';

/** 스케줄러가 INTERNAL_JOB_SECRET을 담아 보내는 헤더 */
export const INTERNAL_JOB_SECRET_HEADER = 'x-internal-job-secret';
const MIN_SECRET_LENGTH = 32;

/**
 * 내부 잡(/api/internal/jobs/*) 임시 인증. 라우트에 @Public()과 함께 붙인다.
 * 헤더 x-internal-job-secret이 env INTERNAL_JOB_SECRET과 같아야 한다(상수 시간 비교).
 * env가 없거나 32자보다 짧으면 모든 요청을 막는다(닫힌 상태가 기본).
 * 다른 잡 모듈도 같은 패턴을 쓰고, Cloud Scheduler OIDC 검증(기능명세 6-1)이 들어오면 common으로 합친다.
 */
@Injectable()
export class InternalJobGuard implements CanActivate {
  private readonly logger = new Logger(InternalJobGuard.name);
  private readonly expected: Buffer | null;

  constructor(config: ConfigService) {
    const secret = config.get<string>('INTERNAL_JOB_SECRET') ?? '';
    this.expected = secret.length >= MIN_SECRET_LENGTH ? digest(secret) : null;
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.expected) {
      this.logger.warn(
        'INTERNAL_JOB_SECRET이 없거나 짧아 내부 잡을 막았습니다',
      );
      throw new ForbiddenError();
    }
    const provided = ctx.switchToHttp().getRequest<Request>().headers[
      INTERNAL_JOB_SECRET_HEADER
    ];
    if (
      typeof provided !== 'string' ||
      !timingSafeEqual(digest(provided), this.expected)
    ) {
      throw new ForbiddenError();
    }
    return true;
  }
}

// 길이가 다른 값도 같은 길이로 비교해 비밀값 길이가 드러나지 않게 한다
function digest(value: string) {
  return createHash('sha256').update(value).digest();
}
