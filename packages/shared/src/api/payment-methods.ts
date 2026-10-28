import type {
  AttemptPurpose,
  AttemptStatus,
  ConnectionStatus,
  PaymentMethodStatus,
  PaymentMethodType,
  Provider,
  SyncStatus,
} from '../domain.js';

// 결제수단·토스 연결·동기화 API 타입(기능명세 6-3 "지갑", FR-801~804·402·408).
// 시각은 ISO 8601 문자열, 원화는 정수, 원통화 금액은 문자열 decimal.
// 카드·계좌 번호는 마스킹한 값(maskedNumber, last4)만 오간다.

/** 토스 연결 한 건(토큰 1개 = 결제수단 여러 개) */
export interface PaymentConnectionView {
  id: string;
  provider: Provider;
  /** EXPIRED면 지갑 상단 "토스 연결 만료" + 다시 연결 */
  status: ConnectionStatus;
  connectedAt: string;
  /** 마지막 성공 동기화. 지갑 "HH:mm 동기화" */
  lastSyncedAt: string | null;
  lastSyncStatus: SyncStatus | null;
}

export interface PaymentMethodView {
  id: string;
  connectionId: string;
  type: PaymentMethodType;
  /** "토스뱅크" */
  institutionName: string;
  /** "토스뱅크 체크카드" (WF-07·27 제목 줄) */
  productName: string;
  /** 결제 상세 줄용 이름. 표시 = "{shortLabel} {last4}" */
  shortLabel: string;
  /** "5365-****-****-1934" */
  maskedNumber: string;
  last4: string;
  /** EXPIRED면 행을 흐리게 */
  status: Exclude<PaymentMethodStatus, 'REMOVED'>;
  lastSyncedAt: string | null;
}

/** GET /api/payment-methods (REMOVED 제외) */
export interface PaymentMethodsResponse {
  connections: PaymentConnectionView[];
  methods: PaymentMethodView[];
  /** 연결들의 마지막 성공 동기화 중 가장 최근 */
  lastSyncedAt: string | null;
  hasExpiredConnection: boolean;
  /** 마이페이지 "내 지갑 · 계좌 a · 카드 c" */
  counts: { accounts: number; cards: number };
}

/** POST /api/payment-connections */
export interface StartConnectionRequest {
  provider: 'TOSS';
  purpose: AttemptPurpose;
  /** purpose = RECONNECT일 때 다시 연결할 연결 ID */
  reconnectConnectionId?: string;
}

export interface StartConnectionResponse {
  attemptId: string;
  /** 새 창으로 연다. "토스 다시 열기"도 같은 주소 */
  authUrl: string;
  expiresAt: string;
}

/** GET /api/payment-connections/attempts/:attemptId (WF-06 폴링) */
export interface ConnectionAttemptView {
  attemptId: string;
  status: AttemptStatus;
  purpose: AttemptPurpose;
  expiresAt: string;
}

/** GET /api/payment-connections/attempts/:attemptId/candidates 의 항목 */
export interface ConnectionCandidate {
  candidateId: string;
  type: PaymentMethodType;
  institutionName: string;
  productName: string;
  maskedNumber: string;
  last4: string;
  /** 처음 화면의 체크 상태. 지갑 추가는 전부 true, 다시 연결은 기존에 연결했던 것만 true */
  preselected: boolean;
}

/** POST /api/payment-connections/attempts/:attemptId/confirm */
export interface ConfirmConnectionRequest {
  candidateIds: string[];
}

/** WF-08 "계좌 n · 카드 m" */
export interface ConfirmConnectionResponse {
  accounts: number;
  cards: number;
}

/** POST /api/payment-methods/sync (202) */
export interface ManualSyncResponse {
  syncRunIds: string[];
  startedAt: string;
}

/** POST /api/internal/jobs/sync (Cloud Scheduler) */
export interface SyncJobResult {
  /** 동기화 대상 연결 수(진행 중 여정이 있는 사용자의 ACTIVE 연결) */
  connections: number;
  ok: number;
  failed: number;
  expired: number;
  /** 다른 동기화가 돌고 있거나 대상 여정이 없어 건너뜀 */
  skipped: number;
  fetched: number;
  imported: number;
  /** 10분이 지나 만료 처리한 연결 시도 수 */
  expiredAttempts: number;
}

export type OutOfPeriodSide = 'BEFORE' | 'AFTER';

/** 기간 외 결제 후보(FR-408, WF-43). 응답으로만 쓰고 고른 건만 Transaction으로 저장한다 */
export interface OutOfPeriodCandidate {
  candidateId: string;
  occurredAt: string;
  merchantName: string;
  /** 여정 환율 정책으로 계산한 원화. 계산할 수 없으면 null */
  krwAmount: number | null;
  originalAmount: string;
  currency: string;
  /** "토스뱅크 체크카드 1934" (본인에게만) */
  paymentMethodLabel: string;
}
