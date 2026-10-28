import type { ExpenseDetail, ExpenseListItem, ExpenseStatus } from '../../api'

// 결제 플로우 전용 타입(기능명세 6-3). 서버 1차가 @yeojeong/shared에 넣으면 그쪽으로 옮긴다.

/** 결제내역 보기(WF-18 리스트 · WF-19 타임라인) */
export type PaymentsView = 'list' | 'timeline'

/** 기간 외 결제 후보 쪽(WF-43) */
export type PeriodSide = 'BEFORE' | 'AFTER'

/** PUT /api/trips/:tripId/expenses/:expenseId/classification */
export type ClassificationInput = {
  status: Exclude<ExpenseStatus, 'PENDING'>
  participantMembershipIds?: string[]
  version: number
}

/** GET /api/trips/:tripId/out-of-period-candidates?side= 의 항목. 날짜 오름차순 */
export type OutOfPeriodCandidate = {
  candidateId: string
  occurredAt: string
  merchantName: string
  krwAmount: number
  originalAmount: string
  currency: string
  paymentMethodLabel: string | null
}

/** POST /api/trips/:tripId/out-of-period-expenses → 201 */
export type OutOfPeriodAddResponse = {
  added: number
  items: ExpenseListItem[]
}

/** 결제 상세. 서버 shared 타입에는 나머지를 지는 사람(remainderHolderMembershipId)이 더 있다 */
export type PaymentDetail = ExpenseDetail & { remainderHolderMembershipId?: string | null }

/**
 * 결제 상세 시트 모드(화면명세 부록 A). 환불 묶음(REFUND_GROUP)은 refunds가 있을 때 아래 모드 위에 겹쳐 그린다.
 * - EDIT_*: 결제자 · 진행 중 · 결제자 활성
 * - READ_ONLY: 결제자가 아닌 멤버의 공동 결제, 결제자가 나간 공동 결제
 * - LOCKED: 여정 종료(누구든)
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
