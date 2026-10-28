import type { ConsentId, ConsentRequirement } from './consents.js';
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
}

/** GET /api/users/me */
export interface Me extends Profile {
  id: string;
  /** profileImageUrl이 없으면 false → 기본 이미지 */
  hasProfileImage: boolean;
  /** 연결 해제(REMOVED)되지 않은 결제수단 수 */
  paymentMethodCount: number;
  hasExpiredConnection: boolean;
}

export type AuthStatus = 'ANONYMOUS' | 'SIGNUP_REQUIRED' | 'AUTHENTICATED';

/** 가입 대기(카카오 인증만 끝난 상태)에서 닉네임 화면을 미리 채우는 값 */
export interface SignupDraft {
  kakaoNickname: string | null;
  profileImageUrl: string | null;
}

/** GET /api/auth/session (FR-102) */
export interface AuthSessionResponse {
  status: AuthStatus;
  user?: Me;
  signupDraft?: SignupDraft;
  /** AUTHENTICATED일 때만. 비어 있지 않으면 재동의 화면(FR-107)으로 보낸다 */
  reconsentRequired?: ConsentRequirement[];
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
  placeLabel: string;
  countryCode: string;
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
