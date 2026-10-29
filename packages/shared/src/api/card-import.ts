import type { ConsentStatusResponse } from "../api.js";
import type { WalletEntry } from "./wallet.js";

// 카드 승인내역 불러오기(S8, CODEF 일회성 조회) API 타입.
// 서버는 카드사 로그인 정보·조회 결과를 저장하지 않는다. 사용자가 고른 승인 건만 POST /api/wallet/entries/import로 지갑에 저장한다.
// 시각 = ISO 8601 KST, 날짜 = "YYYY-MM-DD"(KST), 원통화 금액 = 문자열 decimal, 원화 = 정수.

/** 한 번에 조회할 수 있는 최대 기간(일, 시작일·종료일 포함). 기관마다 더 짧을 수 있다(CardImportOrganization.maxRangeDays) */
export const CARD_IMPORT_MAX_RANGE_DAYS = 92;
/** 오늘(KST)부터 거슬러 조회할 수 있는 최대 일수. 기관마다 더 짧을 수 있다(CardImportOrganization.maxLookbackDays) */
export const CARD_IMPORT_MAX_LOOKBACK_DAYS = 365;
/** 진행 중 여정이 없을 때 기본 조회 기간(오늘 포함 최근 7일) */
export const CARD_IMPORT_DEFAULT_RANGE_DAYS = 7;
/**
 * 사용자당 조회 제한(새 조회만 센다 — 추가 인증 이어 보내기는 같은 조회의 연속이라 세지 않는다).
 * WINDOW_SECONDS초에 COUNT회, KST 하루 DAILY회. 넘으면 429 CARD_IMPORT_RATE_LIMITED { retryAfter(ISO), retryAfterSec }
 */
export const CARD_IMPORT_FETCH_LIMIT = { COUNT: 3, WINDOW_SECONDS: 600, DAILY: 10 } as const;
/**
 * 같은 사용자·같은 카드사 로그인 연속 실패: WINDOW_SECONDS 안에 FAILURES회째 실패하면 그 응답부터 COOLDOWN_SECONDS 동안
 * 429 CARD_IMPORT_LOGIN_COOLDOWN { retryAfter(ISO), retryAfterSec }(카드사 계정 잠김 예방). 1·2회째는 400 CARD_LOGIN_FAILED { failedAttempts }
 */
export const CARD_IMPORT_LOGIN_LIMIT = { FAILURES: 3, WINDOW_SECONDS: 1800, COOLDOWN_SECONDS: 1800 } as const;
/** "비슷한 기록" 판정: 같은 통화·같은 금액의 직접 입력 지갑 항목이 승인 시각 ±N분 안에 있으면 similarManualEntryId */
export const CARD_IMPORT_SIMILAR_WINDOW_MINUTES = 30;
/** 한 번에 저장할 수 있는 최대 건수(POST /api/wallet/entries/import) */
export const CARD_IMPORT_ITEMS_MAX = 200;
/** 조회 결과 항목 서명(itemToken) 수명(초). 이 시간 안에 저장(import)해야 한다 — 지나면 다시 불러온다 */
export const CARD_IMPORT_RESULT_TTL_SECONDS = 1800;
/** 화면이 조회 요청에 쓸 제한 시간(ms). 카드사 조회는 수십 초 걸릴 수 있어 apiFetch 기본(15초)보다 길다 */
export const CARD_IMPORT_FETCH_TIMEOUT_MS = 120_000;

/** 불러올 수 있는 카드사(개인 카드, 아이디 로그인) */
export interface CardImportOrganization {
  /** CODEF 기관 코드(예: "0306") */
  code: string;
  /** 화면 이름(예: "신한카드") */
  name: string;
  /** 이 카드사가 한 번에 조회할 수 있는 최대 일수(시작일·종료일 포함) */
  maxRangeDays: number;
  /** 이 카드사가 조회할 수 있는 가장 오래된 날 = 오늘 - maxLookbackDays */
  maxLookbackDays: number;
  /**
   * 아이디 로그인에 카드번호·카드 비밀번호가 더 필요한 카드사(현대·하나). true면 화면이 loginCardNo(카드번호 전체)와
   * encryptedCardPassword(카드 비밀번호 앞 2자리를 비밀번호와 같은 방식으로 암호화)를 더 받는다
   */
  requiresCardNo: boolean;
}

export const CARD_IMPORT_RANGE_BASIS_VALUES = ["ONGOING_TRIP", "RECENT_DAYS"] as const;
/** 기본 조회 기간의 근거: 진행 중 여정 기간 · 최근 7일 */
export type CardImportRangeBasis = (typeof CARD_IMPORT_RANGE_BASIS_VALUES)[number];

/** GET /api/card-import/config (기능 플래그가 꺼져 있으면 404) */
export interface CardImportConfig {
  /** 항상 true(꺼져 있으면 이 API가 404) */
  enabled: true;
  /**
   * CODEF RSA 공개키(base64 SPKI, 비밀 아님). 화면이 카드사 비밀번호를 이 키로 암호화(RSA PKCS#1 v1.5, base64)해 encryptedPassword로 보낸다.
   * 서버는 암호문만 CODEF로 넘기고 복호화하지 않는다
   */
  publicKey: string;
  /** 공개키(DER) SHA-256 hex. 화면 테스트가 고정값과 비교해 키 교체를 알아챈다 */
  publicKeyFingerprint: string;
  organizations: CardImportOrganization[];
  /** 전체 상한(기관별 값이 더 작으면 그 값) */
  maxRangeDays: number;
  maxLookbackDays: number;
  /** 기본 조회 기간: 진행 중 여정 기간(오늘까지), 없으면 최근 7일 */
  defaultRange: {
    from: string;
    to: string;
    basis: CardImportRangeBasis;
    /** basis가 ONGOING_TRIP일 때 그 여정 */
    tripId: string | null;
  };
  /** CARD_IMPORT 동의 상태. valid가 false면 조회 전에 동의 시트(POST /api/consents stage CARD_IMPORT)를 띄운다 */
  consent: ConsentStatusResponse;
  /** 추가 인증(문자 인증번호) 입력 제한 시간(초). TWO_WAY_REQUIRED의 expiresAt과 같은 기준 */
  twoWayTimeoutSeconds: number;
  /** 오늘(KST) 남은 조회 횟수 = min(DAILY − 오늘 시작한 조회 수, floor(서비스 남은 CODEF 예산 / 4)). 예산 소진이면 0 */
  remainingToday: number;
}

/** 429 CARD_IMPORT_RATE_LIMITED · CARD_IMPORT_LOGIN_COOLDOWN의 details */
export interface CardImportRetryDetails extends Record<string, unknown> {
  /** 다시 시도할 수 있는 시각(ISO 8601 UTC, 예 "2026-11-13T05:30:00.000Z"). 화면은 KST HH:mm으로 보여 준다. 같은 값이 HTTP Retry-After(초)로도 온다 */
  retryAfter: string;
  retryAfterSec: number;
}

/** 400 CARD_LOGIN_FAILED의 details */
export interface CardLoginFailedDetails extends Record<string, unknown> {
  /** 같은 사용자·카드사의 최근 30분 연속 실패 수(1·2). 3회째는 CARD_IMPORT_LOGIN_COOLDOWN */
  failedAttempts: number;
}

/** 추가 인증으로 이어서 보낼 값 */
export interface CardImportTwoWayInput {
  /** TWO_WAY_REQUIRED 응답의 twoWayToken 그대로 */
  token: string;
  /** 카드사가 보낸 인증번호. 취소하려면 보내지 않고 처음부터 다시 조회한다 */
  code: string;
}

/**
 * POST /api/card-import/fetch — 카드사 아이디·비밀번호로 개인 카드 승인내역을 한 번 조회한다(저장하지 않는다).
 * 추가 인증을 이어서 보낼 때도 같은 loginId·encryptedPassword·organization·from·to를 다시 보낸다(서버는 아무것도 기억하지 않는다)
 */
export interface FetchCardApprovalsRequest {
  /** CardImportOrganization.code */
  organization: string;
  /** 카드사 아이디. 서버는 CODEF로 넘기기만 하고 저장·기록하지 않는다 */
  loginId: string;
  /** 카드사 비밀번호를 config.publicKey로 RSA PKCS#1 v1.5 암호화한 base64. 평문 비밀번호는 보내지 않는다 */
  encryptedPassword: string;
  /** 조회 시작일 "YYYY-MM-DD"(KST) */
  from: string;
  /** 조회 종료일 "YYYY-MM-DD"(KST, 오늘까지) */
  to: string;
  /** requiresCardNo 카드사만: 카드번호 전체(숫자 14~16자리). 서버는 CODEF로 넘기기만 하고 저장·기록하지 않는다 */
  loginCardNo?: string;
  /** requiresCardNo 카드사만: 카드 비밀번호(앞 2자리)를 config.publicKey로 암호화한 base64 */
  encryptedCardPassword?: string;
  /** TWO_WAY_REQUIRED 뒤 이어서 보낼 때만 */
  twoWay?: CardImportTwoWayInput;
}

export const CARD_CANCEL_STATE_VALUES = [
  "NONE",
  "PARTIAL",
  "CANCELLED",
  "ORPHAN_CANCEL",
] as const;
/**
 * 승인 취소 상태(서버가 같은 카드·같은 원 승인번호로 짝짓는다. 승인번호 원문은 응답에 없다).
 * - NONE: 취소 없음
 * - PARTIAL: 부분 취소. 승인 한 줄로 합쳐 amount = 순액, partialCancelAmount = 취소액
 * - CANCELLED: 전액 취소. 승인·취소 줄 모두 이 값이고 고를 수 없다
 * - ORPHAN_CANCEL: 원 승인이 조회 기간 밖인 취소 줄. 기본 해제(지금은 고를 수 없다 — 음수 지갑 항목은 아직 없다)
 */
export type CardCancelState = (typeof CARD_CANCEL_STATE_VALUES)[number];

export const CARD_APPROVAL_BLOCK_REASON_VALUES = [
  "ALREADY_IMPORTED",
  "CANCELLED",
  "ORPHAN_CANCEL",
  "UNSUPPORTED_CURRENCY",
  "INVALID_AMOUNT",
  "TOO_OLD",
] as const;
/** 고를 수 없는 이유(selectable이 false일 때) */
export type CardApprovalBlockReason = (typeof CARD_APPROVAL_BLOCK_REASON_VALUES)[number];

export const CARD_IMPORT_ITEM_STATUS_VALUES = [
  "NEW",
  "ALREADY_IMPORTED",
  "SIMILAR",
  "CANCELLED",
  "PARTIAL_CANCEL",
] as const;
/**
 * 화면 칩 하나로 줄인 상태(기능명세 4-12-4). 우선순위 ALREADY_IMPORTED > CANCELLED > SIMILAR > PARTIAL_CANCEL > NEW.
 * 원 승인 없는 취소 줄(cancelState ORPHAN_CANCEL)도 CANCELLED. 부분 취소이면서 비슷한 기록이면 SIMILAR(부분 취소 표시는 partialCancelAmount로)
 */
export type CardImportItemStatus = (typeof CARD_IMPORT_ITEM_STATUS_VALUES)[number];

/** 조회 결과 한 줄. 승인번호 원문·카드번호 전체·가맹점 주소·사업자번호는 응답에 넣지 않는다 */
export interface CardApprovalItem {
  /**
   * 중복 방지 키: HMAC-SHA256(서버 키, 사용자 + 카드사 + 승인번호 + 승인일시 + 원 승인금액) hex 64자.
   * 저장(import)에 그대로 보낸다. 같은 승인 건은 다시 조회해도 같은 값이다
   */
  importKey: string;
  /** 승인 일시(ISO 8601 KST) */
  approvedAt: string;
  /** 표시·저장할 원통화 금액(decimal). 부분 취소면 순액. 취소 줄(전액 취소의 취소 전표·원 승인 없는 취소)은 음수("-58830") */
  amount: string;
  /** ISO 4217 */
  currency: string;
  /** 카드사가 준 원화(있으면, 취소 줄은 음수). 화면은 이 값을 주 금액으로 보여 준다 */
  krwAmount: number | null;
  /** 카드사 원화가 없는 외화: 승인 시각 직전 매매기준율 추정(고시가 없으면 null). KRW·카드사 원화가 있으면 null */
  estimatedKrwAmount: number | null;
  /** 가맹점 이름(정리 뒤 40자까지 = 지갑 메모 규칙). 비었으면 "결제" */
  merchantName: string;
  /** 해외 승인 */
  overseas: boolean;
  /** 카드사 코드·이름 */
  organization: string;
  organizationName: string;
  /** 카드 끝 4자리(카드사가 줄 때만, 마스킹 값에서 뽑은 숫자 4개) */
  cardLast4: string | null;
  /** 카드 이름(카드사가 줄 때만, 예: "신한 Deep Dream") */
  cardName: string | null;
  /** 화면 칩 상태(4-12-4) */
  status: CardImportItemStatus;
  cancelState: CardCancelState;
  /** PARTIAL일 때 취소액(양수 decimal, amount와 같은 통화), 그 밖에는 null. 화면 "부분 취소 −₩X" 표시용이고 저장하지 않는다 */
  partialCancelAmount: string | null;
  /** 이 importKey가 이미 지갑에 있다(고를 수 없다) */
  alreadyImported: boolean;
  /** 같은 통화·같은 금액의 직접 입력 지갑 항목이 ±30분 안에 있다("비슷한 기록"). 고를 수 있지만 기본 해제 */
  similarManualEntryId: string | null;
  /** 저장하면 자동 연결될 여정(직접 입력과 같은 규칙 — 내가 활성 멤버인 예정·진행 중 여정 중 승인 시각이 기간 안인 것). 없으면 null */
  inTripId: string | null;
  /** 고를 수 있는지 */
  selectable: boolean;
  /** 처음에 선택해 둘지: 고를 수 있고, 비슷한 기록이 없고, 여정 기간 안(inTripId 있음)일 때 */
  defaultSelected: boolean;
  /** selectable이 false인 이유 */
  blockReason: CardApprovalBlockReason | null;
  /**
   * 저장용 서명(서버 HMAC: 사용자 + importKey + 승인 일시 + 금액 + 통화 + 가맹점명 + 카드사 원화 + 만료 시각). 고를 수 있는 항목에만 있다.
   * 저장(import) 때 그대로 보내고, 서버는 서명이 맞는 항목만 CARD_IMPORT로 저장한다(값을 바꾸거나 만든 항목은 거절). 수명 CARD_IMPORT_RESULT_TTL_SECONDS
   */
  itemToken: string | null;
}

export const CARD_IMPORT_TWO_WAY_METHOD_VALUES = ["SMS"] as const;
/** 추가 인증 수단. 개인 카드 승인내역은 문자 인증번호만 있다(롯데 아이디 로그인, 씨티 기기 변경 등) */
export type CardImportTwoWayMethod = (typeof CARD_IMPORT_TWO_WAY_METHOD_VALUES)[number];

export interface FetchCardApprovalsOk {
  status: "OK";
  organization: string;
  from: string;
  to: string;
  /** 승인 일시 최신순 */
  items: CardApprovalItem[];
}

export interface FetchCardApprovalsTwoWayRequired {
  status: "TWO_WAY_REQUIRED";
  /**
   * 이어서 보낼 상태를 서버 키(AES-256-GCM)로 암호화한 불투명 토큰. 서버는 이 상태를 메모리·DB에 두지 않는다.
   * 이 사용자에게만 유효하고 expiresAt이 지나면 410 CARD_TWO_WAY_EXPIRED
   */
  twoWayToken: string;
  method: CardImportTwoWayMethod;
  expiresAt: string;
}

/** POST /api/card-import/fetch 응답(200) */
export type FetchCardApprovalsResponse =
  | FetchCardApprovalsOk
  | FetchCardApprovalsTwoWayRequired;

/** 저장할 승인 건 하나(조회 결과에서 그대로 옮긴다 — 값을 바꾸면 itemToken 검증에 실패한다) */
export interface ImportWalletEntryItem {
  /** CardApprovalItem.importKey(hex 64자) */
  importKey: string;
  /** CardApprovalItem.itemToken */
  itemToken: string;
  /** CardApprovalItem.approvedAt */
  occurredAt: string;
  /** CardApprovalItem.amount(양수 decimal) */
  amount: string;
  currency: string;
  /** CardApprovalItem.merchantName(40자까지) */
  merchantName: string;
  /** CardApprovalItem.krwAmount(카드사 원화, 없으면 null). 지갑 원화 표시와 카드사 청구 환율(CARD_BILLED) 여정의 환산에 쓴다 */
  krwAmount: number | null;
  /** 직접 입력과 같다: 생략 = 자동 연결(기간 안 예정·진행 중 여정), uuid = 그 여정, null = 지갑에만 */
  tripId?: string | null;
}

/**
 * POST /api/wallet/entries/import — 고른 승인 건을 지갑에 저장(직접 입력과 같은 규칙·여정 자동 연결). 다시 보내도 안전하다(importKey 기준).
 * 저장하는 값: 승인 일시·순액·통화·가맹점명·카드사 원화·importKey. 카드사·부분 취소액은 저장하지 않는다(C-27)
 */
export interface ImportWalletEntriesRequest {
  items: ImportWalletEntryItem[];
}

export interface ImportWalletEntriesResponse {
  /** 요청 순서대로. created=false면 이미 저장돼 있던 항목(다른 기기·다시 보냄) */
  items: { importKey: string; created: boolean; entry: WalletEntry }[];
  /** 새로 만든 건수(토스트 "{created}건을 추가했어요") */
  created: number;
  /** 이미 있어 건너뛴 건수 */
  skipped: number;
  /** 새로 만든 것 중 여정에 연결된 건수 */
  linked: number;
}
