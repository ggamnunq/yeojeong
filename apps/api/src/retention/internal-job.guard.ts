import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ForbiddenError } from '../common/errors/index.js';

export const INTERNAL_JOB_SECRET_HEADER = 'x-internal-job-secret';
const MIN_SECRET_LENGTH = 32;

/**
 * 내부 잡(/api/internal/jobs/*) 전용 가드. 헤더 x-internal-job-secret이 env INTERNAL_JOB_SECRET과 같아야 한다(상수 시간 비교).
 * 시크릿이 비어 있으면 모든 호출을 403으로 막는다(닫힌 기본값). 라우트에는 @Public()과 함께 붙인다.
 * 기능명세 6-1은 Cloud Scheduler OIDC 검증을 요구한다. 그 미들웨어가 생기면 이 가드를 바꿔 끼운다(다른 잡 모듈도 같은 가드를 쓴다).
 */
@Injectable()
export class InternalJobGuard implements CanActivate {
  private readonly expected: Buffer | null;

  constructor(config: ConfigService) {
    const secret = config.get<string>('INTERNAL_JOB_SECRET') || null;
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `INTERNAL_JOB_SECRET은 ${MIN_SECRET_LENGTH}자 이상이어야 합니다`,
      );
    }
    this.expected = secret ? digest(secret) : null;
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = req.headers[INTERNAL_JOB_SECRET_HEADER];
    if (
      !this.expected ||
      typeof provided !== 'string' ||
      !timingSafeEqual(digest(provided), this.expected)
    ) {
      throw new ForbiddenError();
    }
    return true;
  }
}

// 길이가 달라도 같은 길이로 비교해 비교 시간으로 길이가 드러나지 않게 한다(origin lock과 같은 방식)
function digest(value: string) {
  return createHash('sha256').update(value).digest();
}
