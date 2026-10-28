import type { PlaceInput, TripPermissions } from '@yeojeong/shared'
import type { TripDetail } from '../../api'

// 여정 생성·참여·여정 정보 플로우의 요청·응답 타입(기능명세 6-3 trips·groups·invites). 서버(S2A)와 같은 정의는 @yeojeong/shared에서 가져온다.
export type {
  CreateTripRequest,
  CreateTripResponse,
  EndPreviewResponse,
  InvitePreview,
  JoinTripResponse,
  Place,
  PlaceInput,
  TripEditableField,
  TripPermissions,
  UpdateTripRequest,
} from '@yeojeong/shared'

/**
 * GET /api/trips/:tripId 응답. 서버(TripDetailResponse)는 permissions · todayDayIndex · city 등을 더 주지만,
 * 화면 임시 타입(src/api/types.ts TripDetail)과 지금 목에는 없을 수 있어 선택 필드로 둔다. 없으면 rules.ts가 role·status·날짜로 같은 규칙을 계산한다.
 */
export type TripInfo = TripDetail & {
  permissions?: TripPermissions
  /** 진행 중이고 오늘이 기간 안이면 오늘의 Day N(1부터) */
  todayDayIndex?: number | null
  city?: string | null
  startedAt?: string | null
  endedAt?: string | null
  endReason?: 'MANUAL' | 'AUTO' | null
}

/** POST /api/trips/:tripId/end (shared EndTripResponse와 같고 trip만 화면 타입) */
export interface EndTripResponse {
  trip: TripInfo
  settlementId: string | null
  autoPersonalizedCount: number
}

/** 여정 만들기·수정 폼 값. budget은 숫자만 남긴 문자열("1200000") */
export interface TripFormValues {
  groupName: string
  place: PlaceInput | null
  startDate: string
  endDate: string
  budget: string
}

/** 화면 사이 이동 표시(location.state). 표시가 있으면 「뒤로」가 기록을 되돌리고, 없으면(주소로 바로 옴) 목적지로 바꾼다 */
export type NavState = { from?: 'info'; fromCreate?: boolean } | null
