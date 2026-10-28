// 결제 응답·요청 타입은 서버와 같은 @yeojeong/shared(`api/expenses.ts`)에서 가져온다. 아래는 화면 전용 타입.
export type {
  AddOutOfPeriodExpensesResponse as OutOfPeriodAddResponse,
  ClassifyExpenseRequest as ClassificationInput,
  ExpenseDetailResponse as PaymentDetail,
  ExpenseListPeriod,
  ExpenseListResponse as ExpensesPage,
  ExpensePermissions,
  ExpenseRefundLine,
  ExpenseRow,
  OutOfPeriodCandidate,
  OutOfPeriodSide,
} from '@yeojeong/shared'

/** 결제내역 보기(WF-18 리스트 · WF-19 타임라인) */
export type PaymentsView = 'list' | 'timeline'

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
