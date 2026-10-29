import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FeatureFlags as FeatureFlagsView } from '@yeojeong/shared';
import { NotFoundError } from './errors/app-exception.js';

/** env 불리언: 비면 기본값, "true"/"false"(대소문자 무시)만 받는다. 그 밖이면 부팅을 멈춘다 */
export function parseBooleanEnv(
  name: string,
  raw: string | undefined,
  fallback: boolean,
): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name}는 true 또는 false여야 합니다: ${value}`);
}

/**
 * 기능 플래그(FR-006, GET /api/auth/session → features). AuthCoreModule(전역)이 제공한다.
 * - FEATURE_ACCOUNT_LINK(기본 false): 계좌·카드 자동 불러오기(토스 연결).
 *   카드 내역 자동 수집은 마이데이터 허가(또는 허가받은 제휴사)가 있어야 해 지금은 숨긴다(S7, L-10).
 *   false면 연동 전용 API가 404(AccountLinkGuard), 주기·소급·FINAL 동기화는 대상 0건, 연결 만료 표시는 false.
 *   코드·스키마·DEMO 어댑터는 그대로 둔다(켜면 그대로 동작한다).
 */
@Injectable()
export class FeatureFlags {
  readonly accountLink: boolean;

  constructor(config: ConfigService) {
    this.accountLink = parseBooleanEnv(
      'FEATURE_ACCOUNT_LINK',
      config.get<string>('FEATURE_ACCOUNT_LINK'),
      false,
    );
  }

  view(): FeatureFlagsView {
    return { accountLink: this.accountLink };
  }
}

/**
 * 연동 전용 라우트(토스 연결·결제수단 동기화·해제·기간 외 후보·연동 동의)를 accountLink=false일 때 404로 숨긴다(FR-006).
 * 기능이 있다는 것 자체를 드러내지 않으려고 403이 아니라 404다. 로그인 확인 등 전역 가드 뒤에 돈다.
 * @example @UseGuards(AccountLinkGuard)
 */
@Injectable()
export class AccountLinkGuard implements CanActivate {
  constructor(private readonly features: FeatureFlags) {}

  canActivate(_ctx: ExecutionContext): boolean {
    if (!this.features.accountLink) throw new NotFoundError();
    return true;
  }
}
