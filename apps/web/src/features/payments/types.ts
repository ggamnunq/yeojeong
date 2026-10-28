import type { EditBlockReason, ExpenseDetail, ExpenseListItem, MemberSummary, TripStatus } from '../../api'

// 결제 플로우 전용 타입. 서버 S2B-2(`packages/shared/src/api/expenses.ts`)와 같은 모양이다.
// TODO(shared): 그 파일이 main에 들어오면 이 정의를 지우고 `@yeojeong/shared`에서 가져온다.

/** 결제내역 보기(WF-18 리스트 · WF-19 타임라인) */
export type PaymentsView = 'list' | 'timeline'

/** 기간 외 결제 후보 쪽(WF-43) */
export type OutOfPeriodSide = 'BEFORE' | 'AFTER'

/** 환불 묶음의 취소 줄(FR-406). 시각 오름차순 */
export interface ExpenseRefundLine {
  id: string
  occurredAt: string
  /** 음수 */
  krwAmount: number
  /** 음수 문자열 decimal */
  originalAmount: string
}

/** 결제 목록 행 = ExpenseListItem + 환불 묶음 표시용 필드 */
export interface ExpenseRow extends ExpenseListItem {
  /** 환불 전 원 결제 원화(묶음의 원 결제 줄). 환불이 없으면 krwAmount와 같다 */
  grossKrwAmount: number
  /** 환불 반영 원통화 순액(0 이상). WF-41 부제 "¥0" */
  netOriginalAmount: string
  refunds: ExpenseRefundLine[]
}

/** 날짜 헤더·타임라인 Day 칩에 쓰는 여정 기간 정보 */
export interface ExpenseListPeriod {
  tripStatus: TripStatus
  startDate: string
  endDate: string
  /** 여정 일수(Day 칩 개수) */
  days: number
  /** 오늘(KST)의 Day. 기간 밖이면 null */
  todayDayIndex: number | null
}

/** GET /api/trips/:tripId/expenses */
export interface ExpensesPage {
  items: ExpenseRow[]
  nextCursor: string | null
  /** 확인 필요 n건 = 내 미확정 수. 종료 후 0 */
  pendingCount: number
  /** 진행 중이면 목록 맨 아래 "기간 외 결제 추가 ›" */
  showOutOfPeriodEntry: boolean
  period: ExpenseListPeriod
}

export interface ExpensePermissions {
  canEdit: boolean
  /** 우선순위 TRIP_ENDED > TRIP_NOT_STARTED > PAYER_LEFT > NOT_PAYER */
  reason: EditBlockReason | null
  isPayer: boolean
}

/** GET /api/trips/:tripId/expenses/:expenseId 와 분류·중복 해제 응답(ExpenseDetailResponse) */
export interface PaymentDetail extends Omit<ExpenseDetail, 'permissions' | 'refunds'> {
  netOriginalAmount: string
  refunds: ExpenseRefundLine[]
  permissions: ExpensePermissions
  remainderHolderMembershipId: string | null
  /** 부담 인원 토글 후보(canEdit일 때만). 나 → 가입 순, 지금 부담 인원의 나간 멤버 포함(해제만, Q-30) */
  participantCandidates: MemberSummary[] | null
  /** 토글 처음 선택값(canEdit일 때만). SHARED = 지금 부담 인원, 그 밖 = 활성 멤버 전원 */
  defaultParticipantMembershipIds: string[] | null
}

/** PUT /api/trips/:tripId/expenses/:expenseId/classification */
export type ClassificationInput = {
  status: 'PERSONAL' | 'SHARED'
  participantMembershipIds?: string[]
  version: number
  /** 공동 → 개인은 확인 다이얼로그(WF-32) 뒤에 true */
  confirmSharedToPersonal?: boolean
}

/** GET /api/trips/:tripId/out-of-period-candidates?side= 의 항목. 날짜 오름차순 배열 */
export interface OutOfPeriodCandidate {
  candidateId: string
  occurredAt: string
  localDate: string
  merchantName: string
  /** 여정 환율 정책으로 환산한 원화. 환율을 아직 알 수 없으면 null */
  krwAmount: number | null
  originalAmount: string
  currency: string
  paymentMethodLabel: string | null
}

/** POST /api/trips/:tripId/out-of-period-expenses → 201 */
export interface OutOfPeriodAddResponse {
  added: number
  items: ExpenseRow[]
}

/**
 * 결제 상세 시트 모드(화면명세 부록 A). 환불 묶음(REFUND_GROUP)은 refunds가 있을 때 아래 모드 위에 겹쳐 그린다.
 * - EDIT_*: 결제자 · 진행 중 · 결제자 활성
 * - READ_ONLY: 결제자가 아닌 멤버(NOT_PAYER) · 결제자가 나간 결제(PAYER_LEFT)
 * - LOCKED: 여정 종료(TRIP_ENDED, 누구든)
 */
export type SheetMode = 'EDIT_PENDING' | 'EDIT_PERSONAL' | 'EDIT_SHARED' | 'READ_ONLY' | 'LOCKED'

/** 시트에서 고르고 있는 분류(저장 전) */
export type SheetDraft = {
  type: 'personal' | 'shared'
  /** 부담 인원 membershipId */
  selected: readonly string[]
}

/** 시트 하단 버튼이 하는 일 */
export type SheetAction = 'CONFIRM_PERSONAL' | 'CONFIRM_SHARED' | 'TO_PERSONAL' | 'TO_SHARED' | 'SAVE_PARTICIPANTS'

export type SheetCta = { action: SheetAction; label: string; disabled: boolean }
