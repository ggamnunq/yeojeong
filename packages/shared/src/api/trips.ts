import type { MemberSummary, Profile, TripDetail, TripListItem } from '../api.js';
import type { EndReason, TripStatus } from '../domain.js';

// S2A 그룹·여정·멤버십 API 타입과 규칙 상수(기능명세 5-2·5-3, 6-3). 서버 문서는 apps/api/src/trips/README.md.
// 날짜는 "2026-11-12"(KST 달력 날짜), 시각은 ISO 8601 KST 오프셋 문자열이다.

/** 그룹 최대 인원(활성 멤버). 미결 Q-16 추천안 */
export const TRIP_MEMBER_LIMIT = 20;
/** 그룹명(= 화면의 여정 이름) 최대 글자 수 */
export const GROUP_NAME_MAX_LENGTH = 20;
/** 장소 표시 이름·도시 최대 글자 수 */
export const PLACE_LABEL_MAX_LENGTH = 40;
/** 여정 기간 최대 일수(시작일·종료일 포함). 미결 Q-29 추천안 */
export const TRIP_MAX_DAYS = 31;
/** 시작일은 오늘(KST)로부터 며칠 전까지 고를 수 있나. 미결 Q-29 추천안 */
export const TRIP_START_PAST_LIMIT_DAYS = 30;
export const TRIP_BUDGET_MIN_KRW = 1;
export const TRIP_BUDGET_MAX_KRW = 1_000_000_000;
/** 초대코드 미리보기에 보여 주는 참여자 수 */
export const INVITE_PREVIEW_MEMBER_LIMIT = 4;

export const TRIP_EDITABLE_FIELD_VALUES = [
  'groupName',
  'place',
  'startDate',
  'endDate',
  'budgetKrw',
] as const;
export type TripEditableField = (typeof TRIP_EDITABLE_FIELD_VALUES)[number];

/**
 * 단계별로 그룹장이 고칠 수 있는 항목(FR-302, 미결 Q-14 추천안).
 * 진행 중 종료일은 오늘(KST) 이후로만 바꿀 수 있다.
 */
export const TRIP_EDITABLE_FIELDS: Readonly<
  Record<TripStatus, readonly TripEditableField[]>
> = {
  UPCOMING: TRIP_EDITABLE_FIELD_VALUES,
  ONGOING: ['groupName', 'budgetKrw', 'endDate'],
  ENDED: [],
};

/** 장소 입력. 목록(GET /api/places)에서 고른 값을 그대로 보낸다. 통화는 서버가 국가로 정한다 */
export interface PlaceInput {
  /** ISO 3166-1 alpha-2. 국내는 KR */
  countryCode: string;
  city?: string | null;
  /** 표시용 "일본 오사카" */
  label: string;
}

/** GET /api/places */
export interface Place {
  countryCode: string;
  countryName: string;
  city: string | null;
  label: string;
  /** ISO 4217 */
  currency: string;
}

/** POST /api/trips */
export interface CreateTripRequest {
  groupName: string;
  place: PlaceInput;
  startDate: string;
  endDate: string;
  budgetKrw: number;
}

/** POST /api/trips 201 */
export interface CreateTripResponse {
  tripId: string;
  groupId: string;
  /** 저장 형식 "K7M2QX". 표시는 formatInviteCode */
  inviteCode: string;
}

/** GET /api/me/trips. 정렬: 진행 중 → 시작 전(시작일 빠른 순) → 종료(종료일 늦은 순) */
export interface MyTripsResponse {
  /** 마지막으로 연 여정. 이미 나갔거나 삭제됐으면 null */
  lastViewedTripId: string | null;
  items: TripListItem[];
}

export const TRIP_TAB_VALUES = [
  'EXPENSES',
  'SUMMARY',
  'SETTLEMENT',
  'INFO',
] as const;
/** 하단 탭. 2번 탭은 종료 전 SUMMARY(현황), 종료 후 SETTLEMENT(정산) */
export type TripTab = (typeof TRIP_TAB_VALUES)[number];

/** 앱 셸(FR-001). 단계에 따라 기본 탭·잠금·2번 탭이 바뀐다 */
export interface TripShell {
  defaultTab: TripTab;
  secondTab: 'SUMMARY' | 'SETTLEMENT';
  /** 자물쇠로 보여 주고 이동을 막는 탭. 시작 전 ['EXPENSES', 'SUMMARY'] */
  lockedTabs: TripTab[];
}

/** 버튼 노출용 권한 플래그. 서버는 같은 규칙을 요청마다 다시 확인한다 */
export interface TripPermissions {
  /** 연필(여정 정보 수정). editableFields가 비면 false */
  canEdit: boolean;
  editableFields: TripEditableField[];
  /** 그룹장 · 시작 전 · 종료일이 지나지 않음(미결 Q-26) */
  canStart: boolean;
  canEnd: boolean;
  canDeleteGroup: boolean;
  canKick: boolean;
  /** 초대코드 복사·공유·인원 추가(종료 후 false) */
  canInvite: boolean;
  canLeave: boolean;
  canChangeFx: boolean;
}

/**
 * GET /api/trips/:tripId (FR-001·301). 부록 B의 TripDetail에 셸·권한·장소 상세를 더했다.
 * 호출하면 서버가 lastViewedTripId를 이 여정으로 바꾼다.
 */
export interface TripDetailResponse extends TripDetail {
  city: string | null;
  /** 진행 중이고 오늘이 기간 안이면 오늘의 Day N(1부터). 그 밖에는 null */
  todayDayIndex: number | null;
  startedAt: string | null;
  endedAt: string | null;
  endReason: EndReason | null;
  shell: TripShell;
  permissions: TripPermissions;
}

/** PATCH /api/trips/:tripId. 보낸 항목만 바꾼다. 잠긴 항목은 지금 값과 같을 때만 보내도 된다 */
export interface UpdateTripRequest {
  groupName?: string;
  place?: PlaceInput;
  startDate?: string;
  endDate?: string;
  budgetKrw?: number;
  /** GET 응답의 version. 다르면 409 VERSION_CONFLICT + details.current */
  version: number;
}

/** POST /api/trips/:tripId/start, POST /api/trips/:tripId/end */
export interface TripVersionRequest {
  version: number;
}

/** 409 VERSION_CONFLICT의 details */
export interface TripVersionConflictDetails {
  current: TripDetailResponse;
}

/** 409 TRIP_PHASE_INVALID(여정 정보 수정)의 details: 지금 단계에서 바꿀 수 없는 항목 */
export interface TripLockedFieldsDetails {
  lockedFields: TripEditableField[];
}

/** GET /api/trips/:tripId/end-preview */
export interface EndPreviewResponse {
  /** 그룹 전체 미확정 건수(이름·금액 없이 숫자만, 미결 Q-10) */
  pendingCount: number;
  autoEndAt: string;
}

/** POST /api/trips/:tripId/end */
export interface EndTripResponse {
  trip: TripDetailResponse;
  /** 정산 모듈이 trip.ended를 처리해 만든 정산. 아직 없으면 null */
  settlementId: string | null;
  /** 종료 시점의 미확정 건수 = 개인으로 처리될 건수 */
  autoPersonalizedCount: number;
}

/** POST /api/trips/:tripId/events/ack */
export interface AckTripEventsRequest {
  /** 마지막으로 보여 준 unseenEvents[].id */
  lastEventId: string;
}

/** POST /api/groups/:groupId/leave */
export interface LeaveGroupResponse {
  /** 그룹장이 나가 승계가 일어났을 때 새 그룹장 */
  newLeader: MemberSummary | null;
  /** 마지막 멤버가 나가 그룹이 삭제됐는지(미결 Q-25 추천안) */
  groupDeleted: boolean;
}

/** GET /api/invites/:code (FR-203) */
export interface InvitePreview {
  groupName: string;
  placeLabel: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  memberCount: number;
  /** 가입 순 최대 4명 */
  membersPreview: Profile[];
  alreadyMember: boolean;
  /** 이미 멤버일 때만 그 여정 ID */
  tripId: string | null;
}

/** POST /api/invites/:code/join 201 (FR-204) */
export interface JoinTripResponse {
  tripId: string;
  groupId: string;
  status: TripStatus;
}

/** POST /api/internal/jobs/auto-end */
export interface AutoEndJobResponse {
  /** 이번 실행에서 종료한 여정 */
  endedTripIds: string[];
  /** 정산·자동 개인 처리가 비어 있어 trip.ended를 다시 보낸 여정 */
  redeliveredTripIds: string[];
}
