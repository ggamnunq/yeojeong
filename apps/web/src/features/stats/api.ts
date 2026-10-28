import { queryOptions } from '@tanstack/react-query'
import { apiFetch, keys } from '../../api'
import type { TripSummary } from '../settlement/types'

/** GET /trips/:tripId/summary. 실패는 화면이 직접 안내한다(409 단계 불일치는 여정을 다시 받는다) */
export const summaryQuery = (tripId: string) =>
  queryOptions({
    queryKey: keys.trips.summary(tripId),
    queryFn: ({ signal }) => apiFetch<TripSummary>(`/trips/${tripId}/summary`, { signal }),
    meta: { silent: true },
  })
