import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, keys, type MemberSummary, type TripDetail } from '../../api'

/** DELETE /groups/:groupId/members/:membershipId (FR-207) */
export function useKickMember(trip: Pick<TripDetail, 'tripId' | 'groupId'>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (member: MemberSummary) =>
      apiFetch<void>(`/groups/${trip.groupId}/members/${member.membershipId}`, { method: 'DELETE' }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId) }),
        queryClient.invalidateQueries({ queryKey: ['groups', trip.groupId] }),
        queryClient.invalidateQueries({ queryKey: keys.trips.list }),
      ]),
  })
}

/** POST /groups/:groupId/leave (FR-208). 성공하면 그 여정 캐시를 지운다 */
export function useLeaveGroup(trip: Pick<TripDetail, 'tripId' | 'groupId'>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<{ newLeader?: MemberSummary }>(`/groups/${trip.groupId}/leave`, { method: 'POST' }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: keys.trips.detail(trip.tripId) })
      await queryClient.invalidateQueries({ queryKey: keys.trips.list })
    },
  })
}

/** POST /trips/:tripId/events/ack (FR-004). 실패해도 다음 진입 때 다시 보일 뿐이라 조용히 넘긴다 */
export function useAckTripEvents(tripId: string) {
  return useMutation({
    mutationFn: (lastEventId: string) =>
      apiFetch<void>(`/trips/${tripId}/events/ack`, { body: { lastEventId } }),
    meta: { silent: true },
  })
}
