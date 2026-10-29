import {
  SetMetadata,
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type {
  ConsentId,
  ErrorCode,
  MemberRole,
  TripStatus,
} from '@yeojeong/shared';
import type { Request } from 'express';
import { UnauthenticatedError } from '../errors/app-exception.js';
import type {
  AuthUser,
  MembershipContext,
  TripContext,
} from './auth-context.js';
import {
  IS_EXTERNAL_WEBHOOK_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_CONSENTS_KEY,
  REQUIRED_ROLE_KEY,
  REQUIRED_TRIP_STATUS_KEY,
  SKIP_CONSENT_CHECK_KEY,
} from './auth.constants.js';

/** 로그인 없이 부를 수 있는 라우트. 세션 쿠키가 있으면 req.auth는 그대로 채워진다 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * 외부 서버가 서버 간으로 부르는 콜백(예: 카카오 연결 끊기 알림). 로그인·CSRF(Origin) 확인을 건너뛰므로
 * **핸들러가 반드시 호출자를 직접 인증**해야 한다(공유 비밀 상수 시간 비교 등). origin lock은 그대로 적용된다.
 */
export const ExternalWebhook = () =>
  applyDecorators(Public(), SetMetadata(IS_EXTERNAL_WEBHOOK_KEY, true));

/**
 * 그룹장만 부를 수 있는 라우트(:tripId 또는 :groupId 필요). 아니면 403 NOT_LEADER.
 * @example @RequireRole('LEADER')
 */
export const RequireRole = (role: Extract<MemberRole, 'LEADER'>) =>
  SetMetadata(REQUIRED_ROLE_KEY, role);

export interface RequiredTripStatus {
  statuses: readonly TripStatus[];
  /** 단계가 맞지 않을 때의 코드. 기본 TRIP_PHASE_INVALID(409) */
  code: ErrorCode;
}

/**
 * 여정 단계가 맞을 때만 통과(:tripId 또는 :groupId 필요). 가드 시점 확인이라 변경 서비스는 트랜잭션에서 다시 확인한다.
 * @example @RequireTripStatus('ONGOING', { code: 'EXPENSE_LOCKED' })
 * @example @RequireTripStatus(['UPCOMING', 'ONGOING'])
 */
export const RequireTripStatus = (
  statuses: TripStatus | readonly TripStatus[],
  options: { code?: ErrorCode } = {},
) =>
  SetMetadata(REQUIRED_TRIP_STATUS_KEY, {
    statuses: typeof statuses === 'string' ? [statuses] : statuses,
    code: options.code ?? 'TRIP_PHASE_INVALID',
  } satisfies RequiredTripStatus);

/**
 * 가입 필수 동의(TOS·PRIVACY·AGE14, 전역 확인) 외에 이 라우트에서 더 필요한 동의. 없으면 403 CONSENT_REQUIRED.
 * @example @RequireConsents(FIN_LINK_REQUIRED_CONSENTS) // 결제수단 연결·재연결·지갑 추가
 */
export const RequireConsents = (consentIds: readonly ConsentId[]) =>
  SetMetadata(REQUIRED_CONSENTS_KEY, consentIds);

/** 재동의 전에도 부를 수 있어야 하는 라우트(재동의, 탈퇴·삭제 요청). 로그인은 여전히 필요하다 */
export const SkipConsentCheck = () => SetMetadata(SKIP_CONSENT_CHECK_KEY, true);

/**
 * 로그인한 사용자. 기본은 없으면 401(@Public 라우트에서 실수로 써도 안전하게).
 * @example me(@CurrentUser() user: AuthUser)
 * @example session(@CurrentUser({ optional: true }) user?: AuthUser)
 */
export const CurrentUser = createParamDecorator(
  (
    options: { optional?: boolean } | undefined,
    ctx: ExecutionContext,
  ): AuthUser | undefined => {
    const auth = ctx.switchToHttp().getRequest<Request>().auth;
    if (auth) return auth.user;
    if (options?.optional) return undefined;
    throw new UnauthenticatedError();
  },
);

/** :tripId/:groupId 라우트에서 내 멤버십. MembershipGuard가 채운다 */
export const CurrentMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): MembershipContext => {
    const membership = ctx.switchToHttp().getRequest<Request>().membership;
    if (!membership) {
      throw new Error(
        '@CurrentMembership()은 :tripId 또는 :groupId 라우트에서만 쓸 수 있습니다',
      );
    }
    return membership;
  },
);

/** :tripId/:groupId 라우트의 여정 요약. MembershipGuard가 채운다 */
export const CurrentTrip = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TripContext => {
    const trip = ctx.switchToHttp().getRequest<Request>().trip;
    if (!trip) {
      throw new Error(
        '@CurrentTrip()은 :tripId 또는 :groupId 라우트에서만 쓸 수 있습니다',
      );
    }
    return trip;
  },
);
