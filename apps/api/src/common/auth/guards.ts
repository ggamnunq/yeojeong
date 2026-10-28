import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SIGNUP_REQUIRED_CONSENTS,
  type ConsentId,
  type ConsentRequiredDetails,
  type ConsentRequirement,
  type MemberRole,
} from '@yeojeong/shared';
import type { Request, Response } from 'express';
import {
  AppException,
  NotFoundError,
  UnauthenticatedError,
} from '../errors/app-exception.js';
import {
  IS_PUBLIC_KEY,
  REQUIRED_CONSENTS_KEY,
  REQUIRED_ROLE_KEY,
  REQUIRED_TRIP_STATUS_KEY,
  SKIP_CONSENT_CHECK_KEY,
} from './auth.constants.js';
import { ConsentChecker } from './consent-checker.js';
import type { RequiredTripStatus } from './decorators.js';
import { MembershipLookup } from './membership-lookup.js';
import { SessionResolver } from './session-resolver.js';
import { WebConfig } from './web-config.js';

// 전역 가드는 app.module.ts에 이 순서로 등록한다:
// Throttler → CsrfGuard → AuthGuard → ConsentGuard → MembershipGuard → TripStatusGuard

function metadata<T>(
  reflector: Reflector,
  key: string,
  ctx: ExecutionContext,
): T | undefined {
  return reflector.getAllAndOverride<T | undefined>(key, [
    ctx.getHandler(),
    ctx.getClass(),
  ]);
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 상태를 바꾸는 요청은 허용된 화면 origin에서 온 것만 받는다(SameSite=Lax에 더한 2중 방어).
 * Origin이 있으면 허용 목록과 정확히 같아야 하고, 없으면 Sec-Fetch-Site가 same-origin이어야 한다. 아니면 403 CSRF_REJECTED.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly web: WebConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!UNSAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    const allowed =
      typeof origin === 'string'
        ? this.web.allowedOrigins.includes(origin)
        : req.headers['sec-fetch-site'] === 'same-origin';
    if (!allowed) throw AppException.of('CSRF_REJECTED');
    return true;
  }
}

/**
 * 기본은 로그인 필수. @Public() 라우트만 열린다. 세션이 있으면 어느 라우트든 req.auth를 채운다.
 * 세션 없이 가입 대기 쿠키만 있으면 403 SIGNUP_REQUIRED, 그 밖에는 401 UNAUTHENTICATED.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionResolver,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const state = await this.sessions.resolve(
      req,
      http.getResponse<Response>(),
    );

    if (state.status === 'AUTHENTICATED') {
      req.auth = { user: state.user, session: state.session };
      return true;
    }
    if (metadata<boolean>(this.reflector, IS_PUBLIC_KEY, ctx)) return true;
    if (state.status === 'SIGNUP_REQUIRED') {
      throw AppException.of('SIGNUP_REQUIRED');
    }
    throw new UnauthenticatedError();
  }
}

/**
 * 로그인한 사용자가 가입 필수 동의(TOS·PRIVACY·AGE14)의 현재 버전에 동의했는지 모든 요청에서 확인한다.
 * 그다음 @RequireConsents()로 지정한 항목을 확인한다. 없으면 403 CONSENT_REQUIRED { missing, required }.
 * @Public() 라우트와 @SkipConsentCheck() 라우트는 건너뛴다.
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly consents: ConsentChecker,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (
      !req.auth ||
      metadata<boolean>(this.reflector, IS_PUBLIC_KEY, ctx) ||
      metadata<boolean>(this.reflector, SKIP_CONSENT_CHECK_KEY, ctx)
    ) {
      return true;
    }
    const userId = req.auth.user.id;

    // 가입 동의가 먼저다(재동의 화면). 그다음 라우트별 동의(연동 시트)
    const signupMissing = await this.consents.findMissing(
      userId,
      SIGNUP_REQUIRED_CONSENTS,
    );
    if (signupMissing.length > 0) throw consentRequired(signupMissing);

    const extra = (
      metadata<readonly ConsentId[]>(
        this.reflector,
        REQUIRED_CONSENTS_KEY,
        ctx,
      ) ?? []
    ).filter(
      (id) => !(SIGNUP_REQUIRED_CONSENTS as readonly ConsentId[]).includes(id),
    );
    const extraMissing = await this.consents.findMissing(userId, extra);
    if (extraMissing.length > 0) throw consentRequired(extraMissing);
    return true;
  }
}

export function consentRequired(required: ConsentRequirement[]) {
  const details: ConsentRequiredDetails = {
    missing: required.map((item) => item.id),
    required,
  };
  return AppException.of('CONSENT_REQUIRED', { details });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 경로에 :tripId 또는 :groupId가 있으면 요청자가 그 그룹의 활성 멤버인지 확인하고 req.membership·req.trip을 채운다.
 * 멤버가 아니거나 나갔거나 그룹·여정이 삭제됐으면 404 NOT_FOUND(존재를 숨긴다). @RequireRole('LEADER')이면 아닐 때 403 NOT_LEADER.
 * 파라미터 이름이 규칙이다. 여정·그룹 ID를 다른 이름(:id 등)으로 받지 않는다.
 */
@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly memberships: MembershipLookup,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const { tripId, groupId } = req.params as Record<
      string,
      string | undefined
    >;
    const role = metadata<MemberRole>(this.reflector, REQUIRED_ROLE_KEY, ctx);

    if (tripId === undefined && groupId === undefined) {
      if (role) {
        throw new Error(
          '@RequireRole()은 :tripId 또는 :groupId 라우트에서만 쓸 수 있습니다',
        );
      }
      return true;
    }
    if (!req.auth) throw new UnauthenticatedError();
    if (
      (tripId !== undefined && !UUID.test(tripId)) ||
      (groupId !== undefined && !UUID.test(groupId))
    ) {
      throw new NotFoundError();
    }

    const found = await this.memberships.find({
      userId: req.auth.user.id,
      tripId,
      groupId,
    });
    if (!found || (tripId !== undefined && found.trip?.id !== tripId)) {
      throw new NotFoundError();
    }
    req.membership = found.membership;
    if (found.trip) req.trip = found.trip;

    if (role && found.membership.role !== role) {
      throw AppException.of('NOT_LEADER');
    }
    return true;
  }
}

/** @RequireTripStatus()가 붙은 라우트에서 req.trip.status를 확인한다. MembershipGuard 다음에 돈다 */
@Injectable()
export class TripStatusGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const required = metadata<RequiredTripStatus>(
      this.reflector,
      REQUIRED_TRIP_STATUS_KEY,
      ctx,
    );
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.membership) {
      throw new Error(
        '@RequireTripStatus()는 :tripId 또는 :groupId 라우트에서만 쓸 수 있습니다',
      );
    }
    if (!req.trip) throw new NotFoundError();
    if (!required.statuses.includes(req.trip.status)) {
      throw AppException.of(required.code);
    }
    return true;
  }
}
