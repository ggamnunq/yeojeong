import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ForbiddenError } from '../common/errors/index.js';

/** Cloud Scheduler가 붙이는 헤더 */
export const INTERNAL_JOB_SECRET_HEADER = 'x-internal-job-secret';

/** 이보다 짧은 비밀값은 설정되지 않은 것으로 본다(S2A trips/internal-job.guard.ts와 같은 규칙) */
const MIN_SECRET_LENGTH = 32;

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * 내부 잡(`/api/internal/jobs/*`) 인증. 라우트는 @Public()이라 세션 없이 들어오고, 이 가드가 공유 비밀을 본다.
 * - env INTERNAL_JOB_SECRET과 헤더 x-internal-job-secret이 같아야 한다(상수 시간 비교).
 * - env가 비어 있거나 32자 미만이면 항상 403(실수로 열리지 않게).
 * 다른 모듈의 잡(auto-end, fx-rates, purge)도 같은 패턴을 쓰다가, 나중에 common으로 합치고
 * 기능명세 8-1의 Cloud Scheduler OIDC 검증으로 바꾼다.
 * 주의: 전역 CsrfGuard가 먼저 돌므로 호출 측은 `Origin: <WEB_BASE_URL>`(또는 `Sec-Fetch-Site: same-origin`)을 붙여야 한다.
 */
@Injectable()
export class InternalJobGuard implements CanActivate {
  private readonly secret: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>('INTERNAL_JOB_SECRET');
    this.secret = raw && raw.length >= MIN_SECRET_LENGTH ? digest(raw) : null;
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const given = req.headers[INTERNAL_JOB_SECRET_HEADER];
    if (!this.secret || typeof given !== 'string' || given.length === 0) {
      throw new ForbiddenError();
    }
    if (!timingSafeEqual(digest(given), this.secret))
      throw new ForbiddenError();
    return true;
  }
}
