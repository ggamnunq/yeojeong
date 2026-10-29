import type { CardApprovalItem, CardImportConfig, CardImportOrganization } from '@yeojeong/shared'
import { isApiError } from '../../api'
import { formatKrw, MINUS } from '../../ds'
import { addDays, type DateRangeValue, type YmdDate } from '../../ds/SheetContent/rules'
import { formatDateLabel, formatOriginal, kst } from '../payments/rules'
import { CardImportKeyPinError } from './crypto'

// 카드 내역 불러오기 화면 규칙(화면명세 L절 · 기능명세 4-12). 화면 없이 테스트한다.

// ── 카드사 ───────────────────────────────────────────────────────

/** 카드사 중성 마크(WF-52): 서버가 이니셜을 주지 않아 기관 코드로 정한다. 모르는 코드는 이름 첫 글자 */
const ORG_MARKS: Record<string, string> = {
  '0301': 'KB',
  '0303': '삼',
  '0304': 'NH',
  '0305': 'BC',
  '0306': '신',
  '0309': '우',
  '0311': '롯',
}

export const orgMark = (org: Pick<CardImportOrganization, 'code' | 'name'>) => ORG_MARKS[org.code] ?? org.name.slice(0, 1)

// ── 기간(WF-53 기간 한도) ─────────────────────────────────────────

export type RangeLimits = { min: YmdDate; max: YmdDate; maxDays: number }

/** 고른 카드사의 기간 한도: 과거 = 오늘 − maxLookbackDays, 미래 불가, 1회 최대 maxRangeDays(양끝 포함) */
export function rangeLimits(org: Pick<CardImportOrganization, 'maxRangeDays' | 'maxLookbackDays'>, today: YmdDate): RangeLimits {
  return { min: addDays(today, -org.maxLookbackDays), max: today, maxDays: org.maxRangeDays }
}

/**
 * 기본 기간을 카드사 한도 안으로 자른다(최근 쪽 기준): 종료일 = min(defaultRange.to, 오늘),
 * 시작일 = max(defaultRange.from, 종료일 − (maxRangeDays − 1), 오늘 − maxLookbackDays)
 */
export function clipRange(range: Pick<CardImportConfig['defaultRange'], 'from' | 'to'>, limits: RangeLimits): { from: YmdDate; to: YmdDate } {
  const to = range.to > limits.max ? limits.max : range.to < limits.min ? limits.min : range.to
  const candidates = [range.from, addDays(to, -(limits.maxDays - 1)), limits.min]
  const from = candidates.reduce((a, b) => (a > b ? a : b))
  return { from: from > to ? to : from, to }
}

/** 기간 행 값: "11.12 – 11.15", 올해가 아니면 "2025.12.30 – 01.02" */
export function rangeLabel({ from, to }: { from: YmdDate; to: YmdDate }, today: YmdDate) {
  const md = (d: YmdDate) => `${d.slice(5, 7)}.${d.slice(8, 10)}`
  const head = from.slice(0, 4) === today.slice(0, 4) ? md(from) : `${from.slice(0, 4)}.${md(from)}`
  return `${head} – ${md(to)}`
}

export const toRangeValue = ({ from, to }: { from: YmdDate; to: YmdDate }): DateRangeValue => ({ start: from, end: to })

// ── 시각 ─────────────────────────────────────────────────────────

/** ISO(UTC) → KST "HH:mm"(상대 시간 금지 — 화면명세 L-0 한도 시각) */
export const kstClock = (iso: string) => kst(iso).time

/** 남은 시간 "m:ss" */
export function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// ── 결과 목록(WF-56) ──────────────────────────────────────────────

export type ResultGroup = { localDate: string; label: string; items: CardApprovalItem[] }

/** 승인 일시 최신순으로 KST 날짜별로 묶는다(서버가 최신순으로 주지만 한 번 더 정렬한다) */
export function groupResults(items: readonly CardApprovalItem[]): ResultGroup[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt))
  const groups: ResultGroup[] = []
  for (const item of sorted) {
    const localDate = kst(item.approvedAt).date
    const last = groups.at(-1)
    if (last?.localDate === localDate) last.items.push(item)
    else groups.push({ localDate, label: formatDateLabel(localDate), items: [item] })
  }
  return groups
}

/** 칩(Tag Pending S) 문구 */
export function resultChip(item: Pick<CardApprovalItem, 'status'>): string | undefined {
  switch (item.status) {
    case 'ALREADY_IMPORTED':
      return '추가됨'
    case 'CANCELLED':
      return '취소됨'
    case 'SIMILAR':
      return '비슷한 기록'
    default:
      return undefined
  }
}

const signed = (text: string, negative: boolean) => (negative ? `${MINUS}${text}` : text)

/** 원통화 금액 문자열(부호 포함). KRW면 ₩ */
export function originalLabel(amount: string, currency: string) {
  const negative = Number(amount) < 0
  return signed(formatOriginal(amount, currency) ?? formatKrw(Math.abs(Number(amount))), negative)
}

/**
 * 행 금액(WF-56 금액 표시): 카드사 원화가 있으면 주 = ₩원화 · 보조 = 원통화(외화만) / 없으면 주 = 원통화 · 보조 = "약 ₩{estimatedKrwAmount}"
 * (없으면 보조 없음). 부분 취소는 보조 자리에 "부분 취소 −{통화}{취소액}"
 */
export function resultAmounts(
  item: Pick<CardApprovalItem, 'amount' | 'currency' | 'krwAmount' | 'estimatedKrwAmount' | 'partialCancelAmount'>,
): { amount: string; subAmount?: string } {
  const partial =
    item.partialCancelAmount !== null && Number(item.partialCancelAmount) > 0
      ? `부분 취소 ${MINUS}${originalLabel(item.partialCancelAmount, item.currency)}`
      : undefined
  if (item.krwAmount !== null) {
    return { amount: formatKrw(item.krwAmount), subAmount: partial ?? (item.currency === 'KRW' ? undefined : originalLabel(item.amount, item.currency)) }
  }
  if (item.currency === 'KRW') return { amount: originalLabel(item.amount, 'KRW'), subAmount: partial }
  const estimate = item.estimatedKrwAmount
  return {
    amount: originalLabel(item.amount, item.currency),
    subAmount: partial ?? (estimate != null ? `약 ${formatKrw(Number(item.amount) < 0 ? -Math.abs(estimate) : estimate)}` : undefined),
  }
}

/** 행 메타 "HH:mm · {여정 이름}"(여정 밖이면 "HH:mm") */
export function resultMeta(item: Pick<CardApprovalItem, 'approvedAt' | 'inTripId'>, tripName: (tripId: string) => string | undefined) {
  const time = kst(item.approvedAt).time
  const name = item.inTripId ? tripName(item.inTripId) : undefined
  return name ? `${time} · ${name}` : time
}

/** 처음 선택: defaultSelected이고 고를 수 있는 것 */
export const initialSelection = (items: readonly CardApprovalItem[]) =>
  new Set(items.filter((i) => i.selectable && i.defaultSelected && i.itemToken).map((i) => i.importKey))

export const selectableKeys = (items: readonly CardApprovalItem[]) =>
  items.filter((i) => i.selectable && i.itemToken).map((i) => i.importKey)

/** "전체 선택" 상태: 모두 선택이면 checked, 일부면 indeterminate */
export function selectAllState(items: readonly CardApprovalItem[], selected: ReadonlySet<string>) {
  const keys = selectableKeys(items)
  const count = keys.filter((k) => selected.has(k)).length
  return { total: keys.length, count, checked: keys.length > 0 && count === keys.length, indeterminate: count > 0 && count < keys.length }
}

/** "전체 선택" 누름: 모두 선택돼 있으면 전부 해제, 아니면 고를 수 있는 것 전부 선택 */
export function toggleAll(items: readonly CardApprovalItem[], selected: ReadonlySet<string>): Set<string> {
  const { checked } = selectAllState(items, selected)
  return checked ? new Set() : new Set(selectableKeys(items))
}

// ── 서버 응답 → 화면(화면명세 L-0 표) ─────────────────────────────

export type ErrorScreenKind = 'unavailable' | 'action' | 'rate' | 'daily'

export type FetchFailure =
  | { to: 'login-failed'; attempts: number }
  | { to: 'login-cooldown'; until: string }
  | { to: 'error'; kind: ErrorScreenKind; retryAfter?: string }
  | { to: 'in-progress' }
  | { to: 'two-way-expired' }
  | { to: 'two-way-invalid' }
  | { to: 'encryption-invalid' }
  | { to: 'range'; message: string }
  | { to: 'consent' }
  | { to: 'off' }
  | { to: 'retry-toast' }

const detail = (error: unknown, key: string) => (isApiError(error) ? error.details?.[key] : undefined)

/** 같은 KST 날짜인가(한도 시각이 오늘을 넘기면 오늘 한도 소진으로 본다) */
const sameKstDay = (a: number, b: number) => kst(a).date === kst(b).date

/**
 * 조회(POST /card-import/fetch) 실패를 화면 처리로 바꾼다. CODEF·카드사 원문 메시지는 쓰지 않는다(우리 문구만).
 * now = 기기 시각(epoch ms, 한도 시각 비교용)
 */
export function classifyFetchError(error: unknown, now: number): FetchFailure {
  if (error instanceof CardImportKeyPinError) return { to: 'error', kind: 'unavailable' }
  if (!isApiError(error)) return { to: 'error', kind: 'unavailable' }
  switch (error.code) {
    case 'CARD_LOGIN_FAILED': {
      const attempts = Number(detail(error, 'failedAttempts'))
      return { to: 'login-failed', attempts: Number.isFinite(attempts) ? attempts : 1 }
    }
    case 'CARD_IMPORT_LOGIN_COOLDOWN': {
      const until = retryAt(error, now)
      return { to: 'login-cooldown', until }
    }
    case 'CARD_ACCOUNT_ACTION_REQUIRED':
      return { to: 'error', kind: 'action' }
    case 'CARD_IMPORT_RATE_LIMITED': {
      const until = retryAt(error, now)
      return sameKstDay(Date.parse(until), now) ? { to: 'error', kind: 'rate', retryAfter: until } : { to: 'error', kind: 'daily' }
    }
    case 'CARD_IMPORT_DAILY_LIMIT':
      return { to: 'error', kind: 'daily' }
    case 'CARD_IMPORT_IN_PROGRESS':
      return { to: 'in-progress' }
    case 'CARD_TWO_WAY_EXPIRED':
      return { to: 'two-way-expired' }
    case 'CARD_TWO_WAY_INVALID':
      return { to: 'two-way-invalid' }
    case 'CARD_PASSWORD_ENCRYPTION_INVALID':
      return { to: 'encryption-invalid' }
    case 'CONSENT_REQUIRED':
      return { to: 'consent' }
    case 'NOT_FOUND':
      return { to: 'off' }
    case 'RATE_LIMITED':
    case 'CSRF_REJECTED':
      return { to: 'retry-toast' }
    case 'VALIDATION_FAILED': {
      const message = rangeMessage(error)
      return message ? { to: 'range', message } : { to: 'retry-toast' }
    }
    default:
      // CARD_COMPANY_UNAVAILABLE · CARD_IMPORT_FAILED · CARD_TWO_WAY_UNSUPPORTED · 연결 실패 · 시간 초과 · 그 밖
      return { to: 'error', kind: 'unavailable' }
  }
}

/** 한도 해제 시각(ISO). details.retryAfter → retryAfterSec → 30분 뒤 */
function retryAt(error: unknown, now: number): string {
  const iso = detail(error, 'retryAfter')
  if (typeof iso === 'string' && !Number.isNaN(Date.parse(iso))) return iso
  const sec = Number(detail(error, 'retryAfterSec') ?? (isApiError(error) ? error.retryAfterSec : undefined))
  return new Date(now + (Number.isFinite(sec) && sec > 0 ? sec : 1800) * 1000).toISOString()
}

/** 기간 검증 실패(from·to) 문구 — 서버 메시지 대신 우리 문구 */
function rangeMessage(error: unknown): string | null {
  const fields = detail(error, 'fields')
  if (!Array.isArray(fields)) return null
  for (const f of fields as { path?: string; code?: string }[]) {
    if (f.path !== 'from' && f.path !== 'to') continue
    if (f.code === 'maxRange') return 'MAX_RANGE'
    if (f.code === 'tooOld') return '이보다 이전 내역은 불러올 수 없어요'
    return '기간을 다시 골라 주세요'
  }
  return null
}

/** 기간 검증 문구 완성(maxRange는 카드사 한도 숫자를 넣는다) */
export const rangeErrorText = (message: string, maxDays: number) => (message === 'MAX_RANGE' ? `${maxDays}일까지 고를 수 있어요` : message)
