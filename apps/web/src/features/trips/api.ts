import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, keys } from '../../api'
import type {
  CreateTripRequest,
  CreateTripResponse,
  EndPreviewResponse,
  EndTripResponse,
  InviteCodeRequest,
  InvitePreview,
  JoinTripResponse,
  SupportedCurrency,
  TripInfo,
  UpdateTripRequest,
} from './types'

// 여정 생성·참여·여정 정보의 쿼리·뮤테이션(기능명세 6-3). 여정을 바꾸면 keys.trips.detail(tripId)를, 목록이 바뀌면 keys.trips.list를 무효화한다.

/** GET /currencies (현지 통화 시트). KRW가 맨 앞, 나머지는 서버 순서 그대로. 거의 바뀌지 않는다 */
export const currenciesQuery = () =>
  queryOptions({
    queryKey: keys.currencies,
    queryFn: ({ signal }) => apiFetch<SupportedCurrency[]>('/currencies', { signal }),
    staleTime: 60 * 60_000,
  })

/**
 * POST /invites/preview { code }. 초대코드는 참여 권한이라 주소(경로·쿼리)에 넣지 않고 본문으로만 보낸다(서버 요청 로그에 남지 않게).
 * 오류 문구는 화면이 직접 보여 준다(silent)
 */
export const invitePreviewQuery = (code: string) =>
  queryOptions({
    queryKey: keys.invite(code),
    queryFn: ({ signal }) => apiFetch<InvitePreview>('/invites/preview', { body: { code } satisfies InviteCodeRequest, signal }),
    meta: { silent: true },
    retry: false,
    staleTime: 0,
  })

/** GET /trips/:tripId/end-preview. 종료 다이얼로그를 열기 직전에 받는다 */
export const endPreviewQuery = (tripId: string) =>
  queryOptions({
    queryKey: keys.trips.endPreview(tripId),
    queryFn: ({ signal }) => apiFetch<EndPreviewResponse>(`/trips/${tripId}/end-preview`, { signal }),
    staleTime: 0,
  })

/** POST /trips. 검증 실패는 폼이 fieldErrors로 보여 준다(전역 토스트 없음) */
export function useCreateTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTripRequest) => apiFetch<CreateTripResponse>('/trips', { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.trips.list }),
  })
}

/** POST /invites/join { code }(코드는 본문으로만). 오류는 화면이 직접 안내한다 */
export function useJoinTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => apiFetch<JoinTripResponse>('/invites/join', { body: { code } satisfies InviteCodeRequest }),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.trips.list }),
  })
}

/** 여정 응답을 캐시에 넣고(단계가 바뀐 탭으로 바로 이동할 수 있게) 그 여정의 하위 키·목록을 다시 받는다 */
function useApplyTrip() {
  const queryClient = useQueryClient()
  return (trip: TripInfo) => {
    queryClient.setQueryData(keys.trips.detail(trip.tripId), trip)
    void queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId), refetchType: 'none' })
    void queryClient.invalidateQueries({ queryKey: keys.trips.list })
  }
}

/** PATCH /trips/:tripId. 409·403은 화면이 직접 안내한다 */
export function useUpdateTrip(tripId: string) {
  const apply = useApplyTrip()
  return useMutation({
    mutationFn: (body: UpdateTripRequest) => apiFetch<TripInfo>(`/trips/${tripId}`, { method: 'PATCH', body }),
    meta: { silent: true },
    onSuccess: apply,
  })
}

/** POST /trips/:tripId/start */
export function useStartTrip(tripId: string) {
  const apply = useApplyTrip()
  return useMutation({
    mutationFn: (version: number) => apiFetch<TripInfo>(`/trips/${tripId}/start`, { body: { version } }),
    onSuccess: apply,
  })
}

/** POST /trips/:tripId/end */
export function useEndTrip(tripId: string) {
  const apply = useApplyTrip()
  return useMutation({
    mutationFn: (version: number) => apiFetch<EndTripResponse>(`/trips/${tripId}/end`, { body: { version } }),
    onSuccess: (result) => apply(result.trip),
  })
}

/** DELETE /groups/:groupId (시작 전 · 그룹장) */
export function useDeleteGroup() {
  return useMutation({
    mutationFn: (groupId: string) => apiFetch<void>(`/groups/${groupId}`, { method: 'DELETE' }),
  })
}
