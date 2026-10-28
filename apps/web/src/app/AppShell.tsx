import { Suspense } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { BottomNav, Screen, TopHeader, type BottomNavActive } from '../ds'
import { paths, type TripTab } from './paths'
import { LoadingScreen } from './states'
import { defaultTab, tripTabs, useTripDetail } from './trip'

const NAV_ORDER: readonly BottomNavActive[] = ['first', 'second', 'third']

/**
 * 여정 탭 화면 공통 틀(WF-13, FR-001): TopHeader(Group) + 본문 + BottomNav(3탭).
 * 본문 거터는 화면이 정한다(셸은 gutter 없음). 잠긴 탭·이 단계에 없는 탭 주소로 오면 기본 탭으로 보낸다.
 * TODO(2단계): 그룹 드롭다운(WF-14) · 그룹원 패널(WF-15) · 잠금 탭 표현
 */
export function AppShell() {
  const trip = useTripDetail()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const tabs = tripTabs(trip.status)
  const current = pathname.split('/')[3] as TripTab | undefined
  const activeIndex = tabs.findIndex((t) => t.tab === current && !t.locked)

  if (activeIndex === -1) return <Navigate replace to={paths.tripTab(trip.tripId, defaultTab(trip.status))} />

  return (
    <Screen
      gutter={false}
      header={
        <TopHeader
          type="group"
          groupName={trip.groupName}
          onWalletClick={() => navigate(paths.wallet())}
          onMyClick={() => navigate(paths.me())}
        />
      }
      nav={
        <BottomNav
          active={NAV_ORDER[activeIndex]}
          phase={trip.status === 'ENDED' ? 'ended' : 'ongoing'}
          onChange={(active) => {
            const tab = tabs[NAV_ORDER.indexOf(active)]
            if (!tab.locked) navigate(paths.tripTab(trip.tripId, tab.tab))
          }}
        />
      }
    >
      <Suspense fallback={<LoadingScreen inset />}>
        <Outlet />
      </Suspense>
    </Screen>
  )
}
