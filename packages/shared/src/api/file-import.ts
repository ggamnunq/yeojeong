// 거래 내역 파일 가져오기(W10) API 타입. 1차 공급자는 위챗페이(WECHAT), 알리페이는 같은 구조로 붙인다.
// 파일은 브라우저에서만 읽는다(원본·전체 내용을 서버로 보내지 않는다). 서버는 사용자가 고른 결제만 받아 지갑에 저장한다.
// 시각 = ISO 8601(오프셋 포함, 위챗은 +08:00), 원통화 금액 = 문자열 decimal.

export const FILE_IMPORT_PROVIDER_VALUES = ["WECHAT"] as const;
/** 파일 공급자. 알리페이는 "ALIPAY"를 더한다 */
export type FileImportProvider = (typeof FILE_IMPORT_PROVIDER_VALUES)[number];

/** 한 번에 저장할 수 있는 최대 건수(POST /api/wallet/entries/file-import). 더 많으면 화면이 나눠 보낸다(요청 본문 100kb 안) */
export const FILE_IMPORT_ITEMS_MAX = 200;
/** 한 번에 확인할 수 있는 최대 건수(POST /api/wallet/entries/file-import/check). 더 많으면 화면이 나눠 보낸다 */
export const FILE_IMPORT_CHECK_MAX = 500;
/**
 * 거래 번호 다이제스트 형식: 소문자 hex 64자.
 * txnDigest = SHA-256(UTF-8 "{provider}:{거래 번호}") — 브라우저가 계산한다. 거래 번호(위챗 交易单号) 원문은 서버로 보내지 않는다.
 * 서버는 이 값에 전용 키(IMPORT_KEY_HMAC_KEY)로 HMAC을 씌워 importKey로 저장한다(키 없이 다시 계산·복원할 수 없다)
 */
export const FILE_IMPORT_TXN_DIGEST_PATTERN = "^[0-9a-f]{64}$";

/** 고른 결제 한 건(파일에서 읽어 정규화한 값) */
export interface FileImportItem {
  /** SHA-256("{provider}:{거래 번호}") hex 64자(FILE_IMPORT_TXN_DIGEST_PATTERN). 거래 번호 원문은 보내지 않는다 */
  txnDigest: string;
  /** 결제 시각(ISO 8601, 오프셋 포함). 위챗 파일 시각은 중국 표준시(UTC+8)로 본다 → "2026-10-01T12:34:56+08:00" */
  occurredAt: string;
  /** 양수 decimal(부분 환불은 순액). 소수 2자리까지 */
  amount: string;
  /** 위챗은 늘 CNY */
  currency: string;
  /** 가맹점(交易对方). 40자까지 */
  merchantName: string;
}

/**
 * POST /api/wallet/entries/file-import — 고른 결제를 지갑에 저장(source FILE_IMPORT). 직접 입력과 같은 입력 규칙·여정 자동 연결.
 * 같은 거래(사용자 + 공급자 + txnDigest)는 한 번만 저장한다(다시 보내면 건너뛴다 — skipped)
 */
export interface FileImportRequest {
  provider: FileImportProvider;
  /** 1~FILE_IMPORT_ITEMS_MAX건 */
  items: FileImportItem[];
}

export interface FileImportResponse {
  /** 요청 순서대로. created=false면 이미 저장돼 있던 거래 */
  items: { created: boolean; entryId: string }[];
  /** 새로 만든 건수(토스트 "{created}건을 추가했어요") */
  created: number;
  /** 이미 있어 건너뛴 건수 */
  skipped: number;
  /** 새로 만든 것 중 여정에 연결된 건수 */
  linked: number;
}

/**
 * POST /api/wallet/entries/file-import/check — 결과 화면(HF-68)의 "추가됨"·기본 선택 근거.
 * 거래 번호는 다이제스트(txnDigest)로만 보내고 서버는 HMAC으로만 비교한다(저장·로그 없음). 금액·가맹점은 보내지 않는다
 */
export interface FileImportCheckRequest {
  provider: FileImportProvider;
  /** 1~FILE_IMPORT_CHECK_MAX건 */
  items: { txnDigest: string; occurredAt: string }[];
}

export interface FileImportCheckResponse {
  /** 요청 순서대로 */
  items: {
    /** 이미 지갑에 저장한 거래 → "추가됨"(비활성) */
    imported: boolean;
    /** 저장하면 자동 연결될 여정(직접 입력과 같은 규칙 — 기간 안 예정·진행 중 여정). 없으면 null */
    inTripId: string | null;
  }[];
}
