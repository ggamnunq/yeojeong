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
 * 기간 제약: KR_CD_P_002 입력부 안내(inputNote "조회 가능 기간"). 개월은 보수적으로 30일로 센다. 우리 상한은 1년·92일.
 *   KB·삼성·우리 12개월 · NH 12개월(1회 92일) · BC 9개월(해외는 최근 4개월, 2개월 단위 → 1회 60일) · 신한 6개월(1회 3개월) ·
 *   롯데 6개월 · 현대 3개월(부가세 포함 "결제확정" 조회일 때만 2년 — 우리는 memberStoreInfoType "0"이라 3개월) · 하나 18개월(1회 3개월 → 우리 상한 365일).
 * 추가 인증(KR_CD_P_002 2-way 안내): 문자 인증번호(smsAuthNo)뿐 — 롯데 아이디 로그인, 씨티 기기 변경. 현대·하나는 추가 인증이 없다.
 *   보안문자(secureNo)는 이 상품 안내에 없다.
 * 뺀 곳: 씨티(0307)·전북(0315)은 아이디 로그인이 되지만 화면 9곳에 없다. 광주(0316)·수협(0320)·제주(0321)는 인증서 로그인만.
 *
 * 현대·하나 카드번호 로그인(requiresCardNo, 2026-10-30 다시 확인 — admin.codef.io/dev-guide-menu/api-input-param/KR_CD_P_002?mode=real,
 * menu-detail/KR_CD_P_002 inputNote·sample/KR_CD_P_002/in, "파라미터 상세보기" 시트 history·[로그인] 탭):
 * - loginCardNo(카드번호): "현대카드 아이디로그인(필수): 인증할 카드번호", "하나카드 아이디로그인(필수): 인증할 카드번호".
 *   RSA 암호화 표시가 없다(같은 표의 password·certPassword·cardPassword에는 "RSA 암호화된"이 붙는다) → 원문으로 보낸다.
 *   형식: 입력 예시 "6253123456780000"(숫자만, 하이픈 없음). 시트 메모(현대, 2025-11-11): 전체 카드번호를 넣을 수 있고
 *   카드사 화면에서 마스킹(*)되는 자리는 실제 값과 달라도 로그인된다 — 우리는 전체 번호를 그대로 보낸다(추측으로 일부만 보내지 않는다).
 * - cardPassword(카드 비밀번호): "(RSA 암호화된 카드 비밀번호) 현대카드 아이디로그인(필수): 카드 비밀번호 4자리,
 *   하나카드 아이디로그인(필수): 카드 비밀번호 앞 2자리" → cardPasswordDigits 4 · 2. 비밀번호와 같은 공개키·방식(RSA PKCS#1 v1.5, base64).
 * - 현대카드 특이사항(inputNote, 25.10.30 추가): 미입력 시 CF-12401, 카드 비밀번호 3회 오류 시 계정 잠김(CF-12834).
 *   하나카드는 시트 history 2026-10-08 "[로그인] 하나카드 아이디로그인 cardNo, cardPassword 추가"(비고: 비밀번호 앞 2자리).
 */
/** 9곳 전체(화면 순서). 실제로 받는 목록은 cardImportOrganizations(env CARD_NUMBER_LOGIN) */
export const ALL_CARD_ORGANIZATIONS: readonly CardImportOrganization[] = [
  {
    code: '0301',
    name: 'KB국민카드',
    maxRangeDays: 92,
    maxLookbackDays: 365,
    requiresCardNo: false,
    cardPasswordDigits: null,
  },
  {
    code: '0302',
    name: '현대카드',
    maxRangeDays: 90,
    maxLookbackDays: 90,
    requiresCardNo: true,
    cardPasswordDigits: 4,
  },
  {
    code: '0303',
    name: '삼성카드',
    maxRangeDays: 92,
    maxLookbackDays: 365,
    requiresCardNo: false,
    cardPasswordDigits: null,
  },
  {
    code: '0304',
    name: 'NH농협카드',
    maxRangeDays: 92,
    maxLookbackDays: 365,
    requiresCardNo: false,
    cardPasswordDigits: null,
  },
  {
    code: '0305',
    name: 'BC카드',
    maxRangeDays: 60,
    maxLookbackDays: 270,
    requiresCardNo: false,
    cardPasswordDigits: null,
  },
  {
    code: '0306',
    name: '신한카드',
    maxRangeDays: 90,
    maxLookbackDays: 180,
    requiresCardNo: false,
    cardPasswordDigits: null,
  },
  {
    code: '0309',
    name: '우리카드',
    maxRangeDays: 92,
    maxLookbackDays: 365,
    requiresCardNo: false,
    cardPasswordDigits: null,
  },
  {
    code: '0311',
    name: '롯데카드',
    maxRangeDays: 92,
    maxLookbackDays: 180,
    requiresCardNo: false,
    cardPasswordDigits: null,
  },
  {
    code: '0313',
    name: '하나카드',
    maxRangeDays: 90,
    maxLookbackDays: 365,
    requiresCardNo: true,
    cardPasswordDigits: 2,
  },
];

/**
 * 지금 받는 카드사. 카드번호 전체·카드 비밀번호가 필요한 카드사(현대·하나, requiresCardNo)는 env CARD_NUMBER_LOGIN(기본 off,
 * CodefConfig.cardNumberLogin)이 켜졌을 때만 넣는다 — 카드번호는 CODEF가 원문으로 받아 우리 서버를 거쳐 가고, 처리방침 0.1은
 * "카드번호를 수집하지 않는다"이므로 약관 0.2를 게시한 뒤에만 켠다. 꺼져 있으면 7곳, 켜면 9곳(화면 순서)
 */
export function cardImportOrganizations(
  cardNumberLogin: boolean,
): readonly CardImportOrganization[] {
  return ALL_CARD_ORGANIZATIONS.filter(
    (o) => cardNumberLogin || !o.requiresCardNo,
  );
}

/** 지금 받는 카드사 하나. 없거나 꺼져 있으면 null */
export function organizationOf(
  code: string,
  cardNumberLogin: boolean,
): CardImportOrganization | null {
  return (
    cardImportOrganizations(cardNumberLogin).find((o) => o.code === code) ??
    null
  );
}

/**
 * CODEF 결과 코드 → 우리 에러 코드(에러 목록 admin.codef.io/dev-guide-menu/errCode-list — 2026-10-30 전체 목록 errCode-list/0/2000에서
 * CF-131xx 카드번호·카드 비밀번호 문구 확인).
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
  // 카드번호(현대·하나 loginCardNo): 일치하는 카드 없음 · 관련 오류 · 잘못 입력 · 형식 오류.
  // 미입력(CF-13100·13120·12401)은 우리 서버가 보낸 본문 문제라 사용자 실패로 세지 않는다(CARD_IMPORT_FAILED, 기본값)
  'CF-13101': 'CARD_NUMBER_INVALID',
  'CF-13102': 'CARD_NUMBER_INVALID',
  'CF-13103': 'CARD_NUMBER_INVALID',
  'CF-13104': 'CARD_NUMBER_INVALID',
  // 카드 비밀번호(현대 4자리·하나 앞 2자리): 오류 · 형식 오류 · 자릿수 오류 · 관련 오류(13122 횟수 초과는 아래)
  'CF-13121': 'CARD_PASSWORD_INVALID',
  'CF-13123': 'CARD_PASSWORD_INVALID',
  'CF-13124': 'CARD_PASSWORD_INVALID',
  'CF-13125': 'CARD_PASSWORD_INVALID',
  // 카드사 홈페이지에서 풀어야 함: 비밀번호 오류 횟수 초과 · 계정 잠김 · 반복 로그인 일시 제한 · 1일 로그인 횟수 초과 · 비밀번호 재설정 · 카드 소지 확인 ·
  // 카드 비밀번호 오류 횟수 초과(CF-13122). 현대는 카드 비밀번호 3회 오류면 계정 잠김(CF-12834)
  'CF-12802': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12834': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12207': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12830': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12833': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-12108': 'CARD_ACCOUNT_ACTION_REQUIRED',
  'CF-13122': 'CARD_ACCOUNT_ACTION_REQUIRED',
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
