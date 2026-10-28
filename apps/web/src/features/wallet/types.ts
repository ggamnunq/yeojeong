import type { ConsentId, FxPolicy } from '../../api'

// 지갑·토스 연결·환율 응답 타입(기능명세 6-3 "지갑"·"환율").
// TODO(shared): 서버 2차(S2B-1 payment-methods · S2C fx)가 @yeojeong/shared에 같은 이름으로 넣으면 이 정의를 지우고 re-export로 바꾼다.
// 시각은 ISO 8601 KST 오프셋 문자열, 카드·계좌 번호는 서버가 마스킹한 값만 온다.

export type PaymentMethodType = 'ACCOUNT' | 'CARD'
export type ConnectionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED'
export type AttemptPurpose = 'SIGNUP' | 'WALLET_ADD' | 'RECONNECT'
export type AttemptStatus = 'WAITING' | 'AUTHORIZED' | 'CONFIRMED' | 'FAILED' | 'EXPIRED'
export type SyncStatus = 'OK' | 'FAILED' | 'EXPIRED'

// ── 결제수단 ─────────────────────────────────────────────────────

/** 토스 연결 한 건(토큰 1개 = 결제수단 여러 개) */
export interface PaymentConnectionView {
  id: string
  provider: 'TOSS' | 'DEMO'
  /** EXPIRED면 지갑 맨 위 "토스 연결 만료" + 다시 연결 */
  status: ConnectionStatus
  connectedAt: string
  /** 마지막 성공 동기화. "HH:mm 동기화" */
  lastSyncedAt: string | null
  lastSyncStatus: SyncStatus | null
}

export interface PaymentMethodView {
  id: string
  connectionId: string
  type: PaymentMethodType
  /** "토스뱅크" */
  institutionName: string
  /** "토스뱅크 체크카드" (WF-07·27 제목 줄) */
  productName: string
  /** 결제 상세 줄용 이름 "토스뱅크 체크카드" */
  shortLabel: string
  /** "5365-****-****-1934" */
  maskedNumber: string
  last4: string
  /** EXPIRED면 행을 흐리게 */
  status: 'ACTIVE' | 'EXPIRED'
  lastSyncedAt: string | null
}

/** GET /api/payment-methods (REMOVED 제외, 연결 순) */
export interface PaymentMethodsResponse {
  connections: PaymentConnectionView[]
  methods: PaymentMethodView[]
  /** 연결들의 마지막 성공 동기화 중 가장 최근 */
  lastSyncedAt: string | null
  hasExpiredConnection: boolean
  /** 마이페이지 "계좌 a · 카드 c" */
  counts: { accounts: number; cards: number }
}

/** POST /api/payment-methods/sync (202) */
export interface ManualSyncResponse {
  syncRunIds: string[]
  startedAt: string
}

// ── 토스 연결 ────────────────────────────────────────────────────

/** POST /api/payment-connections */
export interface StartConnectionRequest {
  provider: 'TOSS'
  purpose: AttemptPurpose
  /** RECONNECT일 때 다시 연결할 연결 ID */
  reconnectConnectionId?: string
}

export interface StartConnectionResponse {
  attemptId: string
  /** 새 창으로 연다. "토스 다시 열기"도 같은 주소 */
  authUrl: string
  expiresAt: string
}

/** GET /api/payment-connections/attempts/:attemptId (WF-06 폴링) */
export interface ConnectionAttemptView {
  attemptId: string
  status: AttemptStatus
  purpose: AttemptPurpose
  expiresAt: string
}

/** GET /api/payment-connections/attempts/:attemptId/candidates 의 항목 */
export interface ConnectionCandidate {
  candidateId: string
  type: PaymentMethodType
  institutionName: string
  productName: string
  maskedNumber: string
  last4: string
  /** 처음 체크 상태. 추가는 전부 true, 다시 연결은 기존에 연결했던 것만 true */
  preselected: boolean
}

/** POST /api/payment-connections/attempts/:attemptId/confirm */
export interface ConfirmConnectionRequest {
  candidateIds: string[]
}

/** WF-08 "계좌 n · 카드 m" */
export interface ConfirmConnectionResponse {
  accounts: number
  cards: number
}

// ── 금융정보 연동 동의(WF-05b) ────────────────────────────────────

export const FIN_CONSENT_IDS = ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY'] as const satisfies readonly ConsentId[]
export type FinConsentId = (typeof FIN_CONSENT_IDS)[number]

/** 동의를 받은 화면(UserConsent.screen) */
export type FinConsentScreen = 'WF-05' | 'WF-28' | 'WF-42'

/** GET /api/consents/documents?stage=FIN_LINK 의 항목 */
export interface ConsentDocumentSummary {
  consentId: ConsentId
  title: string
  required: boolean
  version: string
  docUrl: string | null
  hasDetail: boolean
  hidden: boolean
  summary: string | null
}

/** POST /api/consents */
export interface SaveConsentsRequest {
  stage: 'FIN_LINK'
  agreements: { consentId: ConsentId; version: string; agreed: boolean }[]
  method: 'ALL' | 'INDIVIDUAL'
  screen: FinConsentScreen
}

// ── 환율 ─────────────────────────────────────────────────────────

/** 한 통화의 매매기준율 고시 한 건(GET /api/fx?base=JPY) */
export interface FxRateView {
  baseCurrency: 'KRW'
  currency: string
  /** "엔", "달러" */
  currencyNameKo: string
  /** 고시 단위. JPY·IDR·VND = 100, 그 외 1 */
  displayUnit: number
  /** 1단위당 원 "9.192000" */
  rate: string
  /** 고시 단위당 원, 소수 둘째 자리 "919.20"(쉼표 없음) */
  displayRate: string
  /** "100엔 = 919.20원" */
  label: string
  rateType: 'MID'
  /** "하나은행 매매기준율" */
  source: string
  /** 고시 시각. "HH:mm 갱신" */
  effectiveAt: string
  fetchedAt: string
}

/** GET /api/trips/:tripId/fx-policy (WF-29) */
export interface TripFxView {
  baseCurrency: 'KRW'
  tripCurrency: string
  currencyNameKo: string
  displayUnit: number
  /** KRW 여정이면 true(지갑 환율 섹션 숨김) */
  isKrwTrip: boolean
  /** 최신 고시. 없거나 KRW 여정이면 null("—") */
  current: FxRateView | null
  policy: FxPolicy
  /** 고시 단위당 원 "919.20". FIXED가 아니어도 마지막 입력값 */
  fixedRate: string | null
  policyChangedAt: string | null
  /** 그룹장 ∧ 시작 전·진행 중 ∧ 외화 여정 */
  canEdit: boolean
  /** Trip.version. PATCH에 그대로 보낸다 */
  version: number
}

/** PATCH /api/trips/:tripId/fx-policy */
export interface UpdateFxPolicyRequest {
  policy: FxPolicy
  /** FIXED일 때 필수. 고시 단위당 원 "919.20" */
  fixedRate?: string
  version: number
}

export interface UpdateFxPolicyResponse {
  fx: TripFxView
  recalculatedCount: number
}
