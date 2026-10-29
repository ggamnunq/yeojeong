import type { ConsentId } from '../../api'

// 지갑·토스 연결·환율 응답 타입(기능명세 6-3 "지갑"·"환율"). 서버와 같은 @yeojeong/shared에서 가져온다.
// 시각은 ISO 8601 문자열, 카드·계좌 번호는 서버가 마스킹한 값만 온다.

export type {
  AttemptPurpose,
  AttemptStatus,
  ConfirmConnectionRequest,
  ConfirmConnectionResponse,
  ConnectionAttemptView,
  ConnectionCandidate,
  ConnectionStatus,
  ManualSyncResponse,
  ManualSyncSkipReason,
  PaymentConnectionView,
  PaymentMethodsResponse,
  PaymentMethodType,
  PaymentMethodView,
  StartConnectionRequest,
  StartConnectionResponse,
  SyncStatus,
} from '@yeojeong/shared'

// ── 금융정보 연동 동의(WF-05b) ────────────────────────────────────

export const FIN_CONSENT_IDS = ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY'] as const satisfies readonly ConsentId[]
export type FinConsentId = (typeof FIN_CONSENT_IDS)[number]

/** 동의를 받은 화면(UserConsent.screen) */
export type FinConsentScreen = 'WF-05' | 'WF-28' | 'WF-42'

/** GET /api/consents/documents?stage=FIN_LINK 의 항목 */
export type {
  ConsentDocumentSummary,
  ConsentStatusResponse,
  ConsentSubmitRequest as SaveConsentsRequest,
} from '@yeojeong/shared'

// ── 환율 ─────────────────────────────────────────────────────────

export type { FxRateView, FxSpotSeriesResponse, TripFxView, UpdateFxPolicyRequest, UpdateFxPolicyResponse } from '@yeojeong/shared'
