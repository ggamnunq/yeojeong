import { Suspense, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import type { TripStatus } from '../api'
import { BottomNav, Screen, TopHeader, type BottomNavActive } from '../ds'
import { GroupDropdown } from '../features/shell/GroupDropdown'
import { MemberPanel } from '../features/shell/MemberPanel'
import { useTripEventToasts } from '../features/shell/useTripEventToasts'
import { paths, type TripTab } from './paths'
import { ShellCtaContext, toScreenCta, type ShellCta } from './shellCta'
import { LoadingScreen } from './states'
import { defaultTab, isTabOpen, tripTabs, useTripDetail } from './trip'

const NAV_ORDER: readonly BottomNavActive[] = ['first', 'second', 'third']

/**
 * 이 단계에 없는 탭 주소로 왔을 때 갈 탭(WF-13 딥링크 규칙). 2번 탭끼리는 서로 바꾼다:
 * 진행 중에 정산(/settlement) → 현황, 종료 후 현황(/stats) → 정산(WF-25). 나머지는 단계 기본 탭
 */
function fallbackTab(status: TripStatus, requested: TripTab | undefined): TripTab {
  if (requested === 'settlement' && isTabOpen(status, 'stats')) return 'stats'
  if (requested === 'stats' && isTabOpen(status, 'settlement')) return 'settlement'
  return defaultTab(status)
}

/**
 * 여정 탭 화면 공통 틀(HF-13, FR-001): DS ShellApp = TopHeader Group(≡ 그룹원 패널 · 그룹명 ⌄ 드롭다운 · 지갑 · 마이) + 본문 + BottomNav.
 * 본문 거터는 페이지가 정한다(gutter 없음, 첫 블록 위 8은 셸). 하단 CTA는 페이지가 useShellCta로 단다.
 * 잠긴 탭·이 단계에 없는 탭 주소로 오면 기본 탭으로 보낸다.
 */
export function AppShell() {
  const trip = useTripDetail()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [cta, setCta] = useState<ShellCta | null>(null)
  useTripEventToasts(trip)

  const tabs = tripTabs(trip.status)
  const current = pathname.split('/')[3] as TripTab | undefined
  const activeIndex = tabs.findIndex((t) => t.tab === current && !t.locked)

  if (activeIndex === -1) return <Navigate replace to={paths.tripTab(trip.tripId, fallbackTab(trip.status, current))} />

  return (
    <ShellCtaContext value={setCta}>
      <Screen
        background="surface"
        gutter={false}
        contentClassName="pt-2"
        header={<TopHeader type="group" groupNameSize="h2" divider={false} {...{
          groupName: trip.groupName,
          dropdown: menuOpen ? 'open' : 'closed',
          onMenuClick: () => setPanelOpen(true),
          onGroupClick: () => setMenuOpen((open) => !open),
          onWalletClick: () => navigate(paths.wallet()),
          onMyClick: () => navigate(paths.me()),
        }} />}
        // 하단 2버튼은 DS BottomCTA Layout=Horizontal(왼쪽 보조·파괴적 · 오른쪽 주 행동, 1:1)
        cta={toScreenCta(cta)}
        nav={<BottomNav {...{
          active: NAV_ORDER[activeIndex],
          phase: trip.status === 'ENDED' ? 'ended' : 'ongoing',
          locked: NAV_ORDER.filter((_, i) => tabs[i].locked),
          onChange: (active) => {
            const tab = tabs[NAV_ORDER.indexOf(active)]
            if (!tab.locked) navigate(paths.tripTab(trip.tripId, tab.tab))
          },
        }} />}
      >
        <Suspense fallback={<LoadingScreen inset gutter />}>
          <Outlet />
        </Suspense>
      </Screen>
      <GroupDropdown open={menuOpen} onClose={() => setMenuOpen(false)} currentTripId={trip.tripId} />
      <MemberPanel open={panelOpen} onClose={() => setPanelOpen(false)} trip={trip} />
    </ShellCtaContext>
  )
}
