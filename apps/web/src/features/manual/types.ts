import type { Me, WalletEntryListResponse } from '@yeojeong/shared'
import type { PaymentDetail } from '../payments/types'

// 수동 결제(직접 입력) API 타입 — 서버 S7(#46) 계약(@yeojeong/shared api/wallet.ts · api/expenses.ts) 그대로.

export {
  MANUAL_AMOUNT_MAX_INTEGER_DIGITS,
  MANUAL_DEFAULT_MERCHANT_NAME,
  MANUAL_KRW_AMOUNT_MAX,
  MANUAL_MEMO_MAX_LENGTH,
  MANUAL_OCCURRED_AT_FUTURE_SECONDS,
  MANUAL_OCCURRED_AT_PAST_DAYS,
  WALLET_ENTRY_FIELD_VALUES,
} from '@yeojeong/shared'

export type {
  CreateTripExpenseRequest,
  CreateWalletEntryRequest,
  UpdateTripExpenseRequest,
  UpdateWalletEntryRequest,
  WalletEntry,
  WalletEntryField,
  WalletEntryListResponse,
  WalletEntryMutationResponse,
  WalletLinkedTrip,
  WalletTripCandidate,
  WalletTripCandidatesResponse,
} from '@yeojeong/shared'

/**
 * GET /api/wallet/entries 응답 + 서버 S7b에서 더할 "이번 달" 합계(shared 타입 전이라 선택 필드).
 * 없으면 화면은 영웅 숫자를 숨긴다(클라이언트에서 페이지를 더하지 않는다)
 */
export type WalletEntriesPage = WalletEntryListResponse & {
  /** KST 이번 달 지갑 항목 원화 합 */
  monthTotalKrw?: number
  /** 합계에 추정(연결 없는 외화의 최신 고시 환산 등)이 섞였는지 — "약" 접두 */
  monthTotalEstimated?: boolean
}

/** GET /api/users/me + 서버 S7b의 지갑 항목 수(선택 필드). 없으면 HF-30은 "내 지갑 ›"만 */
export type MeWithWallet = Me & { walletEntryCount?: number }

/** 수동 결제 상세 = 결제 상세(S7: createdByMembershipId · permissions.isAuthor · walletEntryId 포함) */
export type ManualPaymentDetail = PaymentDetail
