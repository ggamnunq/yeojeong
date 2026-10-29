import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FeatureFlags as FeatureFlagsView } from '@yeojeong/shared';
import type { Request } from 'express';
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

export const CARD_IMPORT_MODE_VALUES = ['off', 'allowlist', 'on'] as const;
/** 카드 승인내역 불러오기(S8) 공개 단계: 끔 · 허용 목록 사용자만(운영자 실테스트) · 전체 공개(법률 자문 L-25 뒤) */
export type CardImportMode = (typeof CARD_IMPORT_MODE_VALUES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** env 단계 값: 비면 off. off·allowlist·on(대소문자 무시)만 받고 그 밖이면 부팅을 멈춘다 */
export function parseCardImportMode(raw: string | undefined): CardImportMode {
  const value = raw?.trim().toLowerCase();
  if (!value) return 'off';
  if ((CARD_IMPORT_MODE_VALUES as readonly string[]).includes(value)) {
    return value as CardImportMode;
  }
  throw new Error(
    `FEATURE_CARD_IMPORT는 off·allowlist·on 중 하나여야 합니다: ${value}`,
  );
}

/** 쉼표로 구분한 사용자 ID(UUID). 형식이 틀리면 부팅을 멈춘다(값은 메시지에 넣지 않는다) */
export function parseAllowedUserIds(
  raw: string | undefined,
): ReadonlySet<string> {
  const ids = (raw ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v !== '');
  if (ids.some((id) => !UUID.test(id))) {
    throw new Error(
      'CARD_IMPORT_ALLOWED_USER_IDS는 쉼표로 구분한 사용자 UUID여야 합니다',
    );
  }
  return new Set(ids);
}

/**
 * 기능 플래그(FR-006, GET /api/auth/session → features). AuthCoreModule(전역)이 제공한다.
 * - FEATURE_ACCOUNT_LINK(기본 false): 계좌·카드 자동 불러오기(토스 연결).
 *   카드 내역 자동 수집은 마이데이터 허가(또는 허가받은 제휴사)가 있어야 해 지금은 숨긴다(S7, L-10).
 *   false면 연동 전용 API가 404(AccountLinkGuard), 주기·소급·FINAL 동기화는 대상 0건, 연결 만료 표시는 false.
 *   코드·스키마·DEMO 어댑터는 그대로 둔다(켜면 그대로 동작한다).
 * - FEATURE_CARD_IMPORT(기본 off): 카드 승인내역 불러오기(S8, CODEF 일회성 조회). off | allowlist | on.
 *   allowlist면 CARD_IMPORT_ALLOWED_USER_IDS(쉼표 구분 사용자 ID, tfvars로만 넣는다)에 있는 사용자만 켜진다.
 *   CODEF 키(CODEF_CLIENT_ID·CODEF_CLIENT_SECRET·CODEF_PUBLIC_KEY)가 하나라도 없으면 단계와 무관하게 off다.
 *   꺼진 사용자에게는 /api/card-import/*·POST /api/wallet/entries/import가 404(CardImportGuard), 세션 features.cardImport = false
 */
@Injectable()
export class FeatureFlags {
  readonly accountLink: boolean;
  /** 실제로 쓰는 단계(CODEF 키가 없으면 off) */
  readonly cardImportMode: CardImportMode;
  private readonly cardImportAllowed: ReadonlySet<string>;

  constructor(config: ConfigService) {
    this.accountLink = parseBooleanEnv(
      'FEATURE_ACCOUNT_LINK',
      config.get<string>('FEATURE_ACCOUNT_LINK'),
      false,
    );
    const mode = parseCardImportMode(config.get<string>('FEATURE_CARD_IMPORT'));
    this.cardImportAllowed = parseAllowedUserIds(
      config.get<string>('CARD_IMPORT_ALLOWED_USER_IDS'),
    );
    const codefConfigured = CODEF_KEY_ENVS.every(
      (name) => (config.get<string>(name) ?? '').trim() !== '',
    );
    this.cardImportMode = codefConfigured ? mode : 'off';
  }

  /** 이 사용자에게 카드 승인내역 불러오기가 켜져 있는지(비로그인은 on일 때만) */
  cardImportFor(userId: string | null | undefined): boolean {
    if (this.cardImportMode === 'on') return true;
    if (this.cardImportMode === 'off' || !userId) return false;
    return this.cardImportAllowed.has(userId.toLowerCase());
  }

  /** 세션 응답의 features. 로그인한 사용자면 그 사용자 기준(allowlist) */
  view(userId?: string | null): FeatureFlagsView {
    return {
      accountLink: this.accountLink,
      cardImport: this.cardImportFor(userId),
    };
  }
}

/** 카드 승인내역 불러오기(S8)에 꼭 필요한 CODEF env. 값은 Secret Manager에서 온다(infra/envs/prod enable_codef) */
export const CODEF_KEY_ENVS = [
  'CODEF_CLIENT_ID',
  'CODEF_CLIENT_SECRET',
  'CODEF_PUBLIC_KEY',
] as const;

/**
 * 카드 승인내역 불러오기(S8) 라우트를 그 사용자에게 꺼져 있으면 404로 숨긴다(AccountLinkGuard와 같은 이유로 403이 아니다).
 * 전역 AuthGuard 뒤에 돌아 req.auth가 있다. @example @UseGuards(CardImportGuard)
 */
@Injectable()
export class CardImportGuard implements CanActivate {
  constructor(private readonly features: FeatureFlags) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!this.features.cardImportFor(req.auth?.user.id))
      throw new NotFoundError();
    return true;
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
