import { useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { sortTrips, useMyTrips } from '../../app/trip'
import { DropdownMenu } from '../../ds'
import { tripMeta } from './rules'

export type GroupDropdownProps = {
  open: boolean
  onClose: () => void
  currentTripId: string
}

/** HF-14 그룹 드롭다운(FR-205): 내 여정(진행 중 → 시작 전 → 종료) + 새 여정 만들기 · 초대코드로 참여 */
export function GroupDropdown({ open, onClose, currentTripId }: GroupDropdownProps) {
  const navigate = useNavigate()
  const myTrips = useMyTrips()
  const trips = sortTrips(myTrips.data?.items ?? []).map((trip) => ({
    key: trip.tripId,
    title: trip.groupName,
    meta: tripMeta(trip),
    current: trip.tripId === currentTripId,
    onSelect: () => {
      if (trip.tripId !== currentTripId) navigate(paths.trip(trip.tripId))
    },
  }))

  return (
    <DropdownMenu
      open={open}
      onClose={onClose}
      trips={trips}
      actions={[
        { label: '새 여정 만들기', icon: 'plus', onSelect: () => navigate(paths.tripNew()) },
        { label: '초대코드로 참여', icon: 'link', onSelect: () => navigate(paths.join()) },
      ]}
    />
  )
}
