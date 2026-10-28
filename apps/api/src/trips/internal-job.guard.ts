import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ForbiddenError } from '../common/errors/index.js';

/** Cloud Scheduler가 보내는 헤더. 값은 env INTERNAL_JOB_SECRET(Secret Manager) */
export const INTERNAL_JOB_SECRET_HEADER = 'x-internal-job-secret';
/** 이보다 짧은 비밀값은 설정되지 않은 것으로 본다 */
const MIN_SECRET_LENGTH = 32;

/**
 * /api/internal/jobs/* 전용 가드(@Public()과 함께 쓴다). 비밀값이 없거나 짧으면 모든 요청을 막는다(fail closed).
 * 임시 방식이다. 명세 8-1은 Scheduler OIDC 검증이고, 다른 모듈의 같은 가드와 나중에 공통으로 합친다.
 */
@Injectable()
export class InternalJobGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const secret = this.config.get<string>('INTERNAL_JOB_SECRET') ?? '';
    const given = ctx.switchToHttp().getRequest<Request>().headers[
      INTERNAL_JOB_SECRET_HEADER
    ];
    if (
      secret.length < MIN_SECRET_LENGTH ||
      typeof given !== 'string' ||
      !sameSecret(given, secret)
    ) {
      throw new ForbiddenError();
    }
    return true;
  }
}

// 길이가 달라도 시간이 새지 않게 해시를 비교한다
function sameSecret(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
