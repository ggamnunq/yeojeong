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
/** 사용자당 조회 제한: CARD_IMPORT_FETCH_LIMIT.COUNT회 / CARD_IMPORT_FETCH_LIMIT.WINDOW_SECONDS초. 넘으면 429 CARD_IMPORT_RATE_LIMITED */
export const CARD_IMPORT_FETCH_LIMIT = { COUNT: 5, WINDOW_SECONDS: 600 } as const;
/** "비슷한 기록" 판정: 같은 통화·같은 금액의 직접 입력 지갑 항목이 승인 시각 ±N분 안에 있으면 similarManualEntryId */
export const CARD_IMPORT_SIMILAR_WINDOW_MINUTES = 30;
/** 한 번에 저장할 수 있는 최대 건수(POST /api/wallet/entries/import) */
export const CARD_IMPORT_ITEMS_MAX = 200;
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

/** 조회 결과 한 줄. 승인번호 원문·카드번호 전체·가맹점 주소·사업자번호는 응답에 넣지 않는다 */
export interface CardApprovalItem {
  /**
   * 중복 방지 키: HMAC-SHA256(서버 키, 사용자 + 카드사 + 승인번호 + 승인일시 + 원 승인금액) hex 64자.
   * 저장(import)에 그대로 보낸다. 같은 승인 건은 다시 조회해도 같은 값이다
   */
  importKey: string;
  /** 승인 일시(ISO 8601 KST) */
  approvedAt: string;
  /** 표시·저장할 원통화 금액(양수 decimal). 부분 취소면 순액, 취소 줄이면 취소액 */
  amount: string;
  /** ISO 4217 */
  currency: string;
  /** 카드사가 준 원화(있으면). 화면은 이 값을 주 금액으로 보여 준다 */
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
  cancelState: CardCancelState;
  /** PARTIAL일 때 취소액(양수 decimal), 그 밖에는 null */
  partialCancelAmount: string | null;
  /** 이 importKey가 이미 지갑에 있다(고를 수 없다) */
  alreadyImported: boolean;
  /** 같은 통화·같은 금액의 직접 입력 지갑 항목이 ±30분 안에 있다("비슷한 기록"). 고를 수 있지만 기본 해제 */
  similarManualEntryId: string | null;
  /** 고를 수 있는지 */
  selectable: boolean;
  /** 처음에 선택해 둘지(selectable이고 비슷한 기록이 없을 때) */
  defaultSelected: boolean;
  /** selectable이 false인 이유 */
  blockReason: CardApprovalBlockReason | null;
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

/** 저장할 승인 건 하나(조회 결과에서 그대로 옮긴다) */
export interface ImportWalletEntryItem {
  /** CardApprovalItem.importKey(hex 64자) */
  importKey: string;
  /** CardApprovalItem.approvedAt */
  occurredAt: string;
  /** CardApprovalItem.amount(양수 decimal) */
  amount: string;
  currency: string;
  /** CardApprovalItem.merchantName(40자까지) */
  merchantName: string;
  /** CardApprovalItem.krwAmount(카드사 원화). 지갑 원화 표시와 카드사 청구 환율(CARD_BILLED) 여정의 환산에 쓴다 */
  krwAmount?: number | null;
  /** 직접 입력과 같다: 생략 = 자동 연결(기간 안 예정·진행 중 여정), uuid = 그 여정, null = 지갑에만 */
  tripId?: string | null;
}

/** POST /api/wallet/entries/import — 고른 승인 건을 지갑에 저장(직접 입력과 같은 규칙·여정 자동 연결). 다시 보내도 안전하다(importKey 기준) */
export interface ImportWalletEntriesRequest {
  items: ImportWalletEntryItem[];
}

export interface ImportWalletEntriesResponse {
  /** 요청 순서대로. created=false면 이미 저장돼 있던 항목 */
  items: { importKey: string; created: boolean; entry: WalletEntry }[];
}
