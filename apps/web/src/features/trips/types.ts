import type { PlaceInput, TripDetailResponse } from '@yeojeong/shared'

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

/** GET /api/trips/:tripId. 권한·오늘 Day·D-day는 서버 계산값만 사용한다. */
export type TripInfo = TripDetailResponse

export type { EndTripResponse } from '@yeojeong/shared'

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
