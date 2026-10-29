import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FeatureFlags as FeatureFlagsView } from '@yeojeong/shared';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
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
 *   여기서는 env 목록만 본다. 관리자 페이지에서 준 권한(card_import_grants)까지 합친 판정은 CardImportAccess다.
 *   CODEF 키(CODEF_CLIENT_ID·CODEF_CLIENT_SECRET·CODEF_PUBLIC_KEY)가 하나라도 없으면 단계와 무관하게 off다.
 *   운영에서는 importKey 전용 키(IMPORT_KEY_HMAC_KEY)도 있어야 한다.
 *   꺼진 사용자에게는 /api/card-import/*·POST /api/wallet/entries/import가 404(CardImportGuard), 세션 features.cardImport = false
 */
@Injectable()
export class FeatureFlags {
  readonly accountLink: boolean;
  /** 실제로 쓰는 단계(CODEF 키가 없으면 off) */
  readonly cardImportMode: CardImportMode;
  /** env CARD_IMPORT_ALLOWED_USER_IDS(소문자). 관리자 페이지에서 회수할 수 없다 */
  readonly cardImportEnvAllowlist: ReadonlySet<string>;

  constructor(config: ConfigService) {
    this.accountLink = parseBooleanEnv(
      'FEATURE_ACCOUNT_LINK',
      config.get<string>('FEATURE_ACCOUNT_LINK'),
      false,
    );
    const mode = parseCardImportMode(config.get<string>('FEATURE_CARD_IMPORT'));
    this.cardImportEnvAllowlist = parseAllowedUserIds(
      config.get<string>('CARD_IMPORT_ALLOWED_USER_IDS'),
    );
    // importKey 전용 키는 운영에서만 필수(로컬·테스트는 고정 개발 키 — card-import/import-key.ts)
    const required =
      config.get<string>('NODE_ENV') === 'production'
        ? [...CODEF_KEY_ENVS, 'IMPORT_KEY_HMAC_KEY']
        : CODEF_KEY_ENVS;
    const codefConfigured = required.every(
      (name) => (config.get<string>(name) ?? '').trim() !== '',
    );
    this.cardImportMode = codefConfigured ? mode : 'off';
  }

  /**
   * env만으로 이 사용자에게 카드 승인내역 불러오기가 켜져 있는지(비로그인은 on일 때만).
   * 관리자 페이지 권한(DB)은 보지 않는다 — 요청 판정은 CardImportAccess.enabledFor를 쓴다
   */
  cardImportFor(userId: string | null | undefined): boolean {
    if (this.cardImportMode === 'on') return true;
    if (this.cardImportMode === 'off' || !userId) return false;
    return this.cardImportEnvAllowlist.has(userId.toLowerCase());
  }

  /** 세션 응답의 features(env 기준). 관리자 권한까지 합친 값은 CardImportAccess.view */
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

/** 요청마다 한 번만 DB를 본다(세션 응답·가드·동의 확인이 같은 요청에서 다시 물어도) */
const GRANT_CACHE = new WeakMap<object, Map<string, Promise<boolean>>>();

/**
 * 카드 승인내역 불러오기(S8) 사용자별 판정 = env(FeatureFlags) + 관리자 페이지 권한(card_import_grants).
 * - on: 모두 · off(또는 CODEF 키 없음): 아무도 — 권한 행과 무관
 * - allowlist: env CARD_IMPORT_ALLOWED_USER_IDS **또는** card_import_grants에 있는 사용자. env는 하위 호환·비상용으로 남긴다
 * 권한 행은 요청마다 읽는다(인스턴스 캐시 없음 — 회수하면 다음 요청부터 바로 404). 같은 요청 안에서는 req에 묶어 한 번만 읽는다.
 */
@Injectable()
export class CardImportAccess {
  constructor(
    private readonly features: FeatureFlags,
    private readonly prisma: PrismaService,
  ) {}

  /** 이 사용자에게 켜져 있는지. req를 주면 같은 요청 안의 DB 조회를 한 번으로 줄인다 */
  async enabledFor(
    userId: string | null | undefined,
    req?: object,
  ): Promise<boolean> {
    if (this.features.cardImportFor(userId)) return true;
    if (!this.grantApplies(userId)) return false;
    return this.granted(userId, req);
  }

  /** 세션 응답의 features(관리자 권한 반영) */
  async view(
    userId: string | null | undefined,
    req?: object,
  ): Promise<FeatureFlagsView> {
    const base = this.features.view(userId);
    if (base.cardImport || !this.grantApplies(userId)) return base;
    return { ...base, cardImport: await this.granted(userId, req) };
  }

  /** 권한 행을 이미 읽었을 때(관리자 회원 목록처럼 여럿을 한 번에) */
  enabledWithGrant(userId: string, granted: boolean): boolean {
    return (
      this.features.cardImportFor(userId) ||
      (granted && this.features.cardImportMode === 'allowlist')
    );
  }

  /** allowlist 단계이고 UUID 모양인 사용자만 권한 행을 볼 필요가 있다 */
  private grantApplies(userId: string | null | undefined): userId is string {
    return (
      this.features.cardImportMode === 'allowlist' &&
      !!userId &&
      UUID.test(userId)
    );
  }

  private granted(userId: string, req?: object): Promise<boolean> {
    const id = userId.toLowerCase();
    const lookup = () =>
      this.prisma.cardImportGrant
        .findUnique({ where: { userId: id }, select: { userId: true } })
        .then((row) => row !== null);
    if (!req) return lookup();
    let cache = GRANT_CACHE.get(req);
    if (!cache) {
      cache = new Map();
      GRANT_CACHE.set(req, cache);
    }
    let pending = cache.get(id);
    if (!pending) {
      pending = lookup();
      // 실패는 캐시하지 않는다(같은 요청에서 다시 물으면 다시 읽는다)
      pending.catch(() => cache.delete(id));
      cache.set(id, pending);
    }
    return pending;
  }
}

/**
 * 카드 승인내역 불러오기(S8) 라우트를 그 사용자에게 꺼져 있으면 404로 숨긴다(AccountLinkGuard와 같은 이유로 403이 아니다).
 * env 목록과 관리자 페이지 권한(CardImportAccess)을 함께 본다. 전역 AuthGuard 뒤에 돌아 req.auth가 있다. @example @UseGuards(CardImportGuard)
 */
@Injectable()
export class CardImportGuard implements CanActivate {
  constructor(private readonly access: CardImportAccess) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!(await this.access.enabledFor(req.auth?.user.id, req)))
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
