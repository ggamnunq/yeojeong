import { formatKrw } from '../format'

/**
 * 공동 결제를 부담 인원으로 나눈다(docs/spec 용어: perPersonKrw · remainderKrw).
 * 1인 = 금액 ÷ 인원을 원 단위로 내림, 나머지는 결제자가 부담한다("결제자 +N원").
 * 예: 26,290 ÷ 4 → 1인 6,572 · 나머지 2
 */
export function splitEvenly(amount: number, count: number) {
  const won = Math.round(amount)
  if (count <= 0) return { perPerson: 0, remainder: 0 }
  const perPerson = Math.floor(won / count)
  return { perPerson, remainder: won - perPerson * count }
}

/**
 * SheetContent/SplitPick 요약 글자(DS18 · WF-47): "1인 ₩3,676" + 나머지가 있으면 "결제자 +2원".
 * amountKrw는 원화 환산 금액(외화면 toKrw 결과). 0명이면 둘 다 null.
 */
export function splitPickSummary(amountKrw: number, count: number) {
  if (count <= 0) return { perPerson: null, remainder: null }
  const split = splitEvenly(amountKrw, count)
  return {
    perPerson: `1인 ${formatKrw(split.perPerson)}`,
    remainder: split.remainder > 0 ? `결제자 +${split.remainder}원` : null,
  }
}

type ConsentCheck = { checked: boolean; required?: boolean }

/** 전체 동의 체크 = 행이 하나 이상이고 모두 체크(SheetContent/Consent) */
export const consentAllChecked = (items: readonly ConsentCheck[]) => items.length > 0 && items.every((i) => i.checked)

/** CTA 활성 = 행이 하나 이상이고 필수(required 기본 true) 행이 모두 체크 */
export const consentRequiredDone = (items: readonly ConsentCheck[]) =>
  items.length > 0 && items.every((i) => i.checked || i.required === false)

// ── SheetContent/DateRange(v1.6) 날짜 계산 ────────────────────────────────
// 날짜는 'YYYY-MM-DD' 문자열(서버 DTO와 같은 달력 날짜). 시간대 영향을 받지 않게 UTC 자정으로만 계산한다.
// 자릿수가 고정이라 문자열 비교(<, >)가 날짜 비교와 같다.

export type YmdDate = string
export type DateRangeValue = { start: YmdDate | null; end: YmdDate | null }
/** 지금 고르는 쪽(활성 칩) */
export type DateRangeField = 'start' | 'end'

export const DATE_RANGE_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

const pad = (n: number) => String(n).padStart(2, '0')
const utc = (ymd: YmdDate) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const fromUtc = (date: Date): YmdDate => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`

/** 기기 시간대 기준 오늘 */
export const localToday = (now = new Date()): YmdDate => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

export function addDays(ymd: YmdDate, days: number): YmdDate {
  const date = utc(ymd)
  date.setUTCDate(date.getUTCDate() + days)
  return fromUtc(date)
}

/** 달의 첫날 'YYYY-MM-01' */
export const monthOf = (ymd: YmdDate): YmdDate => `${ymd.slice(0, 7)}-01`

export function addMonths(month: YmdDate, months: number): YmdDate {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + months
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`
}

/** 7열(일~토) 달력. 앞뒤 빈 칸은 null, 주 수는 4~6 */
export function monthGrid(month: YmdDate): (YmdDate | null)[][] {
  const first = utc(monthOf(month))
  const lead = first.getUTCDay()
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const cells: (YmdDate | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= days; d++) cells.push(`${month.slice(0, 7)}-${pad(d)}`)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (YmdDate | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export const weekdayOf = (ymd: YmdDate) => DATE_RANGE_WEEKDAYS[utc(ymd).getUTCDay()]

/** 칩 · Picker 값: "11.12 (목)" */
export const formatDateShort = (ymd: YmdDate) => `${Number(ymd.slice(5, 7))}.${ymd.slice(8, 10)} (${weekdayOf(ymd)})`

/** Input Picker 값: "11.12 (목) – 11.15 (일)". 하나라도 없으면 null(플레이스홀더 "출발일 – 도착일") */
export const formatDateRange = ({ start, end }: DateRangeValue) =>
  start && end ? `${formatDateShort(start)} – ${formatDateShort(end)}` : null

/** 달 제목: "2026년 11월" */
export const formatMonth = (month: YmdDate) => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`

/** 스크린리더용 날짜: "2026년 11월 12일 목요일" */
export const formatDateLong = (ymd: YmdDate) =>
  `${ymd.slice(0, 4)}년 ${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일 ${weekdayOf(ymd)}요일`

export type DateRangeLimits = {
  /** 고를 수 있는 가장 이른 날(출발·도착 공통). 이보다 앞은 흐림 */
  min?: YmdDate
  /** 고를 수 있는 가장 늦은 날 */
  max?: YmdDate
  /** 도착일만의 하한(진행 중 여정 수정: 오늘 이후) */
  endMin?: YmdDate
  /** 출발~도착 최대 일수(양끝 포함). 도착일 상한 = 출발 + maxDays − 1 */
  maxDays?: number
  /** 출발일 고정(진행 중 여정 수정) */
  startLocked?: boolean
}

/** 지금 고르는 쪽(field) 기준으로 그 날을 누를 수 있는가 */
export function isDateSelectable(ymd: YmdDate, field: DateRangeField, value: DateRangeValue, limits: DateRangeLimits): boolean {
  const { min, max, endMin, maxDays, startLocked = false } = limits
  if ((min && ymd < min) || (max && ymd > max)) return false
  if (field === 'start') return !startLocked
  // 도착일을 고르는 중: 출발일 앞을 누르면 출발일을 새로 고르는 것(출발일 고정이면 불가)
  if (value.start && ymd < value.start) return !startLocked
  if (endMin && ymd < endMin) return false
  if (value.start && maxDays && ymd > addDays(value.start, maxDays - 1)) return false
  return true
}

/**
 * 날짜를 눌렀을 때 다음 값과 다음 활성 칩.
 * 출발일을 고르면 도착일 칩으로 넘어간다(기존 도착일이 출발일보다 앞이거나 한도를 넘으면 비운다).
 * 도착일을 고르는 중에 출발일보다 앞을 누르면 그날이 새 출발일이 된다.
 */
export function pickDate(
  ymd: YmdDate,
  field: DateRangeField,
  value: DateRangeValue,
  limits: DateRangeLimits = {},
): { value: DateRangeValue; field: DateRangeField } {
  const startOver = field === 'start' || (value.start !== null && ymd < value.start)
  if (startOver && !limits.startLocked) {
    const next = { start: ymd, end: null }
    const keepEnd = value.end !== null && value.end >= ymd && isDateSelectable(value.end, 'end', next, limits)
    return { value: { start: ymd, end: keepEnd ? value.end : null }, field: 'end' }
  }
  return { value: { start: value.start, end: ymd }, field: 'end' }
}
