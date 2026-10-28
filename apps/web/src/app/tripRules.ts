import type { MyTripsResponse, TripListItem, TripStatus } from '../api'
import type { TripTab } from './paths'

// 여정 단계 규칙(FR-001·102·205, 기능명세 4-8). 화면 없이 테스트한다.

export type TripTabInfo = {
  tab: TripTab
  label: string
  /** 시작 전의 결제내역·현황. 눌러도 이동하지 않는다 */
  locked: boolean
}

/** 하단 3탭. 위치 고정, 종료 후 2번이 정산 */
export function tripTabs(status: TripStatus): [TripTabInfo, TripTabInfo, TripTabInfo] {
  const upcoming = status === 'UPCOMING'
  return [
    { tab: 'payments', label: '결제내역', locked: upcoming },
    status === 'ENDED'
      ? { tab: 'settlement', label: '정산', locked: false }
      : { tab: 'stats', label: '현황', locked: upcoming },
    { tab: 'info', label: '여정 정보', locked: false },
  ]
}

/** /trips/:tripId 진입 시 기본 탭 */
export function defaultTab(status: TripStatus): TripTab {
  if (status === 'UPCOMING') return 'info'
  if (status === 'ENDED') return 'settlement'
  return 'payments'
}

/** 이 단계에서 열 수 있는 탭인가. 아니면 기본 탭으로 보낸다 */
export function isTabOpen(status: TripStatus, tab: TripTab): boolean {
  return tripTabs(status).some((t) => t.tab === tab && !t.locked)
}

const STATUS_ORDER: Record<TripStatus, number> = { ONGOING: 0, UPCOMING: 1, ENDED: 2 }

/** 진행 중(시작일 늦은 순) → 시작 전(시작일 빠른 순) → 종료(종료일 늦은 순) */
export function sortTrips(items: readonly TripListItem[]): TripListItem[] {
  return [...items].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (byStatus !== 0) return byStatus
    if (a.status === 'ONGOING') return b.startDate.localeCompare(a.startDate)
    if (a.status === 'UPCOMING') return a.startDate.localeCompare(b.startDate)
    return b.endDate.localeCompare(a.endDate)
  })
}

/**
 * 진입 라우팅(FR-102)으로 열 여정. ① 이 기기에서 마지막으로 본 여정 ② 서버 lastViewedTripId ③ 정렬 첫 여정. 없으면 null(→ /trips)
 */
export function pickEntryTrip(data: MyTripsResponse | undefined, remembered?: string | null): TripListItem | null {
  if (!data || data.items.length === 0) return null
  const find = (id: string | null | undefined) => (id ? data.items.find((t) => t.tripId === id) : undefined)
  return find(remembered) ?? find(data.lastViewedTripId) ?? sortTrips(data.items)[0]
}
