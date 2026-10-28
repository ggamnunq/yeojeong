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
 * 모든 에러 코드. 도메인 코드는 모듈별 맵(예: TRIP_ERRORS = { TRIP_NOT_FOUND: { status: 404, message: '여정을 찾을 수 없어요' } })을
 * 같은 모양으로 만들어 여기에 펼쳐 넣는다. 코드는 대문자 스네이크로, 한 번 정하면 바꾸지 않는다.
 */
export const ERRORS = {
  ...COMMON_ERRORS,
  ...CLIENT_ERRORS,
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
