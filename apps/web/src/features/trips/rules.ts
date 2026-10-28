import type { TripStatus } from '../../api'
import { formatKrw } from '../../ds'
import type {
  PlaceInput,
  TripEditableField,
  TripFormValues,
  TripInfo,
  TripPermissions,
  UpdateTripRequest,
} from './types'

// 여정 생성·참여·여정 정보의 순수 규칙(기능명세 4-7·4-8, FR-201~209·301~304). 화면 없이 테스트한다.
// 날짜는 KST 달력 날짜 문자열("2026-11-12")로만 다룬다.

// ── 상수(S2A shared api/trips.ts와 같은 값) ────────────────────────

export const GROUP_NAME_MAX_LENGTH = 20
/** 시작일·종료일 포함 최대 일수(미결 Q-29 추천안) */
export const TRIP_MAX_DAYS = 31
/** 시작일은 오늘로부터 며칠 전까지(미결 Q-29 추천안) */
export const TRIP_START_PAST_LIMIT_DAYS = 30
export const TRIP_BUDGET_MAX_KRW = 1_000_000_000
export const INVITE_CODE_LENGTH = 6
/** 헷갈리는 0·O·1·I·L을 뺀 문자 집합 */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** 단계별로 그룹장이 고칠 수 있는 항목(FR-302, 미결 Q-14 추천안). 진행 중 종료일은 오늘 이후로만 */
export const TRIP_EDITABLE_FIELDS: Readonly<Record<TripStatus, readonly TripEditableField[]>> = {
  UPCOMING: ['groupName', 'place', 'startDate', 'endDate', 'budgetKrw'],
  ONGOING: ['groupName', 'budgetKrw', 'endDate'],
  ENDED: [],
}

export const COPY = {
  copied: '복사했어요',
  saved: '저장했어요',
  changedElsewhere: '다른 곳에서 바뀌었어요',
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

// ── 초대코드 ──────────────────────────────────────────────────────

const INVITE_CODE = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`)

/** 입력값 → 코드 글자(대문자·영숫자만, 6자까지). 하이픈·공백·기호는 버린다 */
export function inviteInputChars(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, INVITE_CODE_LENGTH)
}

/** 저장 형식 코드 또는 null(형식이 틀림). 대소문자·하이픈·공백 무시 */
export function normalizeInviteCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase()
  return INVITE_CODE.test(code) ? code : null
}

/** 표시용 3-3: K7M2QX → K7M-2QX. 입력 중이면 4번째 글자부터 하이픈을 넣는다 */
export function formatInviteCode(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code
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

export const EMPTY_TRIP_FORM: TripFormValues = { groupName: '', place: null, startDate: '', endDate: '', budget: '' }

export function formValuesOf(trip: TripInfo): TripFormValues {
  return {
    groupName: trip.groupName,
    place: { countryCode: trip.countryCode, city: trip.city ?? null, label: trip.placeLabel },
    startDate: trip.startDate,
    endDate: trip.endDate,
    budget: String(trip.budgetKrw),
  }
}

/** 이 모드에서 고칠 수 있는 항목. 만들기는 전부 */
export function editableFieldsOf(mode: TripFormMode): readonly TripEditableField[] {
  return mode.kind === 'create' ? TRIP_EDITABLE_FIELDS.UPCOMING : TRIP_EDITABLE_FIELDS[mode.status]
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

/** 네 항목이 모두 유효한가(FR-201 버튼 조건) */
export function isTripFormValid(values: TripFormValues, mode: TripFormMode, today: string) {
  const budget = Number(values.budget)
  return (
    isGroupNameValid(values.groupName) &&
    values.place !== null &&
    Boolean(values.startDate && values.endDate) &&
    periodError(values, mode, today) === null &&
    budget >= 1 &&
    budget <= TRIP_BUDGET_MAX_KRW
  )
}

const samePlace = (a: PlaceInput | null, b: PlaceInput | null) =>
  a?.countryCode === b?.countryCode && (a?.city ?? null) === (b?.city ?? null) && a?.label === b?.label

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
  if (can('place') && values.place && !samePlace(initial.place, values.place)) body.place = values.place
  if (can('startDate') && values.startDate !== initial.startDate) body.startDate = values.startDate
  if (can('endDate') && values.endDate !== initial.endDate) body.endDate = values.endDate
  if (can('budgetKrw') && values.budget !== initial.budget) body.budgetKrw = Number(values.budget)
  return Object.keys(body).length > 1 ? body : null
}

// ── 여정 정보 ─────────────────────────────────────────────────────

/**
 * 버튼 노출 권한. 서버가 permissions를 주면 그대로 쓰고, 없으면(부록 B 응답·현재 목) 같은 규칙으로 계산한다.
 * 그룹장만 수정·시작·종료·삭제(spec README §5), 단계별 가능 여부는 기능명세 4-8.
 */
export function tripPermissions(trip: TripInfo, today: string): TripPermissions {
  if (trip.permissions) return trip.permissions
  const leader = trip.me.role === 'LEADER'
  const editableFields = leader ? [...TRIP_EDITABLE_FIELDS[trip.status]] : []
  const open = trip.status !== 'ENDED'
  return {
    canEdit: editableFields.length > 0,
    editableFields,
    canStart: leader && trip.status === 'UPCOMING' && trip.endDate >= today,
    canEnd: leader && trip.status === 'ONGOING',
    canDeleteGroup: leader && trip.status === 'UPCOMING',
    canKick: leader && open,
    canInvite: open && trip.inviteCode !== null,
    canLeave: true,
    canChangeFx: leader && open,
  }
}

/** 진행 중 오늘이 몇째 날인지(1 ~ days). 서버 todayDayIndex가 먼저 */
export function tripDayIndex(trip: TripInfo, today: string): number {
  const fromServer = trip.todayDayIndex
  const day = fromServer ?? daysBetween(trip.startDate, today) + 1
  return Math.min(trip.days, Math.max(1, day))
}

export type TripHero = { label: string; value: string; suffix?: string }

/** 영웅 카드 글자: 시작 전 "출발까지 D-15"(당일 D-day, 시작일 지남 "시작 전") · 진행 중 "여행 중 Day 2 / 4" · 종료 "종료 3박 4일" */
export function tripHero(trip: TripInfo, today: string): TripHero {
  if (trip.status === 'UPCOMING') {
    if (trip.startDate < today) return { label: '', value: '시작 전' }
    const dDay = trip.dDay ?? daysBetween(today, trip.startDate)
    return { label: '출발까지', value: dDay <= 0 ? 'D-day' : `D-${dDay}` }
  }
  if (trip.status === 'ONGOING') return { label: '여행 중', value: `Day ${tripDayIndex(trip, today)}`, suffix: `/ ${trip.days}` }
  return { label: '종료', value: trip.nights > 0 ? `${trip.nights}박 ${trip.days}일` : '당일' }
}

/** 영웅 카드 메타 한 줄 "일본 오사카 · 예산 ₩1,200,000" */
export function tripMetaLine(trip: Pick<TripInfo, 'placeLabel' | 'budgetKrw'>): string {
  return `${trip.placeLabel} · 예산 ${formatKrw(trip.budgetKrw)}`
}
