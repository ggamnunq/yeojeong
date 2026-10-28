import type { Profile, TripDetail, TripStatus } from '../../api'

// 여정 생성·참여·여정 정보 플로우의 요청·응답 타입(기능명세 6-3 trips·groups·invites).
// S2A 서버 브랜치의 @yeojeong/shared `api/trips.ts`와 같은 모양으로 맞췄다.
// TODO(shared): 서버가 shared에 넣으면 이 정의를 지우고 shared에서 re-export한다.

export type TripEditableField = 'groupName' | 'place' | 'startDate' | 'endDate' | 'budgetKrw'

/** 장소 입력. GET /api/places에서 고른 값을 그대로 보낸다. 통화는 서버가 국가로 정한다 */
export interface PlaceInput {
  /** ISO 3166-1 alpha-2. 국내는 KR */
  countryCode: string
  city?: string | null
  /** 표시용 "일본 오사카" */
  label: string
}

/** GET /api/places?query= (최대 20) */
export interface Place {
  countryCode: string
  countryName: string
  city: string | null
  label: string
  /** ISO 4217 */
  currency: string
}

/** POST /api/trips */
export interface CreateTripRequest {
  groupName: string
  place: PlaceInput
  startDate: string
  endDate: string
  budgetKrw: number
}

/** POST /api/trips 201 */
export interface CreateTripResponse {
  tripId: string
  groupId: string
  /** 저장 형식 "K7M2QX". 표시는 formatInviteCode */
  inviteCode: string
}

/** PATCH /api/trips/:tripId. 보낸 항목만 바꾼다(단계별 허용 항목 FR-302) */
export interface UpdateTripRequest {
  groupName?: string
  place?: PlaceInput
  startDate?: string
  endDate?: string
  budgetKrw?: number
  version: number
}

/** POST /api/trips/:tripId/start · /end */
export interface TripVersionRequest {
  version: number
}

/** 버튼 노출용 권한(서버가 요청마다 같은 규칙을 다시 확인한다) */
export interface TripPermissions {
  /** 연필(여정 정보 수정). editableFields가 비면 false */
  canEdit: boolean
  editableFields: TripEditableField[]
  /** 그룹장 · 시작 전 · 종료일이 지나지 않음(미결 Q-26 추천안) */
  canStart: boolean
  canEnd: boolean
  canDeleteGroup: boolean
  canKick: boolean
  /** 초대코드 복사·공유·인원 추가(종료 후 false) */
  canInvite: boolean
  canLeave: boolean
  canChangeFx: boolean
}

/**
 * GET /api/trips/:tripId 응답. 부록 B TripDetail에 서버(S2A)가 더하는 값은 아직 목·임시 타입에 없을 수 있어 선택 필드로 둔다.
 * 없으면 rules.ts가 role·status·날짜로 같은 규칙을 계산한다.
 */
export type TripInfo = TripDetail & {
  permissions?: TripPermissions
  /** 진행 중이고 오늘이 기간 안이면 오늘의 Day N(1부터) */
  todayDayIndex?: number | null
  city?: string | null
}

/** GET /api/trips/:tripId/end-preview */
export interface EndPreviewResponse {
  /** 그룹 전체 미확정 건수(미결 Q-10) */
  pendingCount: number
  autoEndAt: string
}

/** POST /api/trips/:tripId/end */
export interface EndTripResponse {
  trip: TripInfo
  settlementId: string | null
  autoPersonalizedCount: number
}

/** GET /api/invites/:code (FR-203) */
export interface InvitePreview {
  groupName: string
  placeLabel: string
  startDate: string
  endDate: string
  status: TripStatus
  memberCount: number
  /** 가입 순 최대 4명 */
  membersPreview: Profile[]
  alreadyMember: boolean
  /** 이미 멤버일 때만 */
  tripId: string | null
}

/** POST /api/invites/:code/join 201 (FR-204) */
export interface JoinTripResponse {
  tripId: string
  groupId: string
  status: TripStatus
}

/** 여정 만들기·수정 폼 값. budget은 숫자만 남긴 문자열("1200000") */
export interface TripFormValues {
  groupName: string
  place: PlaceInput | null
  startDate: string
  endDate: string
  budget: string
}
