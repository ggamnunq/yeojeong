import type { FileImportProvider } from '@yeojeong/shared'

// 거래 내역 파일 가져오기(W10) 파서 공용 타입. 공급자(위챗페이·알리페이…)마다 parsers/<provider>.ts가 표(문자열 2차원 배열)를 읽어
// 아래 StatementItem으로 정규화한다. 파일 원본·표는 파싱이 끝나면 버리고, 화면 메모리에는 StatementItem만 남는다.

/** 파일 크기 상한(바이트). 위챗 1년치 xlsx는 보통 1MB 안팎 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/** 표 데이터 행 상한(헤더 아래). 넘으면 "파일이 너무 커요" */
export const MAX_DATA_ROWS = 20_000

/** 환불 상태: 없음 · 전액 환불(고를 수 없음) · 부분 환불(순액) */
export type RefundState = 'NONE' | 'FULL' | 'PARTIAL'

/**
 * 가져올 후보 결제 한 건(화면 메모리 전용). 거래 번호 원문은 들고 있지 않다 — 파싱하면서 바로 txnDigest(SHA-256)로 바꾼다.
 * 위챗 支付方式·商户单号·备注, 알리페이 对方账号·收/付款方式·商家订单号·备注는 읽지 않는다(이 타입에 자리도 없다).
 * 商品·商品说明은 가맹점 이름이 비었을 때 대신 쓰는 데만 쓰고 버린다
 */
export interface StatementItem {
  /** SHA-256("{provider}:{거래 번호}") hex. 행 키·중복 판정(서버 HMAC 재료) */
  txnDigest: string
  /** ISO 8601 + 공급자 시간대 오프셋(위챗·알리페이 "+08:00") */
  occurredAt: string
  /** 양수 decimal 소수 2자리. 부분 환불이면 순액(원 금액 − 환불액) */
  amount: string
  /** 파일의 원 결제 금액(부분 환불일 때 보조 줄용) */
  originalAmount: string
  currency: string
  /** 가맹점(40자까지) */
  merchantName: string
  refund: RefundState
  /** 부분 환불액(파일에 있을 때만). 없으면 null */
  refundAmount: string | null
}

/** 조용히 뺀 것과 화면에 개수를 알리는 것. transfer(송금·홍바오·이체)만 결과 화면 Caption에 보인다 */
export interface ExcludedCounts {
  /** 송금·홍바오·이체·받은 돈 등 사람 사이 거래 → 위챗 "송금·홍바오 N건은 제외했어요" · 알리페이 "송금·이체 N건은 제외했어요" */
  transfer: number
  /** 충전·출금·중성·그 밖의 수입·실패·알 수 없는 유형(세지만 보이지 않는다) */
  other: number
}

export interface ParsedStatement {
  provider: FileImportProvider
  /** 결제 시각 최신순 */
  items: StatementItem[]
  excluded: ExcludedCounts
}

/** 파일을 읽지 못한 이유 → 화면: format = HF-66b, archive = HF-66c(압축·암호), tooLarge = HF-66b 변형 */
export type StatementErrorKind = 'format' | 'archive' | 'tooLarge'

export class StatementFileError extends Error {
  readonly kind: StatementErrorKind
  constructor(kind: StatementErrorKind, message = kind) {
    super(message)
    this.name = 'StatementFileError'
    this.kind = kind
  }
}

/** 파일 → 표(행 × 칸, 문자열). xlsx 숫자 칸은 숫자 문자열 그대로 */
export type SheetRows = string[][]

/** 공급자별 표 해석기 */
export interface StatementParser {
  provider: FileImportProvider
  /** 표 → 정규화 결과. 헤더를 못 찾으면 StatementFileError('format') */
  parseRows: (rows: SheetRows) => Promise<ParsedStatement>
}
