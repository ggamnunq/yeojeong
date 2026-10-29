import {
  formatInviteCode as formatInviteCodeFull,
  GROUP_NAME_MAX_LENGTH,
  INVITE_CODE_LENGTH,
  PLACE_LABEL_MAX_LENGTH,
  TRIP_BUDGET_MAX_KRW,
  TRIP_EDITABLE_FIELDS,
  TRIP_MAX_DAYS,
  TRIP_START_PAST_LIMIT_DAYS,
} from '@yeojeong/shared'
import type { TripStatus } from '../../api'
import { formatKrw } from '../../ds/format'
import type {
  SupportedCurrency,
  TripEditableField,
  TripFormValues,
  TripInfo,
  TripPermissions,
  UpdateTripRequest,
} from './types'

// 여정 생성·참여·여정 정보의 순수 규칙(기능명세 4-7·4-8, FR-201~209·301~304). 화면 없이 테스트한다.
// 날짜는 KST 달력 날짜 문자열("2026-11-12")로만 다룬다.

// 기간·예산·그룹명 한도와 단계별 수정 항목은 서버와 같은 값(@yeojeong/shared api/trips.ts)
export { GROUP_NAME_MAX_LENGTH, PLACE_LABEL_MAX_LENGTH, TRIP_BUDGET_MAX_KRW, TRIP_EDITABLE_FIELDS, TRIP_MAX_DAYS, TRIP_START_PAST_LIMIT_DAYS }

export const COPY = {
  copied: '복사했어요',
  saved: '저장했어요',
  retryLater: '잠시 후 다시 시도해 주세요',
  inviteInvalid: '초대코드를 다시 확인해 주세요',
  inviteUnavailable: '참여할 수 없는 여정이에요',
  alreadyMember: '이미 참여한 여정이에요',
  periodInvalid: '종료일을 확인해 주세요',
} as const

// ── 날짜 ─────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 3_600_000
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`)

/** 오늘(KST) "2026-11-13" */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** b − a (일) */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

const weekday = (date: string) => WEEKDAYS[new Date(toUtc(date)).getUTCDay()]

/** 경로 라벨 "11.12 (목)" */
export function formatRouteDate(date: string): string {
  return `${date.slice(5, 7)}.${date.slice(8, 10)} (${weekday(date)})`
}

/** 날짜 입력값 "2026.11.12 (목)" (화면명세 0-5) */
export function formatInputDate(date: string): string {
  return `${date.slice(0, 4)}.${formatRouteDate(date)}`
}

/** 기간 입력값 "2026.11.12 (목) – 2026.11.15 (일)" */
export function formatPeriodInput(start: string, end: string): string {
  return `${formatInputDate(start)} – ${formatInputDate(end)}`
}

// ── 초대코드(저장 형식 검사 normalizeInviteCode는 @yeojeong/shared) ─────────

/** 입력값 → 코드 글자(대문자·영숫자만, 6자까지). 하이픈·공백·기호는 버린다 */
export function inviteInputChars(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, INVITE_CODE_LENGTH)
}

/** 표시용 3-3: K7M2QX → K7M-2QX. 입력 중(3자 이하)이면 하이픈 없이 그대로 */
export function formatInviteCode(code: string): string {
  return code.length > 3 ? formatInviteCodeFull(code) : code
}

// ── 금액 ─────────────────────────────────────────────────────────

/** 예산 입력 → 숫자만 남긴 문자열. 범위(최대 10억)를 넘으면 이전 값을 그대로 둔다(입력 막음) */
export function budgetDigits(input: string, previous = ''): string {
  const digits = input.replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length > 10 || Number(digits) > TRIP_BUDGET_MAX_KRW) return previous
  return digits
}

/** 예산 입력란 표시 "₩1,200,000"(빈 값은 플레이스홀더 "₩0") */
export function formatBudgetInput(digits: string): string {
  return digits ? formatKrw(Number(digits)) : ''
}

// ── 폼 ───────────────────────────────────────────────────────────

export type TripFormMode = { kind: 'create' } | { kind: 'edit'; status: TripStatus }

export const EMPTY_TRIP_FORM: TripFormValues = { groupName: '', place: '', currency: null, startDate: '', endDate: '', budget: '' }

export function formValuesOf(trip: TripInfo): TripFormValues {
  return {
    groupName: trip.groupName,
    place: trip.placeLabel,
    currency: trip.currency,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budget: String(trip.budgetKrw),
  }
}

/** 이 모드에서 고칠 수 있는 항목. 만들기는 전부, 수정은 서버 permissions.editableFields(없으면 단계 기본값) */
export function editableFieldsOf(mode: TripFormMode, serverFields?: readonly TripEditableField[]): readonly TripEditableField[] {
  if (mode.kind === 'create') return TRIP_EDITABLE_FIELDS.UPCOMING
  return serverFields ?? TRIP_EDITABLE_FIELDS[mode.status]
}

/** 통화 표시 "JPY · 일본 엔". 목록을 아직 못 받았으면 코드만 */
export function currencyLabel(code: string | null, currencies: readonly SupportedCurrency[] | undefined): string | undefined {
  if (!code) return undefined
  const found = currencies?.find((c) => c.code === code)
  return found ? `${found.code} · ${found.name}` : code
}

/** 날짜 선택 범위. 시작일 ≥ 오늘−30(만들기·시작 전), 종료일 ≥ 시작일(진행 중은 오늘 이후), 길이 ≤ 31일 */
export function periodLimits(startDate: string, mode: TripFormMode, today: string) {
  const startMin = addDays(today, -TRIP_START_PAST_LIMIT_DAYS)
  const ongoing = mode.kind === 'edit' && mode.status === 'ONGOING'
  const endMinBase = startDate || startMin
  const endMin = ongoing && today > endMinBase ? today : endMinBase
  const endMax = startDate ? addDays(startDate, TRIP_MAX_DAYS - 1) : undefined
  return { startMin, endMin, endMax }
}

/** 기간 오류 문구. 둘 다 고르지 않았으면 오류 아님(버튼만 비활성) */
export function periodError(values: Pick<TripFormValues, 'startDate' | 'endDate'>, mode: TripFormMode, today: string) {
  const { startDate, endDate } = values
  if (!startDate || !endDate) return null
  const { startMin, endMin, endMax } = periodLimits(startDate, mode, today)
  const startLocked = mode.kind === 'edit' && mode.status !== 'UPCOMING'
  if (!startLocked && startDate < startMin) return COPY.periodInvalid
  if (endDate < endMin || (endMax && endDate > endMax)) return COPY.periodInvalid
  return null
}

export function isGroupNameValid(name: string) {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= GROUP_NAME_MAX_LENGTH
}

/** 여행 장소: 앞뒤 공백을 빼고 1~40자 */
export function isPlaceValid(place: string) {
  const trimmed = place.trim()
  return trimmed.length >= 1 && trimmed.length <= PLACE_LABEL_MAX_LENGTH
}

/** 다섯 항목이 모두 유효한가(FR-201 버튼 조건: 그룹명 · 여행 장소 · 현지 통화 · 기간 · 예산) */
export function isTripFormValid(values: TripFormValues, mode: TripFormMode, today: string) {
  const budget = Number(values.budget)
  return (
    isGroupNameValid(values.groupName) &&
    isPlaceValid(values.place) &&
    Boolean(values.currency) &&
    Boolean(values.startDate && values.endDate) &&
    periodError(values, mode, today) === null &&
    budget >= 1 &&
    budget <= TRIP_BUDGET_MAX_KRW
  )
}

/** 수정 요청 본문: 고칠 수 있는 항목 중 바뀐 것만 + version. 바뀐 것이 없으면 null */
export function tripUpdateBody(
  initial: TripFormValues,
  values: TripFormValues,
  editable: readonly TripEditableField[],
  version: number,
): UpdateTripRequest | null {
  const body: UpdateTripRequest = { version }
  const can = (field: TripEditableField) => editable.includes(field)
  if (can('groupName') && values.groupName.trim() !== initial.groupName.trim()) body.groupName = values.groupName.trim()
  if (can('place') && values.place.trim() !== initial.place.trim()) body.place = { label: values.place.trim() }
  if (can('currency') && values.currency && values.currency !== initial.currency) body.currency = values.currency
  if (can('startDate') && values.startDate !== initial.startDate) body.startDate = values.startDate
  if (can('endDate') && values.endDate !== initial.endDate) body.endDate = values.endDate
  if (can('budgetKrw') && values.budget !== initial.budget) body.budgetKrw = Number(values.budget)
  return Object.keys(body).length > 1 ? body : null
}

// ── 여정 정보 ─────────────────────────────────────────────────────

/** 버튼 노출 권한은 서버가 계산한 값을 그대로 쓴다. */
export function tripPermissions(trip: TripInfo, _today?: string): TripPermissions {
  return trip.permissions
}

/**
 * 시작 전 그룹장 하단 버튼(Q-26, 화면명세 WF-16 v0.5.8). 서버 permissions.startBlockReason으로만 정한다(기기 시계로 계산하지 않음).
 * 'start' = 「여정 시작」, 'edit-period' = 종료일이 지나 「기간 수정」, null = 버튼 없음(멤버·시작 후)
 */
export function startAction(trip: Pick<TripInfo, 'status' | 'me' | 'permissions'>): 'start' | 'edit-period' | null {
  if (trip.status !== 'UPCOMING' || trip.me.role !== 'LEADER') return null
  const { startBlockReason, canStart } = trip.permissions
  if (startBlockReason === 'PERIOD_OVER') return 'edit-period'
  // 과도기(필드 없는 응답): 그룹장 · 시작 전인데 시작할 수 없으면 기간 경과로 본다
  if (startBlockReason === undefined && !canStart) return 'edit-period'
  return 'start'
}

/** 진행 중 오늘이 몇째 날인지(1 ~ days). 서버 계산값만 사용한다. */
export function tripDayIndex(trip: TripInfo, _today?: string): number {
  return trip.todayDayIndex ?? 1
}

export type TripHero = { label: string; value: string; suffix?: string }

/** 영웅 카드 글자: 시작 전 "출발까지 D-15"(당일 D-day, 시작일 지남 "시작 전") · 진행 중 "여행 중 Day 2 / 4" · 종료 "종료 3박 4일" */
export function tripHero(trip: TripInfo, today: string): TripHero {
  if (trip.status === 'UPCOMING') {
    // 서버 dDay는 시작일이 지났으면 null
    if (trip.startDate < today || trip.dDay === null) return { label: '', value: '시작 전' }
    return { label: '출발까지', value: trip.dDay <= 0 ? 'D-day' : `D-${trip.dDay}` }
  }
  if (trip.status === 'ONGOING') return { label: '여행 중', value: `Day ${tripDayIndex(trip, today)}`, suffix: `/ ${trip.days}` }
  return { label: '종료', value: trip.nights > 0 ? `${trip.nights}박 ${trip.days}일` : '당일' }
}

/** 영웅 카드 메타 한 줄 "오사카 · 3박 4일 · 예산 ₩1,200,000"에서 장소 뒤 부분. 시작 전만 기간을 넣는다 */
export function tripMetaRest(trip: Pick<TripInfo, 'status' | 'nights' | 'days' | 'budgetKrw'>): string {
  const budget = `예산 ${formatKrw(trip.budgetKrw)}`
  if (trip.status !== 'UPCOMING') return budget
  const duration = trip.nights > 0 ? `${trip.nights}박 ${trip.days}일` : '당일'
  return `${duration} · ${budget}`
}

/** 영웅 카드 메타 한 줄 전체(화면리더·테스트용 글자) */
export function tripMetaLine(trip: Pick<TripInfo, 'placeLabel' | 'status' | 'nights' | 'days' | 'budgetKrw'>): string {
  return `${trip.placeLabel} · ${tripMetaRest(trip)}`
}
