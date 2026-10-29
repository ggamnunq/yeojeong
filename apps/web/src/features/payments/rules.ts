import type { ExpenseListItem, MemberSummary, TripDetail } from '../../api'
import { formatKrw, type AvatarPerson } from '../../ds'
import type { ExpenseRow, PaymentDetail, PaymentsView, SheetCta, SheetDraft, SheetMode } from './types'

// 결제내역·결제 상세의 순수 규칙(화면명세 0-5·0-7·부록 A, 기능명세 4-3). 화면 없이 테스트한다.

// ── 사람 ─────────────────────────────────────────────────────────

/** 서버가 계정이 지워진 멤버(userId NULL)에게 주는 이름(용어집 "탈퇴한 멤버", 서버 WITHDRAWN_NICKNAME) */
export const WITHDRAWN_NICKNAME = '탈퇴한 멤버'

/**
 * 탈퇴한 멤버인가. 응답에 전용 플래그가 아직 없어 isDeleted·userId null(생기면)과 서버 고정 이름으로 본다.
 * TODO(서버): MemberSummary에 isWithdrawn 같은 플래그가 생기면 그 값만 본다.
 */
export function isWithdrawn(m: Pick<MemberSummary, 'nickname' | 'profileImageUrl'>): boolean {
  const extra = m as typeof m & { isDeleted?: boolean; isWithdrawn?: boolean; userId?: string | null }
  return (
    extra.isWithdrawn === true ||
    extra.isDeleted === true ||
    extra.userId === null ||
    (m.nickname === WITHDRAWN_NICKNAME && m.profileImageUrl === null)
  )
}

/**
 * 서버 MemberSummary → DS AvatarPerson. 서버 joinOrder는 1부터, DS 이니셜 색은 0부터.
 * 탈퇴한 멤버 = 회색 기본 아바타 + "탈퇴한 멤버"(흐림·「나간 멤버」 태그 없음), 나간 멤버 = 흐림(left) + 태그는 쓰는 곳이.
 */
export function toPerson(m: MemberSummary): AvatarPerson {
  if (isWithdrawn(m)) return { name: WITHDRAWN_NICKNAME, src: null, source: 'default', joinOrder: m.joinOrder - 1 }
  return { name: m.nickname, src: m.profileImageUrl, joinOrder: m.joinOrder - 1, me: m.isMe, left: m.isLeft }
}

// ── 날짜·시각(KST) ────────────────────────────────────────────────

const KST_OFFSET_MS = 9 * 3_600_000
const DAY_MS = 86_400_000
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
const pad = (n: number) => String(n).padStart(2, '0')

/** ISO 시각(또는 ms) → KST 날짜·시각 조각. 기기 시간대와 상관없이 같다 */
export function kst(at: string | number) {
  const d = new Date((typeof at === 'number' ? at : Date.parse(at)) + KST_OFFSET_MS)
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    monthDay: `${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  }
}

/** "2026-11-13" → "11.13 (금)" */
export function formatDateLabel(localDate: string) {
  const [, m, d] = localDate.split('-')
  const weekday = WEEKDAYS[new Date(`${localDate}T00:00:00Z`).getUTCDay()]
  return `${m}.${d} (${weekday})`
}

/** 두 날짜("YYYY-MM-DD")의 일 수 차이 a − b */
export const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS)

/** 날짜 헤더 오른쪽: "Day 2" · 기간 밖 "여정 전" / "여정 후" */
export function dayLabel(item: Pick<ExpenseListItem, 'dayIndex' | 'periodSide'>) {
  if (item.dayIndex != null) return `Day ${item.dayIndex}`
  return item.periodSide === 'AFTER' ? '여정 후' : '여정 전'
}

/** 진행 중 여정의 오늘 Day(1 ~ days로 맞춤). 진행 중이 아니면 null */
export function todayDay(trip: Pick<TripDetail, 'status' | 'startDate' | 'days'>, now: number) {
  if (trip.status !== 'ONGOING') return null
  const n = diffDays(kst(now).date, trip.startDate) + 1
  return Math.min(Math.max(n, 1), trip.days)
}

/** 타임라인 기본 Day(FR-502): 진행 중 = 오늘, 그 밖 = Day 1 */
export const defaultDay = (trip: Pick<TripDetail, 'status' | 'startDate' | 'days'>, now: number) => todayDay(trip, now) ?? 1

// ── 금액 ─────────────────────────────────────────────────────────

// 원통화 기호·소수 자리(화면명세 0-5, ISO 4217). 표에 없는 통화는 "1,200 MYR"
const CURRENCIES: Record<string, { symbol: string; digits: number }> = {
  JPY: { symbol: '¥', digits: 0 },
  USD: { symbol: '$', digits: 2 },
  EUR: { symbol: '€', digits: 2 },
  GBP: { symbol: '£', digits: 2 },
  CNY: { symbol: 'CN¥', digits: 2 },
  THB: { symbol: '฿', digits: 2 },
  VND: { symbol: '₫', digits: 0 },
  TWD: { symbol: 'NT$', digits: 2 },
  HKD: { symbol: 'HK$', digits: 2 },
  SGD: { symbol: 'S$', digits: 2 },
  AUD: { symbol: 'A$', digits: 2 },
  PHP: { symbol: '₱', digits: 2 },
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 원통화 표기 "¥3,960" · "$12.50" · "1,200 MYR". KRW 결제면 null(원통화 줄을 숨긴다) */
export function formatOriginal(amount: string | number, currency: string): string | null {
  if (currency === 'KRW') return null
  const known = CURRENCIES[currency]
  const value = Math.abs(Number(amount))
  const text = known ? value.toFixed(known.digits) : String(amount).replace(/^-/, '')
  const [int, frac] = text.split('.')
  const body = `${group(int)}${frac ? `.${frac}` : ''}`
  return known ? `${known.symbol}${body}` : `${body} ${currency}`
}

// ── 목록 ─────────────────────────────────────────────────────────

export type DateGroup = {
  localDate: string
  label: string
  day: string
  items: ExpenseRow[]
}

/** 받은 순서 그대로 KST 날짜별로 묶는다(서버가 이미 정렬해서 준다) */
export function groupByDate(items: readonly ExpenseRow[]): DateGroup[] {
  const groups: DateGroup[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last && last.localDate === item.localDate) last.items.push(item)
    else groups.push({ localDate: item.localDate, label: formatDateLabel(item.localDate), day: dayLabel(item), items: [item] })
  }
  return groups
}

/** 리스트·타임라인 보기 기억 키(FR-501, 기기 + 사용자) */
export const viewStorageKey = (userId: string | undefined) => `yj:payView:${userId ?? 'anonymous'}`

export function readStoredView(userId: string | undefined): PaymentsView {
  try {
    return localStorage.getItem(viewStorageKey(userId)) === 'timeline' ? 'timeline' : 'list'
  } catch {
    return 'list'
  }
}

export function storeView(userId: string | undefined, view: PaymentsView) {
  try {
    localStorage.setItem(viewStorageKey(userId), view)
  } catch {
    // 저장소를 못 쓰면 이번 방문 동안만 기억한다
  }
}

// ── 결제 상세 ─────────────────────────────────────────────────────

/**
 * 상세 줄(화면명세 0-5): 결제자 "¥1,280 · 11.13 08:50 · 토스뱅크 체크카드 1934" / 비결제자 "¥2,860 · 11.13 14:10".
 * 결제수단은 서버가 결제자에게만 준다(paymentMethodLabel). KRW면 원통화를 뺀다.
 */
export function detailLine(detail: Pick<PaymentDetail, 'occurredAt' | 'originalAmount' | 'originalCurrency' | 'paymentMethodLabel'>) {
  const at = kst(detail.occurredAt)
  return [formatOriginal(detail.originalAmount, detail.originalCurrency), `${at.monthDay} ${at.time}`, detail.paymentMethodLabel]
    .filter(Boolean)
    .join(' · ')
}

/** 환불 묶음 상세 줄(WF-41): "¥0 · 11.13 (금)" — 원통화 순액(netOriginalAmount) */
export function refundDetailLine(detail: Pick<PaymentDetail, 'localDate' | 'netOriginalAmount' | 'originalCurrency'>) {
  return [formatOriginal(detail.netOriginalAmount, detail.originalCurrency), formatDateLabel(detail.localDate)].filter(Boolean).join(' · ')
}

/** 시트 모드(부록 A). 화면은 서버 permissions로 정한다: TRIP_ENDED → 잠금, NOT_PAYER·PAYER_LEFT → 읽기 전용 */
export function sheetMode(detail: Pick<PaymentDetail, 'status' | 'permissions'>): SheetMode {
  if (detail.permissions.canEdit) {
    if (detail.status === 'PENDING') return 'EDIT_PENDING'
    return detail.status === 'PERSONAL' ? 'EDIT_PERSONAL' : 'EDIT_SHARED'
  }
  return detail.permissions.reason === 'TRIP_ENDED' ? 'LOCKED' : 'READ_ONLY'
}

/**
 * 부담 인원 후보(기능명세 4-3): 서버 participantCandidates. 없으면 활성 멤버 + 이 결제에 이미 들어 있던 나간 멤버(해제만 가능, Q-30).
 * 나 먼저 → 가입 순은 화면이 orderMembers로.
 */
export function participantCandidates(
  trip: Pick<TripDetail, 'members'>,
  detail: Pick<PaymentDetail, 'participants' | 'participantCandidates'>,
): MemberSummary[] {
  if (detail.participantCandidates) return detail.participantCandidates
  const active = trip.members.filter((m) => !m.isLeft)
  const leftInExpense = (detail.participants ?? []).filter((p) => p.isLeft && !active.some((m) => m.membershipId === p.membershipId))
  return [...active, ...leftInExpense]
}

/**
 * 시트를 열었을 때 고른 상태. 선택값은 서버 defaultParticipantMembershipIds(공동 = 지금 부담 인원, 그 밖 = 활성 멤버 전원).
 * 미확정의 기본 세그먼트는 Q-01 추천안대로 공동.
 */
export function initialDraft(
  detail: Pick<PaymentDetail, 'status' | 'participants' | 'defaultParticipantMembershipIds'>,
  activeIds: readonly string[],
): SheetDraft {
  const fallback = detail.status === 'SHARED' ? (detail.participants ?? []).map((p) => p.membershipId) : activeIds
  const selected = [...(detail.defaultParticipantMembershipIds ?? fallback)]
  return { type: detail.status === 'PERSONAL' ? 'personal' : 'shared', selected }
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * 시트 하단 버튼(WF-20·21·31·35·36). 공동은 결제자 외 최소 1명(Q-08 확정) — 결제자만 남거나 아무도 없으면 비활성.
 * 결제자를 빼고 다른 사람만 고르는 것은 된다. 개인 결제에서 [개인]을 고른 상태면 버튼이 없다.
 */
export function sheetCta(
  mode: SheetMode,
  draft: SheetDraft,
  detail: Pick<PaymentDetail, 'participants' | 'payer'>,
): SheetCta | null {
  const sharedInvalid = !draft.selected.some((id) => id !== detail.payer.membershipId)
  switch (mode) {
    case 'EDIT_PENDING':
      return draft.type === 'personal'
        ? { action: 'CONFIRM_PERSONAL', label: '개인으로 확정', disabled: false }
        : { action: 'CONFIRM_SHARED', label: '공동으로 확정', disabled: sharedInvalid }
    case 'EDIT_PERSONAL':
      return draft.type === 'personal' ? null : { action: 'TO_SHARED', label: '공동으로 변경', disabled: sharedInvalid }
    case 'EDIT_SHARED': {
      if (draft.type === 'personal') return { action: 'TO_PERSONAL', label: '개인으로 변경', disabled: false }
      const saved = (detail.participants ?? []).map((p) => p.membershipId)
      return { action: 'SAVE_PARTICIPANTS', label: '저장', disabled: sharedInvalid || sameSet(draft.selected, saved) }
    }
    default:
      return null
  }
}

/** 저장 성공 토스트(화면명세 0-9 제안 문구) */
export const SUCCESS_TOAST = {
  CONFIRM_PERSONAL: '개인으로 확정했어요',
  CONFIRM_SHARED: '공동으로 확정했어요',
  TO_PERSONAL: '개인 결제로 바꿨어요',
  TO_SHARED: '공동 결제로 바꿨어요',
  SAVE_PARTICIPANTS: '저장했어요',
} as const

/**
 * 원 단위 나머지를 지는 사람 표기. 결제자가 부담 인원에 있으면 DS 기본("결제자 +N원")을 쓰고(undefined),
 * 없으면 부담 인원 중 가입 순 첫 사람(Q-08 추천)의 이름으로 "민지 +2원".
 */
export function remainderLabel(
  remainder: number,
  selected: readonly MemberSummary[],
  payerId: string,
): string | undefined {
  if (remainder <= 0 || selected.some((m) => m.membershipId === payerId)) return undefined
  const holder = [...selected].sort((a, b) => a.joinOrder - b.joinOrder)[0]
  if (!holder) return undefined
  return `${holder.isMe ? '나' : holder.nickname} +${remainder}원`
}

/** "1인 ₩6,435" */
export const perPersonText = (perPerson: number) => `1인 ${formatKrw(perPerson)}`
