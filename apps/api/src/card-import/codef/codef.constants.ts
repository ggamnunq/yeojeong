import type { CardImportOrganization, ErrorCode } from '@yeojeong/shared';

// CODEF(codef.io) 상수. 추측으로 쓰지 않고 공식 SDK·문서에서 확인한 값만 둔다(출처는 각 항목 주석, 2026-10-29 확인).
// - SDK: github.com/codef-io/easycodef-java src/main/java/io/codef/api/EasyCodefConstant.java · EasyCodefConnector.java · EasyCodefUtil.java,
//        github.com/codef-io/easycodefpy easycodefpy/properties.py · util.py, github.com/codef-io/easycodef-java-v2 constants/CodefHost.java
// - 문서: developer.codef.io/products/card/common/p/approval (데이터: admin.codef.io/dev-guide-menu/api-input-param/KR_CD_P_002,
//        api-output-param/KR_CD_P_002), 에러 코드 admin.codef.io/dev-guide-menu/errCode-list, 추가 인증 menu-detail/add-auth,
//        계정 등록·삭제 menu-detail/cid-register · cid-delete

export const CODEF_ENV_VALUES = [
  'sandbox',
  'development',
  'production',
] as const;
export type CodefEnv = (typeof CODEF_ENV_VALUES)[number];

/** OAuth 토큰 발급(EasyCodefConstant.OAUTH_DOMAIN + OAUTH_PATH). Basic base64(clientId:clientSecret), grant_type=client_credentials&scope=read */
export const CODEF_OAUTH_URL = 'https://oauth.codef.io/oauth/token';

/** API 호스트(EasyCodefConstant SANDBOX_DOMAIN · DEMO_DOMAIN · API_DOMAIN) */
export const CODEF_API_HOSTS: Record<CodefEnv, string> = {
  sandbox: 'https://sandbox.codef.io',
  development: 'https://development.codef.io',
  production: 'https://api.codef.io',
};

/** 경로(EasyCodefConstant CREATE_ACCOUNT · DELETE_ACCOUNT, 상품 페이지 KR_CD_P_002) */
export const CODEF_PATHS = {
  ACCOUNT_CREATE: '/v1/account/create',
  ACCOUNT_DELETE: '/v1/account/delete',
  /** 카드 개인 승인내역(KR_CD_P_002) */
  CARD_APPROVAL_LIST: '/v1/kr/card/p/account/approval-list',
} as const;

/** 성공 코드(EasyCodefMessageConstant OK) */
export const CODEF_OK = 'CF-00000';
/** 추가 인증 필요(add-auth 가이드: 응답 코드 CF-03002, data.method로 수단 확인) */
export const CODEF_TWO_WAY_REQUIRED = 'CF-03002';
/** 토큰 권한 없음·토큰 오류(EasyCodefConnector는 CF-00401에 토큰을 다시 받는다, 에러 목록 CF-0999x = OAuth 토큰 오류) */
export const CODEF_TOKEN_ERRORS: ReadonlySet<string> = new Set([
  'CF-00401',
  'CF-09990',
  'CF-09991',
  'CF-09992',
  'CF-09993',
  'CF-09994',
]);

/** 액세스 토큰 유효 기간은 1주일(rest-api 가이드, 실제 expires_in 604799). 만료 1시간 전에 새로 받는다 */
export const CODEF_TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;

/**
 * 추가 인증 입력 제한 시간. 상품 KR_CD_P_002의 2-way 타임아웃은 170초(menu-detail/KR_CD_P_002 twoWayTimeout),
 * 기본은 약 3분(add-auth 가이드). 우리 토큰은 그보다 조금 짧게 끊는다(만료 직전 제출이 CODEF에서 타임아웃 나지 않게)
 */
export const CODEF_TWO_WAY_TIMEOUT_SECONDS = 160;

/**
 * CODEF 호출 제한 시간. 승인내역 조회(추가 인증 이어가기 포함) 30초, 나머지(계정 등록·삭제) 10초, 토큰 10초.
 * 상품 자체 타임아웃은 300초(menu-detail/KR_CD_P_002)지만 화면이 기다릴 수 있는 만큼만 기다린다(넘으면 CARD_IMPORT_FAILED)
 */
export const CODEF_QUERY_TIMEOUT_MS = 30_000;
export const CODEF_OTHER_TIMEOUT_MS = 10_000;

/**
 * 카드사 9곳(기능명세 4-12-1, 화면 순서): 개인 카드 승인내역(KR_CD_P_002) 아이디 로그인(loginType "1").
 * 기관 코드: CODEF "파라미터 상세보기" 시트(기관별 개발현황) — 0301 KB국민 · 0302 현대 · 0303 삼성 · 0304 NH농협 · 0305 BC ·
 * 0306 신한 · 0309 우리 · 0311 롯데 · 0313 하나(0301 KB, 0309 우리는 easycodef-java README에도 있다).
 * 현대·하나는 아이디 로그인에 카드번호 전체(loginCardNo)·카드 비밀번호(cardPassword, RSA)가 더 필요하다(KR_CD_P_002 입력부) → requiresCardNo.
 * 기간 제약: KR_CD_P_002 입력부 안내(inputNote). 개월은 보수적으로 30일로 센다. 우리 상한은 1년·92일.
 *   KB·삼성·우리 12개월 · NH 12개월(1회 92일) · BC 9개월(해외는 최근 4개월, 2개월 단위 → 1회 60일) · 신한 6개월(1회 3개월) ·
 *   롯데 6개월 · 현대 3개월 · 하나 18개월(1회 3개월).
 * 추가 인증(KR_CD_P_002 2-way 안내): 문자 인증번호(smsAuthNo)뿐 — 롯데 아이디 로그인, 씨티 기기 변경. 보안문자(secureNo)는 이 상품 안내에 없다.
 * 뺀 곳: 씨티(0307)·전북(0315)은 아이디 로그인이 되지만 화면 9곳에 없다. 광주(0316)·수협(0320)·제주(0321)는 인증서 로그인만.
 */
/**
 * 카드번호 전체·카드 비밀번호가 필요한 카드사(현대·하나, requiresCardNo)를 받을지. 1차는 끈다 —
 * 카드번호 전체를 서버가 거쳐 보내야 해서다(결정 2026-10-29). 코드 경로(loginCardNo·cardPassword)는 남겨 둔다.
 * false면 config 목록에서 빠지고 fetch는 400(organization)이다.
 */
export const CARD_NUMBER_LOGIN_ENABLED = false;

/** 9곳 전체(화면 순서). 실제로 받는 목록은 CARD_IMPORT_ORGANIZATIONS */
export const ALL_CARD_ORGANIZATIONS: readonly CardImportOrganization[] = [
  {
    code: '0301',
    name: 'KB국민카드',
    maxRangeDays: 92,
    maxLookbackDays: 365,
    requiresCardNo: false,
  },
  {
    code: '0302',
    name: '현대카드',
    maxRangeDays: 90,
    maxLookbackDays: 90,
    requiresCardNo: true,
  },
  {
    code: '0303',
    name: '삼성카드',
    maxRangeDays: 92,
    maxLookbackDays: 365,
    requiresCardNo: false,
  },
  {
    code: '0304',
    name: 'NH농협카드',
    maxRangeDays: 92,
    maxLookbackDays: 365,
    requiresCardNo: false,
  },
  {
    code: '0305',
    name: 'BC카드',
    maxRangeDays: 60,
    maxLookbackDays: 270,
    requiresCardNo: false,
  },
  {
    code: '0306',
    name: '신한카드',
    maxRangeDays: 90,
    maxLookbackDays: 180,
    requiresCardNo: false,
  },
  {
    code: '0309',
    name: '우리카드',
    maxRangeDays: 92,
    maxLookbackDays: 365,
    requiresCardNo: false,
  },
  {
    code: '0311',
    name: '롯데카드',
    maxRangeDays: 92,
    maxLookbackDays: 180,
    requiresCardNo: false,
  },
  {
    code: '0313',
    name: '하나카드',
    maxRangeDays: 90,
    maxLookbackDays: 365,
    requiresCardNo: true,
  },
];

/** 지금 받는 카드사(CARD_NUMBER_LOGIN_ENABLED가 false면 현대·하나 제외 = 7곳) */
export const CARD_IMPORT_ORGANIZATIONS: readonly CardImportOrganization[] =
  ALL_CARD_ORGANIZATIONS.filter(
    (o) => CARD_NUMBER_LOGIN_ENABLED || !o.requiresCardNo,
  );

export function organizationOf(code: string): CardImportOrganization | null {
  return CARD_IMPORT_ORGANIZATIONS.find((o) => o.code === code) ?? null;
}

/**
 * CODEF 결과 코드 → 우리 에러 코드(에러 목록 admin.codef.io/dev-guide-menu/errCode-list).
 * 목록에 없는 코드는 CARD_IMPORT_FAILED(502)
 */
export const CODEF_ERROR_MAP: Readonly<Record<string, ErrorCode>> = {
  // 로그인 실패: 아이디 오류 · 비밀번호 오류 · 아이디 또는 비밀번호 오류 · 미등록 아이디 · 정보 부정확 · 로그인 실패
  'CF-12800': 'CARD_LOGIN_FAILED',
  'CF-12801': 'CARD_LOGIN_FAILED',
  'CF-12803': 'CARD_LOGIN_FAILED',
  'CF-12861': 'CARD_LOGIN_FAILED',
  'CF-12877': 'CARD_LOGIN_FAILED',
  'CF-12899': 'CARD_LOGIN_FAILED',
  // 카드사 홈페이지에서 풀어야 함: 비밀번호 오류 횟수 초과 · 계정 잠김 · 반복 로그인 일시 제한 · 1일 로그인 횟수 초과 · 비밀번호 재설정 · 카드 소지 확인
  'CF-12802': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12834': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12207': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12830': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12833': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12108': 'CARD_ACCOUNT_ACTION_REQUIRED',
  // 카드사 쪽 문제: 이용 가능 시간 아님(점검 포함) · 기관 오류 · 접속량 증가 · 접속 폭주 · 일시 이용 제한 · 통신 시간 초과
  'CF-12041': 'CARD_COMPANY_UNAVAILABLE',
  'CF-12003': 'CARD_COMPANY_UNAVAILABLE',
  'CF-12100': 'CARD_COMPANY_UNAVAILABLE',
  'CF-12101': 'CARD_COMPANY_UNAVAILABLE',
  'CF-12104': 'CARD_COMPANY_UNAVAILABLE',
  'CF-12106': 'CARD_COMPANY_UNAVAILABLE',
  'CF-12202': 'CARD_COMPANY_UNAVAILABLE',
  // 추가 인증: 사용자 입력 시간 초과 · 2-way 정보 불일치 · 추가 인증 취소 · 인증 미완료
  'CF-12001': 'CARD_TWO_WAY_EXPIRED',
  'CF-03003': 'CARD_TWO_WAY_EXPIRED',
  'CF-12102': 'CARD_TWO_WAY_EXPIRED',
  'CF-12872': 'CARD_TWO_WAY_INVALID',
  // 비밀번호 복호화 실패(화면 암호화 문제)
  'CF-04020': 'CARD_PASSWORD_ENCRYPTION_INVALID',
};

export function mapCodefError(code: string | undefined): ErrorCode {
  return (code && CODEF_ERROR_MAP[code]) || 'CARD_IMPORT_FAILED';
}
