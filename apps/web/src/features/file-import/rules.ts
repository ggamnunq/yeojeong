import {
  MANUAL_OCCURRED_AT_FUTURE_SECONDS,
  MANUAL_OCCURRED_AT_PAST_DAYS,
  type FileImportItem,
  type FxSpotSeriesResponse,
  type TripListItem,
} from '@yeojeong/shared'
import { formatKrw, MINUS } from '../../ds'
import { previewKrw } from '../manual/rules'
import { formatDateLabel, formatOriginal, kst } from '../payments/rules'
import { COPY } from './copy'
import type { StatementItem } from './parsers/types'

// 결과 화면(HF-68) 규칙. 화면 없이 테스트한다.

/**
 * 결과 행 = 파일에서 읽은 후보 + 서버 대조(추가됨) + 화면이 정한 자동 연결 여정·추정 원화.
 * 서버에는 대조값만 보내므로(명세 4-13-7) 여정·환율은 화면이 내 여정 목록·고시 표로 정한다
 */
export type ResultRow = StatementItem & { imported: boolean; inTripId: string | null; estimatedKrw: number | null }

const KST_OFFSET_MS = 9 * 3_600_000
const DAY_MS = 86_400_000
const kstStart = (date: string) => Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS

/**
 * 저장하면 자동 연결될 여정(서버 rankTripCandidates · suggestedTripOf와 같은 규칙): 내가 멤버인 예정·진행 중 여정 중
 * 결제 시각이 기간(KST 시작일 00:00 ~ 종료일 23:59:59.999) 안인 것 → 진행 중 먼저 → 시작이 가까운 순 → tripId. 없으면 null
 */
export function suggestTripId(trips: readonly Pick<TripListItem, 'tripId' | 'status' | 'startDate' | 'endDate'>[], occurredAt: string): string | null {
  const time = Date.parse(occurredAt)
  const inPeriod = trips.filter(
    (t) => (t.status === 'UPCOMING' || t.status === 'ONGOING') && kstStart(t.startDate) <= time && time < kstStart(t.endDate) + DAY_MS,
  )
  inPeriod.sort(
    (a, b) =>
      Number(b.status === 'ONGOING') - Number(a.status === 'ONGOING') ||
      Math.abs(kstStart(a.startDate) - time) - Math.abs(kstStart(b.startDate) - time) ||
      a.tripId.localeCompare(b.tripId),
  )
  return inPeriod[0]?.tripId ?? null
}

/** 결제 시각 기준 시장 환율(S7c spot): 결제 시각 이전 가장 최근 고시. 이전 고시가 없으면 null(카드 estimatedKrwAmount와 같은 규칙) */
export function spotRateAt(rates: FxSpotSeriesResponse['rates'], occurredAt: string): string | null {
  const time = Date.parse(occurredAt)
  let found: string | null = null
  for (const r of rates) {
    if (Date.parse(r.effectiveAt) <= time) found = r.rate
    else break
  }
  return found
}

export function buildRows(
  items: readonly StatementItem[],
  imported: readonly boolean[],
  trips: readonly Pick<TripListItem, 'tripId' | 'status' | 'startDate' | 'endDate'>[],
  rates: FxSpotSeriesResponse['rates'] | null,
): ResultRow[] {
  return items.map((item, index) => {
    const rate = rates ? spotRateAt(rates, item.occurredAt) : null
    const estimate = rate ? previewKrw(item.amount, item.currency, rate) : null
    return {
      ...item,
      imported: imported[index] ?? false,
      inTripId: suggestTripId(trips, item.occurredAt),
      estimatedKrw: estimate !== null && estimate > 0 ? estimate : null,
    }
  })
}

/** 환율 조회 기간: 결과 행들의 KST 날짜 [가장 이른 날, 가장 늦은 날] */
export function kstDateRange(items: readonly Pick<StatementItem, 'occurredAt'>[]): { from: string; to: string } | null {
  if (items.length === 0) return null
  const dates = items.map((i) => kst(i.occurredAt).date).sort()
  return { from: dates[0], to: dates[dates.length - 1] }
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

/** 행 금액: 주 = 원통화 순액("CN¥128.00"), 보조 = 부분 환불 "부분 환불 −CN¥30.00"(환불액을 모르면 "부분 환불") 또는 "약 ₩"(결제 시각 기준 시장 환율) */
export function rowAmounts(row: Pick<ResultRow, 'amount' | 'currency' | 'refund' | 'refundAmount' | 'estimatedKrw'>): { amount: string; subAmount?: string } {
  const amount = original(row.amount, row.currency)
  if (row.refund === 'PARTIAL') {
    return { amount, subAmount: row.refundAmount ? `${COPY.partialRefund} ${MINUS}${original(row.refundAmount, row.currency)}` : COPY.partialRefund }
  }
  return { amount, subAmount: row.estimatedKrw !== null ? `약 ${formatKrw(row.estimatedKrw)}` : undefined }
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
