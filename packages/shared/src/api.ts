import type {
  ConsentId,
  ConsentMethod,
  ConsentRequirement,
  ConsentScreen,
  ConsentStage,
} from './consents.js';
import type {
  EditBlockReason,
  ExpenseOrigin,
  ExpenseStatus,
  FxPolicy,
  MemberRole,
  TripEventType,
  TripStatus,
} from './domain.js';

// API 응답 타입(기능명세 6-3, 부록 B). 날짜는 "2026-11-12", 시각은 ISO 8601 문자열, 원화는 정수, 원통화는 문자열 decimal.

/** 아바타에 필요한 최소 정보. profileImageUrl이 null이면 화면은 기본 이미지를 쓴다(FR-105) */
export interface Profile {
  nickname: string;
  profileImageUrl: string | null;
}

export interface MemberSummary extends Profile {
  membershipId: string;
  role: MemberRole;
  joinOrder: number;
  isMe: boolean;
  isLeft: boolean;
  /** 탈퇴(LeaveReason ACCOUNT_DELETED, userId NULL)한 멤버. nickname은 "탈퇴한 멤버", 프사는 null */
  isWithdrawn: boolean;
}

/** GET /api/users/me */
export interface Me extends Profile {
  id: string;
  /** profileImageUrl이 없으면 false → 기본 이미지 */
  hasProfileImage: boolean;
  /** 연결 해제(REMOVED)되지 않은 결제수단 수 */
  paymentMethodCount: number;
  hasExpiredConnection: boolean;
  /**
   * 지갑 항목 수(S7b, Q-51) = GET /api/wallet/entries에 보이는 항목 전체(직접 입력 + 가져온 거래, 지운 항목·계좌·카드 중복 제외).
   * 서버는 항상 채운다(전환 기간 웹 목 호환을 위해 선택 필드)
   */
  walletEntryCount?: number;
}

export type AuthStatus = 'ANONYMOUS' | 'SIGNUP_REQUIRED' | 'AUTHENTICATED';

/** 가입 대기(카카오 인증만 끝난 상태)에서 닉네임 화면을 미리 채우는 값 */
export interface SignupDraft {
  kakaoNickname: string | null;
  profileImageUrl: string | null;
  /**
   * 로그인 시작(`/api/auth/kakao/start?returnTo=`) 때 받은 돌아갈 화면 경로(같은 origin의 상대 경로만, 예: `/join?code=K7M2QX`).
   * 가입을 마친 뒤 이리로 보낸다. 없으면 null. 서버는 항상 채운다(전환 기간 웹 목 호환을 위해 선택 필드)
   */
  returnTo?: string | null;
}

/** POST /api/auth/signup 응답(FR-103·104). 가입을 마친 뒤 갈 화면은 returnTo(없으면 null → 진입 라우팅) */
export interface SignupResponse extends Me {
  returnTo: string | null;
}

/** GET /api/auth/session (FR-102) */
export interface AuthSessionResponse {
  status: AuthStatus;
  user?: Me;
  signupDraft?: SignupDraft;
  /** AUTHENTICATED일 때만. 비어 있지 않으면 재동의 화면(FR-107)으로 보낸다 */
  reconsentRequired?: ConsentRequirement[];
  /** 기능 플래그(env). 로그인 여부와 무관하게 서버는 항상 채운다(전환 기간 웹 목 호환을 위해 선택 필드) */
  features?: FeatureFlags;
}

/** GET /api/auth/session의 기능 플래그 */
export interface FeatureFlags {
  /**
   * 계좌·카드 자동 불러오기(토스 연결). false면 화면이 연결 진입점(가입 후 연결, 지갑 추가, 재연결)을 숨긴다.
   * 연결 API 자체는 그대로 동작한다(env FEATURE_ACCOUNT_LINK, 기본 false)
   */
  accountLink: boolean;
}

/** GET /api/consents/documents */
export interface ConsentDocumentSummary {
  consentId: ConsentId;
  title: string;
  required: boolean;
  version: string;
  docUrl: string | null;
  hasDetail: boolean;
  hidden: boolean;
  /** 재동의 화면 제목 아래 한 줄 */
  summary: string | null;
  /** 시행 전 초안. 정식본이 나오면 다시 동의받는다 */
  isDraft: boolean;
}

/** 동의 한 항목(화면이 보여 준 문서 버전과 함께 보낸다) */
export interface ConsentAgreementInput {
  consentId: ConsentId;
  version: string;
  agreed: boolean;
}

/** POST /api/auth/signup (FR-103·104). 서버가 ip·ua·docHash·screen(WF-04)을 채운다 */
export interface SignupRequest {
  nickname: string;
  agreements: ConsentAgreementInput[];
  method: Extract<ConsentMethod, 'ALL' | 'INDIVIDUAL'>;
}

/** POST /api/auth/reconsent (FR-107) */
export interface ReconsentRequest {
  agreements: ConsentAgreementInput[];
  method: Extract<ConsentMethod, 'ALL' | 'INDIVIDUAL'>;
}

/** POST /api/consents (FR-809, 결제수단 연결 전 동의 시트) */
export interface ConsentSubmitRequest {
  stage: Extract<ConsentStage, 'FIN_LINK'>;
  agreements: ConsentAgreementInput[];
  method: Extract<ConsentMethod, 'ALL' | 'INDIVIDUAL'>;
  screen: Extract<ConsentScreen, 'WF-05' | 'WF-28' | 'WF-42'>;
}

/** GET /api/consents/status, POST /api/consents */
export interface ConsentStatusResponse {
  valid: boolean;
  missing: ConsentId[];
  required: ConsentRequirement[];
}

/** POST /api/users/me/deletion-request (FR-108). 메일은 화면이 mailto로 연다(서버는 보내지 않는다) */
export interface DeletionRequestResponse {
  /** YJD-XXXX-XXXX-XXXX. 본인 확인 수단이라 화면 밖에 남기지 않는다 */
  code: string;
  expiresAt: string;
  mail: { to: string; subject: string; body: string };
  mailto: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TripListItem {
  tripId: string;
  groupId: string;
  groupName: string;
  status: TripStatus;
  startDate: string;
  endDate: string;
  memberCount: number;
  isLeader: boolean;
}

export interface TripEventView {
  id: string;
  type: TripEventType;
  payload: Record<string, unknown>;
}

export interface TripDetail extends TripListItem {
  /** 사용자가 적은 여행 장소 */
  placeLabel: string;
  /** 옛 장소 목록으로 만든 여정만 값이 있다. 새 여정은 null */
  countryCode: string | null;
  currency: string;
  budgetKrw: number;
  nights: number;
  days: number;
  dDay: number | null;
  autoEndAt: string;
  /** 종료 후 null */
  inviteCode: string | null;
  me: {
    membershipId: string;
    role: MemberRole;
    pendingCount: number;
    connectionExpired: boolean;
  };
  /** 활성 멤버, 가입 순 */
  members: MemberSummary[];
  /** KRW 여정이면 null */
  fx: { policy: FxPolicy; tripCurrency: string } | null;
  unseenEvents: TripEventView[];
  version: number;
}

export interface ExpenseListItem {
  id: string;
  occurredAt: string;
  localDate: string;
  dayIndex: number | null;
  periodSide: 'BEFORE' | 'AFTER' | null;
  merchantName: string;
  payer: MemberSummary;
  status: ExpenseStatus;
  /** 순액(환불 반영) */
  krwAmount: number;
  originalAmount: string;
  originalCurrency: string;
  /** SHARED만. 정렬: 나 → 가입 순 */
  participants: MemberSummary[] | null;
  flags: { changed: boolean; duplicateSuspected: boolean; hasRefund: boolean };
  refunds: { id: string; occurredAt: string; krwAmount: number }[];
  origin: ExpenseOrigin;
  version: number;
  /** 직접 입력한 결제(origin MANUAL)의 작성자 membershipId. 가져온 결제는 null. 서버는 항상 채운다 */
  createdByMembershipId?: string | null;
}

export interface ExpenseDetail extends ExpenseListItem {
  /** 환불 전 원 결제 원화 */
  grossKrwAmount: number;
  /** "토스뱅크 체크카드 1934". 결제자에게만 */
  paymentMethodLabel: string | null;
  fx: {
    rate: string;
    displayUnit: number;
    source: string;
    rateAt: string;
    policy: FxPolicy;
  } | null;
  shares: {
    membershipId: string;
    amountKrw: number;
    isRemainderHolder: boolean;
  }[];
  perPersonKrw: number | null;
  remainderKrw: number;
  remainderHolderMembershipId: string | null;
  permissions: { canEdit: boolean; reason: EditBlockReason | null };
  duplicate: { groupId: string; canDismiss: boolean } | null;
}
