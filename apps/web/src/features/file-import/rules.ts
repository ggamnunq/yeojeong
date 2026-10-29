import { MANUAL_OCCURRED_AT_FUTURE_SECONDS, MANUAL_OCCURRED_AT_PAST_DAYS, type FileImportCheckResponse, type FileImportItem } from '@yeojeong/shared'
import { formatKrw, MINUS } from '../../ds'
import { previewKrw } from '../manual/rules'
import { formatDateLabel, formatOriginal, kst } from '../payments/rules'
import { COPY } from './copy'
import type { StatementItem } from './parsers/types'

// 결과 화면(HF-68) 규칙. 화면 없이 테스트한다.

/** 결과 행 = 파일에서 읽은 후보 + 서버 확인(추가됨 · 자동 연결될 여정) */
export type ResultRow = StatementItem & { imported: boolean; inTripId: string | null }

export function mergeCheck(items: readonly StatementItem[], check: FileImportCheckResponse['items']): ResultRow[] {
  return items.map((item, index) => ({ ...item, imported: check[index]?.imported ?? false, inTripId: check[index]?.inTripId ?? null }))
}

/** 고를 수 있는가: 추가됨·전액 환불은 못 고른다 */
export const isSelectable = (row: Pick<ResultRow, 'imported' | 'refund'>) => !row.imported && row.refund !== 'FULL'

/** 처음 선택 = 고를 수 있고 여정 기간 안(자동 연결 대상이 있는) 결제 */
export const initialSelection = (rows: readonly ResultRow[]) => new Set(rows.filter((r) => isSelectable(r) && r.inTripId !== null).map((r) => r.txnDigest))

const selectableKeys = (rows: readonly ResultRow[]) => rows.filter(isSelectable).map((r) => r.txnDigest)

/** "전체 선택" 상태 */
export function selectAllState(rows: readonly ResultRow[], selected: ReadonlySet<string>) {
  const keys = selectableKeys(rows)
  const count = keys.filter((k) => selected.has(k)).length
  return { total: keys.length, count, checked: keys.length > 0 && count === keys.length, indeterminate: count > 0 && count < keys.length }
}

/** "전체 선택" 누름: 모두 선택이면 전부 해제, 아니면 고를 수 있는 것 전부 */
export function toggleAll(rows: readonly ResultRow[], selected: ReadonlySet<string>): Set<string> {
  return selectAllState(rows, selected).checked ? new Set() : new Set(selectableKeys(rows))
}

export const toggleOne = (selected: ReadonlySet<string>, key: string) => {
  const next = new Set(selected)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/** KST 날짜별(최신순) 묶음. 위챗 시각(+08:00)은 KST로 1시간 뒤라 자정 무렵 결제는 다음 날로 간다 */
export function groupRows(rows: readonly ResultRow[]) {
  const sorted = [...rows].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  const groups: { localDate: string; label: string; items: ResultRow[] }[] = []
  for (const row of sorted) {
    const localDate = kst(row.occurredAt).date
    const last = groups.at(-1)
    if (last?.localDate === localDate) last.items.push(row)
    else groups.push({ localDate, label: formatDateLabel(localDate), items: [row] })
  }
  return groups
}

/** 원통화 표기는 앱 공용 규칙(payments/rules formatOriginal: JPY "¥", CNY "CN¥" …) */
const original = (amount: string, currency: string) => formatOriginal(amount, currency) ?? amount

/** 행 금액: 주 = 원통화 순액("CN¥128.00"), 보조 = 부분 환불 "부분 환불 −CN¥30.00"(환불액을 모르면 "부분 환불") 또는 "약 ₩"(최신 고시) */
export function rowAmounts(row: Pick<ResultRow, 'amount' | 'currency' | 'refund' | 'refundAmount'>, rate: string | null): { amount: string; subAmount?: string } {
  const amount = original(row.amount, row.currency)
  if (row.refund === 'PARTIAL') {
    return { amount, subAmount: row.refundAmount ? `${COPY.partialRefund} ${MINUS}${original(row.refundAmount, row.currency)}` : COPY.partialRefund }
  }
  const estimate = rate ? previewKrw(row.amount, row.currency, rate) : null
  return { amount, subAmount: estimate !== null && estimate > 0 ? `약 ${formatKrw(estimate)}` : undefined }
}

/** 행 메타 "HH:mm · {여정 이름}"(KST 시각) */
export function rowMeta(row: Pick<ResultRow, 'occurredAt' | 'inTripId'>, tripName: (tripId: string) => string | undefined) {
  const time = kst(row.occurredAt).time
  const name = row.inTripId ? tripName(row.inTripId) : undefined
  return name ? `${time} · ${name}` : time
}

export function rowChip(row: Pick<ResultRow, 'imported' | 'refund'>): string | undefined {
  if (row.imported) return COPY.chipAdded
  if (row.refund === 'FULL') return COPY.chipRefunded
  return undefined
}

/** 저장 요청 항목(고른 것만). 서버에는 다이제스트·시각·순액·통화·가맹점만 간다 */
export function toImportItems(rows: readonly ResultRow[], selected: ReadonlySet<string>): FileImportItem[] {
  return rows
    .filter((r) => isSelectable(r) && selected.has(r.txnDigest))
    .map((r) => ({ txnDigest: r.txnDigest, occurredAt: r.occurredAt, amount: r.amount, currency: r.currency, merchantName: r.merchantName }))
}

/** n개씩 나누기(요청 상한) */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * 서버가 받는 결제 시각 범위(직접 입력 S7과 같다: 지금 − 365일 ~ 지금 + 5분) 안인가. 밖이면 결과에 넣지 않는다
 * (서버가 요청 전체를 400으로 거절하지 않게). now는 화면 시계(clock.now)
 */
export function inAcceptedRange(occurredAt: string, now: number) {
  const time = Date.parse(occurredAt)
  return time <= now + MANUAL_OCCURRED_AT_FUTURE_SECONDS * 1000 && time >= now - MANUAL_OCCURRED_AT_PAST_DAYS * 86_400_000
}
