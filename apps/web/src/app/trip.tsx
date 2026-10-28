import { queryOptions, useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { apiFetch, isApiError, keys, type MyTripsResponse, type TripDetail } from '../api'
import { paths } from './paths'
import { ErrorScreen, LoadingScreen } from './states'
import { defaultTab, pickEntryTrip } from './tripRules'

export { defaultTab, isTabOpen, pickEntryTrip, sortTrips, tripTabs, type TripTabInfo } from './tripRules'

// ── 마지막으로 본 여정(이 기기) ─────────────────────────────────────

const LAST_TRIP_KEY = 'yj:lastTripId'

export function readLastTripId(): string | null {
  try {
    return localStorage.getItem(LAST_TRIP_KEY)
  } catch {
    return null
  }
}

export function rememberTripId(tripId: string | null) {
  try {
    if (tripId) localStorage.setItem(LAST_TRIP_KEY, tripId)
    else localStorage.removeItem(LAST_TRIP_KEY)
  } catch {
    // 사파리 개인 정보 보호 모드 등: 기억하지 못해도 진입 라우팅은 서버 값으로 된다
  }
}

// ── 쿼리 ──────────────────────────────────────────────────────────

export const myTripsQuery = () =>
  queryOptions({
    queryKey: keys.trips.list,
    queryFn: ({ signal }) => apiFetch<MyTripsResponse>('/me/trips', { signal }),
  })

export const tripQuery = (tripId: string) =>
  queryOptions({
    queryKey: keys.trips.detail(tripId),
    queryFn: ({ signal }) => apiFetch<TripDetail>(`/trips/${tripId}`, { signal }),
    // 404는 진입 라우팅으로, 그 밖은 RequireTrip이 오류 화면으로 보여 준다
    meta: { silent: true },
  })

/** GET /me/trips. 정렬은 sortTrips */
export function useMyTrips(options: { enabled?: boolean } = {}) {
  return useQuery({ ...myTripsQuery(), enabled: options.enabled ?? true })
}

/** GET /trips/:tripId. tripId가 없으면 부르지 않는다 */
export function useTrip(tripId: string | null | undefined) {
  return useQuery({ ...tripQuery(tripId ?? ''), enabled: Boolean(tripId) })
}

/**
 * 지금 보고 있는 여정. URL :tripId → 이 기기에서 마지막으로 본 여정 → 진입 라우팅 규칙 순.
 * 여정 화면 밖(/wallet·/me 등)에서도 쓴다. 소속 여정이 없으면 tripId null.
 */
export function useCurrentTrip() {
  const { tripId: fromUrl } = useParams()
  const myTrips = useMyTrips({ enabled: !fromUrl })
  const tripId = fromUrl ?? pickEntryTrip(myTrips.data, readLastTripId())?.tripId ?? null
  const trip = useTrip(tripId)
  return {
    tripId,
    trip: trip.data,
    isPending: (!fromUrl && myTrips.isPending) || (tripId !== null && trip.isPending),
    error: myTrips.error ?? trip.error,
  }
}

// ── 여정 라우트 가드 ───────────────────────────────────────────────

const TripContext = createContext<TripDetail | null>(null)

/** RequireTrip 아래(/trips/:tripId/*)에서 지금 여정. 밖에서 부르면 에러 */
export function useTripDetail(): TripDetail {
  const trip = useContext(TripContext)
  if (!trip) throw new Error('useTripDetail은 RequireTrip 아래에서만 쓴다')
  return trip
}

/** /trips/:tripId 레이아웃. 활성 멤버가 아니거나 없는 여정(404)이면 진입 라우팅(/)으로 */
export function RequireTrip() {
  const { tripId = '' } = useParams()
  const trip = useTrip(tripId)
  const notFound = isApiError(trip.error) && trip.error.status === 404

  useEffect(() => {
    if (trip.data) rememberTripId(trip.data.tripId)
    else if (notFound && readLastTripId() === tripId) rememberTripId(null)
  }, [trip.data, notFound, tripId])

  if (trip.isPending) return <LoadingScreen />
  if (notFound) return <Navigate replace to={paths.splash()} />
  if (!trip.data) return <ErrorScreen error={trip.error} onRetry={() => void trip.refetch()} />
  return (
    <TripContext value={trip.data}>
      <Outlet />
    </TripContext>
  )
}

/** /trips/:tripId → 단계별 기본 탭 */
export function TripIndexRedirect() {
  const trip = useTripDetail()
  return <Navigate replace to={paths.tripTab(trip.tripId, defaultTab(trip.status))} />
}
