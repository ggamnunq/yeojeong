import { queryOptions } from '@tanstack/react-query'
import { apiFetch, keys } from '../../api'
import type { SettlementMemberExpenses, SettlementView } from './types'

/** GET /trips/:tripId/settlement. 종료 시 고정한 스냅샷 */
export const settlementQuery = (tripId: string) =>
  queryOptions({
    queryKey: keys.trips.settlement(tripId),
    queryFn: ({ signal }) => apiFetch<SettlementView>(`/trips/${tripId}/settlement`, { signal }),
    meta: { silent: true },
  })

/** GET /trips/:tripId/settlement/members/:membershipId/expenses (S2C 경로. 기능명세 6-3 초안은 …/members/:membershipId) */
export const settlementMemberQuery = (tripId: string, membershipId: string) =>
  queryOptions({
    queryKey: keys.trips.settlementMember(tripId, membershipId),
    queryFn: ({ signal }) =>
      apiFetch<SettlementMemberExpenses>(`/trips/${tripId}/settlement/members/${membershipId}/expenses`, { signal }),
    meta: { silent: true },
  })
