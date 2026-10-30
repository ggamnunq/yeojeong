import { enumObject } from '../enum.js';
import type { FileImportProvider } from './file-import.js';

// 운영자 전용 관리자 페이지(ADMIN) API 타입. 서버 구현은 apps/api/src/admin(README 참고), 화면은 apps/web/src/features/admin.
// 사용자(카카오) 세션과 완전히 분리된 관리자 세션(쿠키 __Host-yj_admin)으로만 부른다. 관리자 env가 없으면 /api/admin/* 전체가 404.
// 시각 = ISO 8601 KST("2026-11-13T14:10:00+09:00"), 날짜 = "YYYY-MM-DD"(KST).

/**
 * 관리자 로그인 시도 제한(WINDOW_SECONDS 고정 창).
 * - 장치 쿠키(로그인에 성공했던 브라우저, 90일)가 없는 요청: 같은 IP(IPv6는 /64)에서 IP_ATTEMPTS번, 서비스 전체에서 성공 없이 GLOBAL_ATTEMPTS번을 넘으면 429
 * - 유효한 장치 쿠키가 있는 요청: 전체 잠금에서 빠지고 그 장치만 DEVICE_ATTEMPTS번(운영자가 전체 잠금으로 무기한 막히지 않게 — OWASP device cookie)
 * 성공하면 그 요청의 카운터가 0으로 돌아간다.
 */
export const ADMIN_LOGIN_LIMIT = {
  IP_ATTEMPTS: 5,
  GLOBAL_ATTEMPTS: 20,
  DEVICE_ATTEMPTS: 5,
  WINDOW_SECONDS: 900,
} as const;
/** 파괴적 조치(탈퇴 처리)의 재인증(비밀번호 + 인증 코드) 시도 제한: 관리자 세션마다 WINDOW_SECONDS에 ATTEMPTS번 */
export const ADMIN_STEP_UP_LIMIT = { ATTEMPTS: 5, WINDOW_SECONDS: 900 } as const;
/** 2단계 인증(TOTP, RFC 6238): 30초 · 6자리 · 앞뒤 1창 허용, 같은 코드(창) 재사용 금지 */
export const ADMIN_TOTP = { DIGITS: 6, PERIOD_SECONDS: 30 } as const;
/** 관리자 세션 수명: 마지막 요청 뒤 IDLE_SECONDS(유휴), 로그인 뒤 ABSOLUTE_SECONDS(절대) 중 먼저 오는 때 */
export const ADMIN_SESSION_TTL = { IDLE_SECONDS: 1800, ABSOLUTE_SECONDS: 28_800 } as const;
/** 회원 목록 한 페이지 기본·최대 건수 */
export const ADMIN_USER_PAGE_SIZE = { DEFAULT: 20, MAX: 50 } as const;
/** 회원 탈퇴 처리 사유 글자 수 */
export const ADMIN_WITHDRAW_REASON_LENGTH = { MIN: 2, MAX: 200 } as const;
/** 회원 검색어 최대 글자 수(닉네임 부분 일치 또는 사용자 ID 정확 일치) */
export const ADMIN_USER_QUERY_MAX = 36;
/** CODEF 현황의 일별 기록 일수(오늘 포함) */
export const ADMIN_CODEF_DAYS = 14;
/** CODEF 현황의 사용자별 오늘 조회 횟수 상위 N */
export const ADMIN_CODEF_TOP_USERS = 10;

/** POST /api/admin/login 본문. 값은 어디에도 저장·기록하지 않는다 */
export interface AdminLoginRequest {
  username: string;
  password: string;
  /** 인증 앱의 6자리 코드(TOTP). 한 번 쓴 코드는 다시 받지 않는다 */
  totp: string;
}

/** POST /api/admin/login 200 · GET /api/admin/session 200 */
export interface AdminSessionView {
  authenticated: true;
  /** 절대 만료(로그인 + 8시간) */
  expiresAt: string;
  /** 유휴 만료(마지막 요청 + 30분). 요청할 때마다 늦춰진다 */
  idleExpiresAt: string;
}

export const ADMIN_USER_SORT_VALUES = ['createdAt', 'lastLoginAt'] as const;
/** 회원 목록 정렬(모두 최신 순): 가입일 · 최근 로그인 */
export type AdminUserSort = (typeof ADMIN_USER_SORT_VALUES)[number];
export const AdminUserSort = enumObject(ADMIN_USER_SORT_VALUES);

export const ADMIN_USER_STATUS_VALUES = ['ACTIVE', 'DELETION_REQUESTED'] as const;
/** 회원 상태: 활성 · 탈퇴 요청 대기(처리 전 탈퇴 요청이 남아 있음) */
export type AdminUserStatus = (typeof ADMIN_USER_STATUS_VALUES)[number];
export const AdminUserStatus = enumObject(ADMIN_USER_STATUS_VALUES);

/** GET /api/admin/users 쿼리 */
export interface AdminUserListQuery {
  /** 닉네임 부분 일치. 사용자 ID(UUID) 모양이면 ID 정확 일치 */
  q?: string;
  /** 기본 createdAt */
  sort?: AdminUserSort;
  /** 앞 페이지 응답의 nextCursor(정렬이 같아야 한다) */
  cursor?: string;
  /** 기본 20, 최대 50 */
  limit?: number;
}

/** 카드 승인내역 불러오기(S8) 허용 상태 */
export interface AdminCardImportAccess {
  /** env CARD_IMPORT_ALLOWED_USER_IDS에 있는지 */
  allowlisted: boolean;
  /** 관리자 페이지에서 준 권한(feature_grants CARD_IMPORT)이 있는지 */
  granted: boolean;
  /** 지금 이 회원에게 기능이 켜져 있는지(단계·CODEF 키·env 목록·관리자 권한 반영) */
  enabled: boolean;
}

export interface AdminUserListItem {
  id: string;
  nickname: string;
  /** 가입 시각 */
  createdAt: string;
  lastLoginAt: string;
  /** 참여 중인 여정 수(나가지 않았고 삭제되지 않은 그룹) */
  tripCount: number;
  /** 지갑 항목 수(내 지갑 화면과 같은 기준) */
  walletEntryCount: number;
  status: AdminUserStatus;
  cardImport: AdminCardImportAccess;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  /** 다음 페이지가 없으면 null */
  nextCursor: string | null;
}

/** 동의 이력 한 줄(user_consents). 내용은 버전·시각뿐 */
export interface AdminUserConsent {
  consentId: string;
  version: string;
  agreed: boolean;
  agreedAt: string;
  withdrawnAt: string | null;
  withdrawChannel: string | null;
}

/** 회원이 속했던 그룹·여정(이름·상태·기간만) */
export interface AdminUserTrip {
  groupId: string;
  tripId: string | null;
  name: string;
  /** 여정 단계(UPCOMING·ONGOING·ENDED). 여정이 없으면 null */
  tripStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  role: 'LEADER' | 'MEMBER';
  joinedAt: string;
  /** 나간 시각(나가지 않았으면 null) */
  leftAt: string | null;
  /** 그룹·여정이 삭제(소프트)됐는지 */
  deleted: boolean;
}

/**
 * GET /api/admin/users/:userId. 결제·지갑은 건수만 준다(내용·금액·가맹점 없음 — 최소 열람).
 * 카카오 회원번호는 끝 4자리만(고객센터 요청 대조용).
 */
export interface AdminUserDetail extends AdminUserListItem {
  kakaoIdLast4: string | null;
  /** 처리 전 탈퇴 요청. 없으면 null */
  deletionRequest: { requestedAt: string } | null;
  consents: AdminUserConsent[];
  trips: AdminUserTrip[];
  counts: {
    /** 이 회원이 결제자인 여정 결제 수(모든 상태) */
    expenses: number;
    walletEntries: number;
    /** 해제하지 않은 결제수단 수 */
    paymentMethods: number;
    /** 만료·폐기되지 않은 로그인 세션 수 */
    activeSessions: number;
  };
}

/** POST /api/admin/users/:userId/withdraw 본문 */
export interface AdminWithdrawUserRequest {
  /** 처리 사유(2~200자). 접근 기록에 남는다 — 개인정보를 적지 않는다 */
  reason: string;
  /** 확인용으로 다시 입력한 닉네임. 회원 닉네임과 정확히 같아야 한다 */
  confirmNickname: string;
  /** 재인증(step-up): 관리자 비밀번호 */
  password: string;
  /** 재인증(step-up): 지금 인증 앱의 6자리 코드(로그인 때 쓴 코드는 다시 쓸 수 없다) */
  totp: string;
}

/** POST /api/admin/users/:userId/withdraw 200. 서비스 내 탈퇴와 같은 파이프라인(AccountDeletionService, 경로 SUPPORT) */
export interface AdminWithdrawUserResponse {
  status: 'DELETED';
  accountDeletionId: string;
  completedAt: string;
}

/** CODEF 일별 기록 한 줄 */
export interface AdminCodefDay {
  /** KST 날짜 */
  day: string;
  /** codef_daily_usage.calls(예약 포함). 카운터는 7일 보관이라 그 전 날은 null */
  codefCalls: number | null;
  /** 새 조회 시작 수(접근 기록 FETCH_CARD_APPROVALS step START, 1년 보관) */
  fetchStarts: number;
  /** 결과 OK 수(추가 인증 이어가기 포함) */
  successes: number;
  /** 실패 수(OK·TWO_WAY_REQUIRED·PENDING 밖의 결과) */
  failures: number;
}

/** 결과 코드별 건수(오늘). step = START(새 조회) | TWO_WAY(추가 인증 이어가기) */
export interface AdminCodefResultCount {
  step: string;
  /** OK · TWO_WAY_REQUIRED · PENDING(진행 중) · 에러 코드(CARD_LOGIN_FAILED 등) */
  result: string;
  count: number;
}

export interface AdminCodefTopUser {
  userId: string;
  /** 탈퇴한 회원이면 null */
  nickname: string | null;
  /** 오늘 새 조회 수 */
  count: number;
  /** 사용자당 하루 한도(CARD_IMPORT_FETCH_LIMIT.DAILY) */
  limit: number;
}

/** GET /api/admin/codef-usage. 읽기 전용(예산·플래그는 Terraform/env로만 바꾼다) */
export interface AdminCodefUsage {
  /** 기준 시각 */
  asOf: string;
  today: {
    day: string;
    /** 오늘 쓴(또는 예약된) CODEF 호출 수 = codef_daily_usage.calls */
    calls: number;
    /** CODEF_DAILY_CALL_BUDGET */
    budget: number;
    /** calls 중 추가 인증 이어가기가 아직 들고 있는 예약(쓰면 줄고 끝나면 돌려준다) */
    reserved: number;
    /** 지금 진행 중인 조회 수(사용자별 잠금). 조회마다 최대 4를 예약해 둔다 */
    inProgress: number;
    /** max(0, budget − calls) */
    remaining: number;
    fetchStarts: number;
    successes: number;
    failures: number;
    byResult: AdminCodefResultCount[];
    /** 새 조회의 카드사(기관 코드)별 건수 — 집계만 */
    byOrganization: { organization: string; count: number }[];
  };
  /** 최근 14일(오래된 날부터) */
  days: AdminCodefDay[];
  topUsers: AdminCodefTopUser[];
  /** 카드사 로그인 연속 실패로 지금 쉬는 중인 사용자 수 */
  loginCooldownUsers: number;
  /** CODEF 계정 삭제 대기(account 모드) */
  pendingDeletions: { count: number; oldestCreatedAt: string | null };
  flags: {
    /** env FEATURE_CARD_IMPORT 값(off·allowlist·on) */
    featureCardImport: string;
    /** 실제로 쓰는 단계(CODEF 키가 없으면 off) */
    effectiveMode: string;
    /** CODEF_ENV(sandbox·development·production) */
    codefEnv: string;
    /** CODEF_LOGIN_MODE(direct·account) */
    codefLoginMode: string;
    /** CARD_IMPORT_ALLOWED_USER_IDS 인원 수(ID는 내보내지 않는다) */
    allowlistCount: number;
  };
}

// ─── 회원별 기능 권한(ADMIN3, feature_grants) ───

export const FEATURE_KEY_VALUES = ['CARD_IMPORT', 'FILE_IMPORT_WECHAT', 'FILE_IMPORT_ALIPAY'] as const;
/**
 * 회원 단위로 켜고 끌 수 있는 기능(관리자 페이지 "기능 권한", DB enum feature_key와 같은 값).
 * 권한은 그 기능의 전역 단계가 allowlist일 때만 쓴다(on은 모두, off는 아무도 — 권한과 무관).
 * - CARD_IMPORT: 카드 승인내역 불러오기(S8, FEATURE_CARD_IMPORT)
 * - FILE_IMPORT_WECHAT · FILE_IMPORT_ALIPAY: 거래 내역 파일 가져오기(W10 · W11, FEATURE_FILE_IMPORT + FILE_IMPORT_PROVIDERS)
 * 키를 더할 때: 이 목록 · Prisma enum FeatureKey(값 추가 마이그레이션) · 서버 판정(FeatureAccess) · 화면 이름표
 */
export type FeatureKey = (typeof FEATURE_KEY_VALUES)[number];
export const FeatureKey = enumObject(FEATURE_KEY_VALUES);

/** 파일 공급자 → 그 공급자의 기능 권한 키 */
export const FILE_IMPORT_FEATURE_KEY: Readonly<Record<FileImportProvider, FeatureKey>> = {
  WECHAT: 'FILE_IMPORT_WECHAT',
  ALIPAY: 'FILE_IMPORT_ALIPAY',
};

export const FEATURE_MODE_VALUES = ['off', 'allowlist', 'on'] as const;
/** 기능 공개 단계: 끔 · 권한 있는 회원만 · 전체 */
export type FeatureMode = (typeof FEATURE_MODE_VALUES)[number];

/** 기능 권한 메모 최대 글자 수(선택). 개인정보를 적지 않는다 */
export const ADMIN_FEATURE_GRANT_NOTE_MAX = 100;
/** 닉네임·사용자 ID로 찾을 때 보여 줄 최대 회원 수 */
export const ADMIN_FEATURE_GRANT_SEARCH_LIMIT = 20;

export const ADMIN_FEATURE_GRANT_SOURCE_VALUES = ['ADMIN', 'ENV'] as const;
/**
 * 권한 출처: ADMIN = 관리자 페이지에서 준 권한(feature_grants, 회수 가능) ·
 * ENV = env 허용 목록(지금은 카드 불러오기의 CARD_IMPORT_ALLOWED_USER_IDS만 — 하위 호환·비상용, 관리자 페이지에서 회수할 수 없고 tfvars에서 빼야 한다)
 */
export type AdminFeatureGrantSource = (typeof ADMIN_FEATURE_GRANT_SOURCE_VALUES)[number];
export const AdminFeatureGrantSource = enumObject(ADMIN_FEATURE_GRANT_SOURCE_VALUES);

export const ADMIN_FEATURE_OFF_REASON_VALUES = ['CODEF_KEYS_MISSING', 'IMPORT_KEY_MISSING', 'PROVIDER_DISABLED'] as const;
/**
 * 설정 단계와 달리 실제로 꺼진 이유: CODEF 키 없음(카드 불러오기) · 운영 importKey 전용 키 없음(파일 가져오기) ·
 * FILE_IMPORT_PROVIDERS에 그 공급자가 없음
 */
export type AdminFeatureOffReason = (typeof ADMIN_FEATURE_OFF_REASON_VALUES)[number];

/** 기능 하나의 전역 상태(읽기 전용 — 단계·env 목록은 Terraform/env로만 바꾼다) */
export interface AdminFeatureStatus {
  feature: FeatureKey;
  /** env 값(FEATURE_CARD_IMPORT · FEATURE_FILE_IMPORT) */
  configuredMode: FeatureMode;
  /** 실제로 쓰는 단계. 권한은 allowlist일 때만 의미가 있다 */
  effectiveMode: FeatureMode;
  /** effectiveMode가 off인데 configuredMode는 off가 아닐 때 그 이유. 아니면 null */
  offReason: AdminFeatureOffReason | null;
  /** env 허용 목록 인원 수(카드 불러오기만, 그 밖은 0) */
  envUserCount: number;
}

/** 회원 한 명 × 기능 하나 */
export interface AdminFeatureGrantCell {
  feature: FeatureKey;
  /** 비면 권한 없음. ADMIN이 앞 */
  sources: AdminFeatureGrantSource[];
  /** 관리자 페이지에서 준 시각(ADMIN일 때만, 아니면 null) */
  grantedAt: string | null;
  /** 준 관리자 행위자 ID(아이디에서 만든 UUID, ADMIN일 때만) */
  grantedBy: string | null;
  /** 운영 메모(ADMIN일 때만) */
  note: string | null;
  /** 지금 이 회원에게 기능이 켜져 있는지(단계·키·공급자·env 목록·관리자 권한 반영) */
  enabled: boolean;
}

/** 표 한 줄(회원 한 명) */
export interface AdminFeatureGrantRow {
  userId: string;
  /** env에만 있고 회원이 없으면(탈퇴·잘못 넣은 ID) null */
  nickname: string | null;
  /** FEATURE_KEY_VALUES 순서 */
  cells: AdminFeatureGrantCell[];
  /** 카드 불러오기 참고(회원이 없으면 false·0) */
  cardImport: {
    /** CARD_IMPORT 동의가 지금 유효한지 */
    consent: boolean;
    /** 오늘(KST) 새 조회 수(접근 기록 FETCH_CARD_APPROVALS step START) */
    todayFetchCount: number;
  };
}

/** GET /api/admin/feature-grants 쿼리 */
export interface AdminFeatureGrantListQuery {
  /** 비면 권한(관리자·env)이 있는 회원 전부. 닉네임 부분 일치, 사용자 ID(UUID) 모양이면 ID 정확 일치(권한 없어도 보인다) */
  q?: string;
}

/** GET /api/admin/feature-grants 200 */
export interface AdminFeatureGrantList {
  /** 기준 시각 */
  asOf: string;
  /** FEATURE_KEY_VALUES 순서 */
  features: AdminFeatureStatus[];
  /** 카드 불러오기 사용자당 하루 조회 한도(CARD_IMPORT_FETCH_LIMIT.DAILY) */
  cardImportDailyLimit: number;
  /** 검색이 없으면: 최근에 권한을 받은 순 → env에만 있는 항목. 검색이면: 가입 최신 순, 최대 ADMIN_FEATURE_GRANT_SEARCH_LIMIT명 */
  items: AdminFeatureGrantRow[];
  /** 검색 결과가 상한보다 많아 잘렸는지 */
  truncated: boolean;
}

/** POST /api/admin/feature-grants 본문 */
export interface AdminCreateFeatureGrantRequest {
  userId: string;
  feature: FeatureKey;
  /** 선택, 100자까지 */
  note?: string;
}
