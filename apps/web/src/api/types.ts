// 응답 DTO 임시 타입(기능명세 부록 B · 6-3).
// TODO(shared): 서버 1차가 @yeojeong/shared에 같은 이름으로 넣으면 이 파일의 정의를 지우고 re-export로 바꾼다.

export type TripStatus = 'UPCOMING' | 'ONGOING' | 'ENDED'
export type ExpenseStatus = 'PENDING' | 'PERSONAL' | 'SHARED'
export type ExpenseOrigin = 'AUTO' | 'OUT_OF_PERIOD'
export type FxPolicy = 'SPOT_AT_PAYMENT' | 'CARD_BILLED' | 'FIXED'
export type MemberRole = 'LEADER' | 'MEMBER'
export type BudgetState = 'NORMAL' | 'CAUTION' | 'OVER'
export type EditBlockReason = 'NOT_PAYER' | 'TRIP_ENDED' | 'TRIP_NOT_STARTED' | 'PAYER_LEFT'
export type ConsentId = 'TOS' | 'PRIVACY' | 'AGE14' | 'MARKETING' | 'FIN_LINK' | 'FIN_PRIVACY' | 'THIRD_PARTY'
export type ConsentStage = 'SIGNUP' | 'FIN_LINK'
export type TripEventType = 'LEADER_CHANGED' | 'FX_POLICY_CHANGED'

// ── 인증·사용자 ────────────────────────────────────────────────

export type SessionStatus = 'AUTHENTICATED' | 'SIGNUP_REQUIRED' | 'ANONYMOUS'

export interface Me {
  id: string
  nickname: string
  profileImageUrl: string | null
  paymentMethodCount: number
  hasExpiredConnection: boolean
}

/** GET /api/auth/session */
export interface SessionResponse {
  status: SessionStatus
  user?: Me
  signupDraft?: { kakaoNickname: string | null; profileImageUrl: string | null }
}

// ── 여정·그룹 ──────────────────────────────────────────────────

export interface Profile {
  nickname: string
  profileImageUrl: string | null
}

export interface MemberSummary extends Profile {
  membershipId: string
  role: MemberRole
  joinOrder: number
  isMe: boolean
  isLeft: boolean
}

export interface TripListItem {
  tripId: string
  groupId: string
  groupName: string
  status: TripStatus
  /** "2026-11-12" */
  startDate: string
  endDate: string
  memberCount: number
  isLeader: boolean
}

/** GET /api/me/trips */
export interface MyTripsResponse {
  lastViewedTripId: string | null
  items: TripListItem[]
}

export interface TripEvent {
  id: string
  type: TripEventType
  payload: Record<string, unknown>
}

/** GET /api/trips/:tripId */
export interface TripDetail extends TripListItem {
  placeLabel: string
  countryCode: string
  currency: string
  budgetKrw: number
  nights: number
  days: number
  dDay: number | null
  autoEndAt: string
  /** 종료 후 null */
  inviteCode: string | null
  me: { membershipId: string; role: MemberRole; pendingCount: number; connectionExpired: boolean }
  /** 활성 멤버, 가입 순 */
  members: MemberSummary[]
  /** KRW 여정이면 null */
  fx: { policy: FxPolicy; tripCurrency: string } | null
  unseenEvents: TripEvent[]
  version: number
}

// ── 결제 ───────────────────────────────────────────────────────

export interface ExpenseRefund {
  id: string
  occurredAt: string
  krwAmount: number
}

export interface ExpenseListItem {
  id: string
  /** ISO 8601 KST 오프셋 "2026-11-13T08:50:00+09:00" */
  occurredAt: string
  localDate: string
  dayIndex: number | null
  periodSide: 'BEFORE' | 'AFTER' | null
  merchantName: string
  payer: MemberSummary
  status: ExpenseStatus
  /** 순액(환불 반영) */
  krwAmount: number
  /** 문자열 decimal "13200" · "12.50" */
  originalAmount: string
  originalCurrency: string
  /** SHARED만. 정렬: 나 → 가입 순 */
  participants: MemberSummary[] | null
  flags: { changed: boolean; duplicateSuspected: boolean; hasRefund: boolean }
  refunds: ExpenseRefund[]
  origin: ExpenseOrigin
  version: number
}

/** GET /api/trips/:tripId/expenses */
export interface ExpenseListResponse {
  items: ExpenseListItem[]
  nextCursor: string | null
  pendingCount: number
  showOutOfPeriodEntry: boolean
}

export interface ExpenseDetail extends ExpenseListItem {
  /** 환불 전 원 결제 원화 */
  grossKrwAmount: number
  /** "토스뱅크 체크카드 1934". 결제자에게만 */
  paymentMethodLabel: string | null
  fx: { rate: string; displayUnit: number; source: string; rateAt: string; policy: FxPolicy } | null
  shares: { membershipId: string; amountKrw: number; isRemainderHolder: boolean }[]
  perPersonKrw: number | null
  remainderKrw: number
  permissions: { canEdit: boolean; reason: EditBlockReason | null }
  duplicate: { groupId: string; canDismiss: boolean } | null
}
