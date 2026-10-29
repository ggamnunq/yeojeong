/**
 * API 에러 응답 형식. 성공 응답은 감싸지 않고 데이터를 그대로 보낸다.
 * message는 화면에 그대로 보여도 되는 한국어 한 문장이다.
 */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: ApiErrorDetails;
  requestId: string;
}

export type ApiErrorDetails = { fields?: FieldError[] } & Record<
  string,
  unknown
>;

/** 입력 검증 실패(VALIDATION_FAILED) 때 details.fields에 필드마다, 제약마다 하나씩 담긴다 */
export interface FieldError {
  /** 중첩 필드는 점으로 잇는다 (예: items.0.amount) */
  path: string;
  /** class-validator 제약 이름 (예: isString, maxLength) */
  code?: string;
  message: string;
}

export interface ErrorDefinition {
  /** AppException.of(code)로 던질 때 쓰는 기본 HTTP 상태 */
  status: number;
  /** 기본 문구. 화면이 응답을 받지 못했을 때의 대체 문구로도 쓴다 */
  message: string;
}

/** API 서버(Nest)가 응답 본문에 담아 보내는 공통 코드 */
export const COMMON_ERRORS = {
  BAD_REQUEST: { status: 400, message: '요청 형식이 올바르지 않아요' },
  VALIDATION_FAILED: {
    status: 400,
    message: '입력한 내용을 다시 확인해 주세요',
  },
  UNAUTHENTICATED: { status: 401, message: '로그인이 필요해요' },
  FORBIDDEN: { status: 403, message: '접근 권한이 없어요' },
  NOT_FOUND: { status: 404, message: '요청한 내용을 찾을 수 없어요' },
  METHOD_NOT_ALLOWED: { status: 405, message: '지원하지 않는 요청 방식이에요' },
  CONFLICT: { status: 409, message: '다른 내용과 겹쳐서 처리하지 못했어요' },
  PAYLOAD_TOO_LARGE: { status: 413, message: '보낸 내용이 너무 커요' },
  RATE_LIMITED: {
    status: 429,
    message: '요청이 너무 많으니 잠시 후 다시 시도해 주세요',
  },
  INTERNAL_ERROR: {
    status: 500,
    message: '일시적인 문제가 있으니 잠시 후 다시 시도해 주세요',
  },
} as const satisfies Record<string, ErrorDefinition>;

// 기능명세 6-2. 401은 공통 UNAUTHENTICATED를 쓴다(명세 초안의 AUTH_REQUIRED와 같은 뜻).
export const AUTH_ERRORS = {
  SIGNUP_REQUIRED: { status: 403, message: '가입을 마저 진행해 주세요' },
  CSRF_REJECTED: { status: 403, message: '요청을 처리할 수 없어요' },
  TERMS_REQUIRED: { status: 400, message: '필수 약관에 동의해 주세요' },
  /** details: ConsentRequiredDetails { missing, required } */
  CONSENT_REQUIRED: { status: 403, message: '약관 동의가 필요해요' },
} as const satisfies Record<string, ErrorDefinition>;

export const TRIP_ERRORS = {
  NOT_LEADER: { status: 403, message: '그룹장만 할 수 있어요' },
  TRIP_PHASE_INVALID: {
    status: 409,
    message: '지금 단계에서는 할 수 없어요',
  },
  /** details.current에 최신 리소스를 담는다 */
  VERSION_CONFLICT: { status: 409, message: '다른 곳에서 바뀌었어요' },
  INVITE_CODE_INVALID: {
    status: 404,
    message: '초대코드를 다시 확인해 주세요',
  },
  INVITE_TRIP_ENDED: { status: 409, message: '참여할 수 없는 여정이에요' },
  MEMBER_KICKED: { status: 403, message: '참여할 수 없는 여정이에요' },
  ALREADY_MEMBER: { status: 409, message: '이미 참여한 여정이에요' },
  MEMBER_LIMIT_EXCEEDED: { status: 409, message: '참여할 수 없는 여정이에요' },
  CANNOT_KICK_SELF: { status: 400, message: '나 자신은 내보낼 수 없어요' },
} as const satisfies Record<string, ErrorDefinition>;

export const EXPENSE_ERRORS = {
  NOT_PAYER: { status: 403, message: '결제한 사람만 바꿀 수 있어요' },
  EXPENSE_LOCKED: { status: 409, message: '변경할 수 없는 결제예요' },
  PARTICIPANTS_REQUIRED: { status: 400, message: '함께 낼 사람을 골라 주세요' },
  PARTICIPANT_NOT_MEMBER: {
    status: 400,
    message: '함께 낼 수 없는 사람이 있어요',
  },
  SHARED_IN_OTHER_TRIP: {
    status: 409,
    message: '다른 여정에서 공동으로 정한 결제예요',
  },
  OUT_OF_PERIOD_CANDIDATE_INVALID: {
    status: 400,
    message: '추가할 수 없는 결제가 있어요',
  },
  DUPLICATE_NOT_FLAGGED: { status: 409, message: '중복 의심 결제가 아니에요' },
  /** 공동 → 개인은 확인 다이얼로그(WF-32) 뒤 confirmSharedToPersonal: true로 보낸다 */
  SHARED_TO_PERSONAL_CONFIRM_REQUIRED: {
    status: 409,
    message: '개인 결제로 바꿀지 확인해 주세요',
  },
  /** 직접 입력한 결제는 작성자만 바꾸거나 지울 수 있다 */
  NOT_AUTHOR: { status: 403, message: '기록한 사람만 바꿀 수 있어요' },
  /** 가져온 결제(계좌·카드)·가져온 여정 결제는 이 API로 바꾸거나 지울 수 없다 */
  NOT_MANUAL_ENTRY: {
    status: 409,
    message: '직접 입력한 결제만 바꿀 수 있어요',
  },
  /** 지갑 항목에 (예정·진행 중 여정의) 공동 결제가 연결돼 있다. 확인 다이얼로그 뒤 includeShared=true로 다시 보낸다. details: { tripId, expenseId } */
  SHARED_DELETE_CONFIRM_REQUIRED: {
    status: 409,
    message: '공동 결제도 함께 지울지 확인해 주세요',
  },
} as const satisfies Record<string, ErrorDefinition>;

export const FX_ERRORS = {
  FX_POLICY_LOCKED: { status: 409, message: '환율 기준을 바꿀 수 없어요' },
  FX_RATE_UNAVAILABLE: {
    status: 503,
    message: '환율 정보를 불러오지 못했어요',
  },
} as const satisfies Record<string, ErrorDefinition>;

export const WALLET_ERRORS = {
  CONNECTION_EXPIRED: { status: 409, message: '토스 연결이 만료됐어요' },
  ATTEMPT_EXPIRED: { status: 410, message: '다시 시도해 주세요' },
  PROVIDER_AUTH_FAILED: {
    status: 502,
    message: '잠시 후 다시 시도해 주세요',
  },
  PROVIDER_UNAVAILABLE: {
    status: 503,
    message: '잠시 후 다시 시도해 주세요',
  },
  SYNC_RATE_LIMITED: {
    status: 429,
    message: '잠시 후 다시 시도해 주세요',
  },
} as const satisfies Record<string, ErrorDefinition>;

/** 카드 승인내역 불러오기(S8, CODEF). CODEF 결과 코드 → 이 코드(apps/api/src/card-import/README.md 에러 매핑) */
export const CARD_IMPORT_ERRORS = {
  /** 카드사 아이디·비밀번호가 맞지 않다. details: CardLoginFailedDetails { failedAttempts } */
  CARD_LOGIN_FAILED: {
    status: 400,
    message: '카드사 아이디나 비밀번호를 다시 확인해 주세요',
  },
  /** 비밀번호 오류 횟수 초과·잠김·비밀번호 재설정·카드 소지 확인 등 카드사 홈페이지에서 풀어야 한다 */
  CARD_ACCOUNT_ACTION_REQUIRED: {
    status: 409,
    message: '카드사 홈페이지에서 계정 상태를 확인해 주세요',
  },
  /** 카드사 서비스 시간 외·점검·과부하·응답 지연 */
  CARD_COMPANY_UNAVAILABLE: {
    status: 503,
    message: '카드사 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요',
  },
  /** 추가 인증 제한 시간이 지났거나 인증 정보가 맞지 않다. 처음부터 다시 조회한다 */
  CARD_TWO_WAY_EXPIRED: {
    status: 410,
    message: '인증 시간이 지났어요. 처음부터 다시 시도해 주세요',
  },
  /** 인증번호가 맞지 않다 */
  CARD_TWO_WAY_INVALID: {
    status: 400,
    message: '인증번호를 다시 확인해 주세요',
  },
  /** 이 카드사는 지금 방식으로 추가 인증을 이어갈 수 없다(CODEF_LOGIN_MODE=account) */
  CARD_TWO_WAY_UNSUPPORTED: {
    status: 409,
    message: '이 카드사는 지금 불러올 수 없어요',
  },
  /** 화면이 비밀번호를 올바르게 암호화하지 못했다(공개키가 바뀌었을 수 있다 — config를 다시 받는다) */
  CARD_PASSWORD_ENCRYPTION_INVALID: {
    status: 400,
    message: '다시 시도해 주세요',
  },
  /** 사용자당 조회 제한(10분 3회·하루 10회). details: CardImportRetryDetails { retryAfter, retryAfterSec } */
  CARD_IMPORT_RATE_LIMITED: {
    status: 429,
    message: '잠시 후 다시 불러와 주세요',
  },
  /** 같은 카드사 로그인 3회 연속 실패 → 30분 쉬기. details: CardImportRetryDetails */
  CARD_IMPORT_LOGIN_COOLDOWN: {
    status: 429,
    message: '로그인에 여러 번 실패해 잠시 쉬었다가 다시 시도해 주세요',
  },
  /** 이 사용자의 다른 조회가 아직 진행 중이다(동시 1건) */
  CARD_IMPORT_IN_PROGRESS: {
    status: 409,
    message: '카드 내역을 불러오는 중이에요. 잠시만 기다려 주세요',
  },
  /** 서비스 전체 CODEF 일일 호출 예산 소진. 내일 다시 */
  CARD_IMPORT_DAILY_LIMIT: {
    status: 503,
    message: '오늘은 카드 내역을 더 불러올 수 없어요. 내일 다시 시도해 주세요',
  },
  /** 저장(import) 항목의 itemToken이 없거나 맞지 않거나 지났다(결과를 고쳤거나 오래됨). details.invalidIndexes. 다시 불러온다 */
  CARD_IMPORT_RESULT_EXPIRED: {
    status: 410,
    message: '불러온 지 오래됐어요. 다시 불러와 주세요',
  },
  /** 그 밖의 CODEF 오류·통신 실패 */
  CARD_IMPORT_FAILED: {
    status: 502,
    message: '카드 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요',
  },
} as const satisfies Record<string, ErrorDefinition>;

/** 운영자 관리자 페이지(ADMIN). 사용자 세션의 UNAUTHENTICATED와 섞이지 않게 코드를 따로 둔다(화면 전역 401 처리기가 카카오 로그인으로 보내지 않게) */
export const ADMIN_ERRORS = {
  /** 관리자 세션이 없거나 만료(유휴 30분·절대 8시간)·폐기됐다 */
  ADMIN_UNAUTHENTICATED: { status: 401, message: '관리자 로그인이 필요해요' },
  /** 아이디·비밀번호·인증 코드(TOTP) 중 무엇이 틀렸는지 알려 주지 않는다 */
  ADMIN_LOGIN_FAILED: {
    status: 401,
    message: '아이디, 비밀번호 또는 인증 코드가 맞지 않아요',
  },
  /** 로그인 시도 제한(IP당·서비스 전체). details: { retryAfter(ISO UTC), retryAfterSec } + Retry-After */
  ADMIN_LOGIN_RATE_LIMITED: {
    status: 429,
    message: '로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요',
  },
  /** 파괴적 조치의 재인증(비밀번호 + 인증 코드)이 맞지 않다 */
  ADMIN_STEP_UP_FAILED: {
    status: 403,
    message: '비밀번호 또는 인증 코드가 맞지 않아요',
  },
  /** 재인증 시도 제한(세션당). details: { retryAfter(ISO UTC), retryAfterSec } + Retry-After */
  ADMIN_STEP_UP_RATE_LIMITED: {
    status: 429,
    message: '확인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요',
  },
  /** 탈퇴 처리 확인용 닉네임이 회원 닉네임과 다르다 */
  ADMIN_CONFIRM_MISMATCH: { status: 400, message: '닉네임이 맞지 않아요' },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * API 서버가 아니라 화면(apps/web의 apiFetch)이나 앞단 Cloudflare Worker가 만드는 코드.
 * 서버 코드에서는 던지지 않는다. status는 같은 상황을 HTTP로 나타낸 값이고,
 * 화면의 ApiError.status에는 실제 응답 status(응답이 아예 없으면 0)가 들어간다.
 * message는 화면과 Worker가 그대로 보여 주는 고정 문구다.
 */
export const CLIENT_ERRORS = {
  /** 화면: fetch 자체가 실패했다(오프라인, DNS, 연결 끊김) */
  NETWORK_ERROR: { status: 503, message: '인터넷 연결 상태를 확인해 주세요' },
  /** 화면: 제한 시간 안에 응답을 다 받지 못했다 */
  TIMEOUT: {
    status: 504,
    message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요',
  },
  /** 화면: 응답 본문이 JSON이 아니거나 약속한 에러 형식이 아니다(5xx 제외) */
  INVALID_RESPONSE: {
    status: 502,
    message: '응답을 처리하지 못했어요. 잠시 후 다시 시도해 주세요',
  },
  /** Worker: API 서버에 연결하지 못했다 · 화면: 형식 없는 5xx(Cloudflare 오류 페이지 등) */
  UPSTREAM_UNAVAILABLE: {
    status: 502,
    message: '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요',
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * 모든 에러 코드. 도메인 코드는 모듈별 맵(예: TRIP_ERRORS)을 같은 모양으로 만들어 여기에 펼쳐 넣는다.
 * 코드는 대문자 스네이크로, 한 번 정하면 바꾸지 않는다.
 */
export const ERRORS = {
  ...COMMON_ERRORS,
  ...CLIENT_ERRORS,
  ...AUTH_ERRORS,
  ...TRIP_ERRORS,
  ...EXPENSE_ERRORS,
  ...FX_ERRORS,
  ...WALLET_ERRORS,
  ...CARD_IMPORT_ERRORS,
  ...ADMIN_ERRORS,
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERRORS;

/** 화면이나 Worker만 내는 코드(CLIENT_ERRORS) */
export type ClientErrorCode = keyof typeof CLIENT_ERRORS;

/** ErrorCode.NOT_FOUND처럼 쓰는 상수 */
export const ErrorCode = Object.freeze(
  Object.fromEntries(Object.keys(ERRORS).map((code) => [code, code])),
) as { readonly [K in ErrorCode]: K };

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERRORS, value);
}

/** 응답 본문이 공통 에러 형식인지 확인한다 (화면에서 fetch 결과를 다룰 때) */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.code === 'string' &&
    typeof body.message === 'string' &&
    typeof body.requestId === 'string'
  );
}
