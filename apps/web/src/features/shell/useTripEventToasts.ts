import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { keys, type TripDetail } from '../../api'
import { toast } from '../../notifications'
import { useAckTripEvents } from './api'
import { eventMessage } from './rules'

/**
 * 내가 하지 않은 그룹 변경(그룹장 승계 · 환율 기준 변경)을 여정을 열 때 한 번 알린다(FR-004).
 * 순서대로 토스트 → 캐시에서 지움(다시 그려도 안 뜨게) → POST events/ack.
 */
export function useTripEventToasts(trip: TripDetail) {
  const queryClient = useQueryClient()
  const ack = useAckTripEvents(trip.tripId)
  const shown = useRef(new Set<string>())
  const { mutate } = ack

  useEffect(() => {
    const fresh = trip.unseenEvents.filter((e) => !shown.current.has(`${trip.tripId}:${e.id}`))
    if (fresh.length === 0) return
    for (const event of fresh) {
      shown.current.add(`${trip.tripId}:${event.id}`)
      const message = eventMessage(event)
      if (message) toast.info(message)
    }
    const ids = new Set(fresh.map((e) => e.id))
    queryClient.setQueryData<TripDetail>(keys.trips.detail(trip.tripId), (old) =>
      old && { ...old, unseenEvents: old.unseenEvents.filter((e) => !ids.has(e.id)) },
    )
    mutate(fresh[fresh.length - 1].id)
  }, [trip.tripId, trip.unseenEvents, queryClient, mutate])
}
