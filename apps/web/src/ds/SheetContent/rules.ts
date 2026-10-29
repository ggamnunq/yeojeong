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

// ── SheetContent/DateTime(v1.7 · B-27) 날짜·시각 계산 ─────────────────────
// 시점은 epoch ms, 달력·시각은 KST(UTC+9, 서머타임 없음) 벽시계로 본다. 기기 시간대와 무관하다.
// 범위: 지금 + 5분 이후 · 365일 이전은 고를 수 없다(양끝 포함). 값 표기는 KST ISO "2026-11-13T15:20:00+09:00".

export const KST_OFFSET_MS = 9 * 60 * 60_000
/** 미래 허용 폭(분): 지금 + 5분까지 */
export const DATE_TIME_AHEAD_MINUTES = 5
/** 과거 허용 폭(일) */
export const DATE_TIME_PAST_DAYS = 365

/** 시트에서 고르는 중인 값. hour · minute는 입력 칸 글자 그대로(0~2자리 숫자) */
export type DateTimeDraft = { date: YmdDate; hour: string; minute: string }
/** 고를 수 있는 시점 범위(epoch ms, 양끝 포함) */
export type DateTimeLimits = { min: number; max: number }
export type SheetContentDateTimeMode = 'datetime' | 'date'

/** epoch ms → KST 날짜 · 시 · 분("HH" · "mm") */
export function kstParts(at: number) {
  const d = new Date(at + KST_OFFSET_MS)
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` as YmdDate,
    hour: pad(d.getUTCHours()),
    minute: pad(d.getUTCMinutes()),
  }
}

/** 기본 범위: [지금 − 365일, 지금 + 5분] */
export const dateTimeLimits = (
  now: number,
  { aheadMinutes = DATE_TIME_AHEAD_MINUTES, pastDays = DATE_TIME_PAST_DAYS }: { aheadMinutes?: number; pastDays?: number } = {},
): DateTimeLimits => ({ min: now - pastDays * 86_400_000, max: now + aheadMinutes * 60_000 })

/** 시트를 열 때 초기값: 고른 시점(ISO · epoch ms)이 없으면 지금 */
export function dateTimeDraft(value: string | number | null | undefined, now: number): DateTimeDraft {
  const at = value == null ? now : typeof value === 'number' ? value : Date.parse(value)
  return kstParts(Number.isNaN(at) ? now : at)
}

/** 시·분 칸 입력 정리: 숫자만, 최대 2자리 */
export const timeDigits = (input: string) => input.replace(/\D/g, '').slice(0, 2)

const timeNumber = (digits: string, max: number) => {
  if (!/^\d{1,2}$/.test(digits)) return null
  const n = Number(digits)
  return n <= max ? n : null
}

/** 고른 값 → KST ISO "2026-11-13T15:20:00+09:00". 시·분이 비었거나 범위(0~23 · 0~59) 밖이면 null */
export function dateTimeIso(draft: DateTimeDraft): string | null {
  const h = timeNumber(draft.hour, 23)
  const m = timeNumber(draft.minute, 59)
  if (h === null || m === null) return null
  return `${draft.date}T${pad(h)}:${pad(m)}:00+09:00`
}

/** 달력에서 그 날을 누를 수 있는가: 범위 양끝 시점이 든 KST 날짜까지 */
export const isDateTimeDaySelectable = (ymd: YmdDate, limits: DateTimeLimits) =>
  ymd >= kstParts(limits.min).date && ymd <= kstParts(limits.max).date

/**
 * 확인을 누를 수 없는 이유. null이면 확인 가능.
 * - incomplete: 시·분이 비었거나 0~23 · 0~59 밖(Mode=DateTime)
 * - range: 날짜가 범위 밖이거나, 그 날짜 + 시각이 범위 밖(오늘이면 지금 + 5분까지만)
 */
export function dateTimeProblem(
  draft: DateTimeDraft,
  limits: DateTimeLimits,
  mode: SheetContentDateTimeMode = 'datetime',
): 'incomplete' | 'range' | null {
  if (!isDateTimeDaySelectable(draft.date, limits)) return 'range'
  if (mode === 'date') return null
  const iso = dateTimeIso(draft)
  if (iso === null) return 'incomplete'
  const at = Date.parse(iso)
  return at < limits.min || at > limits.max ? 'range' : null
}

/** Row/Field 날짜 값: 손대지 않았으면(null) "지금", 고르면 KST "11.13 15:20" */
export function formatDateTimeValue(value: string | number | null | undefined) {
  if (value == null) return '지금'
  const at = typeof value === 'number' ? value : Date.parse(value)
  if (Number.isNaN(at)) return '지금'
  const p = kstParts(at)
  return `${p.date.slice(5, 7)}.${p.date.slice(8, 10)} ${p.hour}:${p.minute}`
}
