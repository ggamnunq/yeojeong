import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenError } from '../errors/index.js';
import { GoogleOidcVerifier } from './google-oidc-verifier.js';
import {
  INTERNAL_JOB_SECRET_HEADER,
  IS_INTERNAL_JOB_KEY,
} from './internal-job.constants.js';

const MIN_SECRET_LENGTH = 32;

/** @InternalJob() 라우트에만 Cloud Scheduler OIDC 인증을 적용한다. */
@Injectable()
export class InternalJobGuard implements CanActivate {
  private readonly logger = new Logger(InternalJobGuard.name);
  private readonly production: boolean;
  private readonly localSecret: Buffer | null;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
    private readonly oidc: GoogleOidcVerifier,
  ) {
    this.production = config.get<string>('NODE_ENV') === 'production';
    const secret = config.get<string>('INTERNAL_JOB_SECRET') ?? '';
    this.localSecret =
      secret.length >= MIN_SECRET_LENGTH ? digest(secret) : null;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.isInternalJob(ctx)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const authorization = req.headers.authorization;
    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      try {
        if (await this.oidc.verify(authorization.slice('Bearer '.length))) {
          return true;
        }
      } catch (error) {
        this.logger.error(
          { err: error },
          'Google OIDC JWKS 검증에 실패했습니다',
        );
      }
    }

    if (!this.production && this.matchesLocalSecret(req)) return true;
    throw new ForbiddenError();
  }

  private isInternalJob(ctx: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_INTERNAL_JOB_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) === true
    );
  }

  private matchesLocalSecret(req: Request): boolean {
    const given = req.headers[INTERNAL_JOB_SECRET_HEADER];
    return (
      this.localSecret !== null &&
      typeof given === 'string' &&
      timingSafeEqual(digest(given), this.localSecret)
    );
  }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}
