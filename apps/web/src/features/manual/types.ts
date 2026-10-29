import type { PaymentDetail } from '../payments/types'

// 수동 결제(직접 입력) API 타입 — 서버 S7(#46) · S7b(#49) 계약(@yeojeong/shared api/wallet.ts · api/expenses.ts) 그대로.
// 지갑 목록의 "이번 달" 합계(monthTotalKrw · monthTotalEstimated)와 Me.walletEntryCount는 shared 타입에 들어 있다.

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

/** 수동 결제 상세 = 결제 상세(S7: createdByMembershipId · permissions.isAuthor · walletEntryId 포함) */
export type ManualPaymentDetail = PaymentDetail
