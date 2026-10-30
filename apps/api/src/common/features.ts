import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FILE_IMPORT_FEATURE_KEY,
  FILE_IMPORT_PROVIDER_VALUES,
  type FeatureFlags as FeatureFlagsView,
  type FeatureKey,
  type FileImportProvider,
} from '@yeojeong/shared';
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

export const FILE_IMPORT_MODE_VALUES = ['off', 'allowlist', 'on'] as const;
/**
 * 거래 내역 파일 가져오기(W10 · W11) 공개 단계: 끔 · 공급자별 권한(feature_grants FILE_IMPORT_*)을 받은 회원만 · 전체.
 * 공급자별로는 FILE_IMPORT_PROVIDERS(allowlist여도 목록에 없는 공급자는 아무에게도 켜지지 않는다)
 */
export type FileImportMode = (typeof FILE_IMPORT_MODE_VALUES)[number];

/** env FEATURE_FILE_IMPORT: 비면 off. off·allowlist·on(대소문자 무시)만 받고 그 밖이면 부팅을 멈춘다 */
export function parseFileImportMode(raw: string | undefined): FileImportMode {
  const value = raw?.trim().toLowerCase();
  if (!value) return 'off';
  if ((FILE_IMPORT_MODE_VALUES as readonly string[]).includes(value)) {
    return value as FileImportMode;
  }
  throw new Error(
    `FEATURE_FILE_IMPORT는 off·allowlist·on 중 하나여야 합니다: ${value}`,
  );
}

/** FILE_IMPORT_PROVIDERS가 비었을 때: 위챗페이만(W10 동작 그대로 — 알리페이는 명시해야 켜진다) */
export const DEFAULT_FILE_IMPORT_PROVIDERS: readonly FileImportProvider[] = [
  'WECHAT',
];

/**
 * env FILE_IMPORT_PROVIDERS: 쉼표로 구분한 공급자(대소문자 무시, 예: "WECHAT,ALIPAY"). 비면 DEFAULT_FILE_IMPORT_PROVIDERS.
 * 모르는 값이면 부팅을 멈춘다. 결과는 FILE_IMPORT_PROVIDER_VALUES 순서(중복 없음)
 */
export function parseFileImportProviders(
  raw: string | undefined,
): FileImportProvider[] {
  const values = (raw ?? '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter((v) => v !== '');
  if (values.length === 0) return [...DEFAULT_FILE_IMPORT_PROVIDERS];
  const unknown = values.filter(
    (v) => !(FILE_IMPORT_PROVIDER_VALUES as readonly string[]).includes(v),
  );
  if (unknown.length > 0) {
    throw new Error(
      `FILE_IMPORT_PROVIDERS는 ${FILE_IMPORT_PROVIDER_VALUES.join('·')}를 쉼표로 구분한 값이어야 합니다: ${unknown.join(',')}`,
    );
  }
  return FILE_IMPORT_PROVIDER_VALUES.filter((p) => values.includes(p));
}

/**
 * 기능 플래그(FR-006, GET /api/auth/session → features). AuthCoreModule(전역)이 제공한다. env만 본다 —
 * 관리자 페이지에서 준 회원별 권한(feature_grants)까지 합친 판정은 FeatureAccess다.
 * - FEATURE_ACCOUNT_LINK(기본 false): 계좌·카드 자동 불러오기(토스 연결).
 *   카드 내역 자동 수집은 마이데이터 허가(또는 허가받은 제휴사)가 있어야 해 지금은 숨긴다(S7, L-10).
 *   false면 연동 전용 API가 404(AccountLinkGuard), 주기·소급·FINAL 동기화는 대상 0건, 연결 만료 표시는 false.
 *   코드·스키마·DEMO 어댑터는 그대로 둔다(켜면 그대로 동작한다).
 * - FEATURE_CARD_IMPORT(기본 off): 카드 승인내역 불러오기(S8, CODEF 일회성 조회). off | allowlist | on.
 *   allowlist면 CARD_IMPORT_ALLOWED_USER_IDS(쉼표 구분 사용자 ID, tfvars로만 넣는다) 또는 관리자 권한(CARD_IMPORT)이 있는 사용자만 켜진다.
 *   CODEF 키(CODEF_CLIENT_ID·CODEF_CLIENT_SECRET·CODEF_PUBLIC_KEY)가 하나라도 없으면 단계와 무관하게 off다.
 *   운영에서는 importKey 전용 키(IMPORT_KEY_HMAC_KEY)도 있어야 한다.
 *   꺼진 사용자에게는 /api/card-import/*·POST /api/wallet/entries/import가 404(CardImportGuard), 세션 features.cardImport = false
 * - FEATURE_FILE_IMPORT(기본 off): 거래 내역 파일 가져오기(W10 위챗페이 · W11 알리페이). off | allowlist | on.
 *   allowlist면 공급자별 관리자 권한(FILE_IMPORT_WECHAT·FILE_IMPORT_ALIPAY)이 있는 사용자만 그 공급자가 켜진다(env 목록은 없다).
 *   운영에서는 importKey 전용 키(IMPORT_KEY_HMAC_KEY)가 없으면 off다. 꺼진 사용자에게는 /api/wallet/entries/file-import*가 404(FileImportGuard)
 * - FILE_IMPORT_PROVIDERS(기본 "WECHAT"): 켤 공급자(W11 알리페이는 "WECHAT,ALIPAY"처럼 더해야 켜진다). allowlist여도 목록에 없는 공급자는 아무에게도 켜지지 않는다.
 *   그 사용자에게 켜지지 않은 공급자로 요청하면 404(FileImportController). 세션 features.fileImportProviders
 */
@Injectable()
export class FeatureFlags {
  readonly accountLink: boolean;
  /** env FEATURE_CARD_IMPORT 값 그대로 */
  readonly cardImportConfiguredMode: CardImportMode;
  /** 실제로 쓰는 단계(CODEF 키가 없으면 off) */
  readonly cardImportMode: CardImportMode;
  /** env CARD_IMPORT_ALLOWED_USER_IDS(소문자). 관리자 페이지에서 회수할 수 없다 */
  readonly cardImportEnvAllowlist: ReadonlySet<string>;
  /** env FEATURE_FILE_IMPORT 값 그대로 */
  readonly fileImportConfiguredMode: FileImportMode;
  /** 거래 내역 파일 가져오기(W10 · W11) 실제 단계. 운영에서 IMPORT_KEY_HMAC_KEY가 없으면 off */
  readonly fileImportMode: FileImportMode;
  /** env FILE_IMPORT_PROVIDERS(기능이 꺼져 있으면 빈 배열). allowlist면 회원마다 이 중 권한 있는 공급자만 켜진다 */
  readonly fileImportProviders: readonly FileImportProvider[];

  constructor(config: ConfigService) {
    // 공급자 목록은 기능이 꺼져 있어도 검사한다(잘못된 값이면 켜기 전에 부팅에서 드러나게)
    const providers = parseFileImportProviders(
      config.get<string>('FILE_IMPORT_PROVIDERS'),
    );
    this.fileImportConfiguredMode = parseFileImportMode(
      config.get<string>('FEATURE_FILE_IMPORT'),
    );
    this.fileImportMode = importKeyConfigured(config)
      ? this.fileImportConfiguredMode
      : 'off';
    this.fileImportProviders = this.fileImportMode === 'off' ? [] : providers;
    this.accountLink = parseBooleanEnv(
      'FEATURE_ACCOUNT_LINK',
      config.get<string>('FEATURE_ACCOUNT_LINK'),
      false,
    );
    this.cardImportConfiguredMode = parseCardImportMode(
      config.get<string>('FEATURE_CARD_IMPORT'),
    );
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
    this.cardImportMode = codefConfigured
      ? this.cardImportConfiguredMode
      : 'off';
  }

  /**
   * env만으로 이 사용자에게 카드 승인내역 불러오기가 켜져 있는지(비로그인은 on일 때만).
   * 관리자 페이지 권한(DB)은 보지 않는다 — 요청 판정은 FeatureAccess.cardImportFor를 쓴다
   */
  cardImportFor(userId: string | null | undefined): boolean {
    if (this.cardImportMode === 'on') return true;
    if (this.cardImportMode === 'off' || !userId) return false;
    return this.cardImportEnvAllowlist.has(userId.toLowerCase());
  }

  /** env만 본 세션 features(관리자 권한 없이). 요청 응답은 FeatureAccess.view */
  view(userId?: string | null): FeatureFlagsView {
    const fileImport = this.fileImportMode === 'on';
    return {
      accountLink: this.accountLink,
      cardImport: this.cardImportFor(userId),
      fileImport,
      fileImportProviders: fileImport ? [...this.fileImportProviders] : [],
    };
  }

  /** 이 공급자가 누군가에게는 켜질 수 있는가(FEATURE_FILE_IMPORT ≠ off + FILE_IMPORT_PROVIDERS). 회원별 판정은 FeatureAccess */
  fileImportProviderEnabled(provider: FileImportProvider): boolean {
    return this.fileImportProviders.includes(provider);
  }
}

/** 카드 승인내역 불러오기(S8)에 꼭 필요한 CODEF env. 값은 Secret Manager에서 온다(infra/envs/prod enable_codef) */
export const CODEF_KEY_ENVS = [
  'CODEF_CLIENT_ID',
  'CODEF_CLIENT_SECRET',
  'CODEF_PUBLIC_KEY',
] as const;

type GrantSet = ReadonlySet<FeatureKey>;

/** 요청마다 한 번만 DB를 본다(세션 응답·가드·동의 확인·컨트롤러가 같은 요청에서 다시 물어도) */
const GRANT_CACHE = new WeakMap<object, Map<string, Promise<GrantSet>>>();

/**
 * 회원별 기능 판정 = env(FeatureFlags) + 관리자 페이지 권한(feature_grants, ADMIN3).
 * - 카드 불러오기: on은 모두 · off(또는 CODEF 키 없음)는 아무도 · allowlist는 env CARD_IMPORT_ALLOWED_USER_IDS **또는** CARD_IMPORT 권한.
 * - 파일 가져오기: on은 FILE_IMPORT_PROVIDERS 전부 · off(또는 운영 importKey 키 없음)는 없음 ·
 *   allowlist는 FILE_IMPORT_PROVIDERS 중 그 공급자의 권한(FILE_IMPORT_WECHAT·FILE_IMPORT_ALIPAY)이 있는 것만.
 * 권한 행은 그 기능이 allowlist일 때만, 요청마다 읽는다(인스턴스 캐시 없음 — 회수하면 다음 요청부터 바로 404).
 * 같은 요청 안에서는 req에 묶어 회원의 권한 행을 한 번만 읽는다.
 */
@Injectable()
export class FeatureAccess {
  constructor(
    private readonly features: FeatureFlags,
    private readonly prisma: PrismaService,
  ) {}

  /** 카드 승인내역 불러오기가 이 사용자에게 켜져 있는지. req를 주면 같은 요청 안의 DB 조회를 한 번으로 줄인다 */
  async cardImportFor(
    userId: string | null | undefined,
    req?: object,
  ): Promise<boolean> {
    if (this.features.cardImportFor(userId)) return true;
    if (this.features.cardImportMode !== 'allowlist' || !isUserId(userId)) {
      return false;
    }
    return (await this.grantsOf(userId, req)).has('CARD_IMPORT');
  }

  /** 이 사용자에게 켜진 파일 공급자(FILE_IMPORT_PROVIDER_VALUES 순서) */
  async fileImportProvidersFor(
    userId: string | null | undefined,
    req?: object,
  ): Promise<FileImportProvider[]> {
    if (this.features.fileImportMode !== 'allowlist') {
      return this.fileImportProvidersWithGrants(new Set());
    }
    if (!isUserId(userId) || this.features.fileImportProviders.length === 0) {
      return [];
    }
    return this.fileImportProvidersWithGrants(await this.grantsOf(userId, req));
  }

  /** 이 사용자에게 이 공급자의 파일 가져오기가 켜져 있는지 */
  async fileImportFor(
    userId: string | null | undefined,
    provider: FileImportProvider,
    req?: object,
  ): Promise<boolean> {
    return (await this.fileImportProvidersFor(userId, req)).includes(provider);
  }

  /** 세션 응답의 features(관리자 권한 반영) */
  async view(
    userId: string | null | undefined,
    req: object = {},
  ): Promise<FeatureFlagsView> {
    const [cardImport, fileImportProviders] = await Promise.all([
      this.cardImportFor(userId, req),
      this.fileImportProvidersFor(userId, req),
    ]);
    return {
      accountLink: this.features.accountLink,
      cardImport,
      fileImport: fileImportProviders.length > 0,
      fileImportProviders,
    };
  }

  /** 권한 행을 이미 읽었을 때(관리자 회원 목록·권한 표처럼 여럿을 한 번에): 이 기능이 지금 켜져 있는지 */
  enabledWithGrants(userId: string, feature: FeatureKey, grants: GrantSet) {
    if (feature === 'CARD_IMPORT') {
      return (
        this.features.cardImportFor(userId) ||
        (this.features.cardImportMode === 'allowlist' && grants.has(feature))
      );
    }
    return this.fileImportProvidersWithGrants(grants).some(
      (provider) => FILE_IMPORT_FEATURE_KEY[provider] === feature,
    );
  }

  private fileImportProvidersWithGrants(
    grants: GrantSet,
  ): FileImportProvider[] {
    const { fileImportMode, fileImportProviders } = this.features;
    if (fileImportMode === 'on') return [...(fileImportProviders ?? [])];
    if (fileImportMode !== 'allowlist') return [];
    return fileImportProviders.filter((provider) =>
      grants.has(FILE_IMPORT_FEATURE_KEY[provider]),
    );
  }

  private grantsOf(userId: string, req?: object): Promise<GrantSet> {
    const id = userId.toLowerCase();
    const lookup = () =>
      this.prisma.featureGrant
        .findMany({ where: { userId: id }, select: { feature: true } })
        .then((rows): GrantSet => new Set(rows.map((row) => row.feature)));
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

/** UUID 모양인 사용자만 권한 행을 볼 필요가 있다 */
function isUserId(userId: string | null | undefined): userId is string {
  return !!userId && UUID.test(userId);
}

/**
 * 카드 승인내역 불러오기(S8) 라우트를 그 사용자에게 꺼져 있으면 404로 숨긴다(AccountLinkGuard와 같은 이유로 403이 아니다).
 * env 목록과 관리자 페이지 권한(FeatureAccess)을 함께 본다. 전역 AuthGuard 뒤에 돌아 req.auth가 있다. @example @UseGuards(CardImportGuard)
 */
@Injectable()
export class CardImportGuard implements CanActivate {
  constructor(private readonly access: FeatureAccess) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!(await this.access.cardImportFor(req.auth?.user.id, req))) {
      throw new NotFoundError();
    }
    return true;
  }
}

/** 운영이면 importKey 전용 키(IMPORT_KEY_HMAC_KEY)가 있어야 파일 가져오기를 켠다(로컬·테스트는 고정 개발 키) */
function importKeyConfigured(config: ConfigService): boolean {
  if (config.get<string>('NODE_ENV') !== 'production') return true;
  return (config.get<string>('IMPORT_KEY_HMAC_KEY') ?? '').trim() !== '';
}

/**
 * 거래 내역 파일 가져오기(W10 · W11) 라우트를 그 사용자에게 켜진 공급자가 하나도 없으면 404로 숨긴다(CardImportGuard와 같은 이유).
 * allowlist면 회원별 권한을 본다. 공급자별 판정은 FileImportController가 같은 요청 캐시로 한 번 더 한다. @example @UseGuards(FileImportGuard)
 */
@Injectable()
export class FileImportGuard implements CanActivate {
  constructor(private readonly access: FeatureAccess) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const providers = await this.access.fileImportProvidersFor(
      req.auth?.user.id,
      req,
    );
    if (providers.length === 0) throw new NotFoundError();
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
