import { Suspense, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { BottomNav, Button, Screen, TopHeader, type BottomNavActive } from '../ds'
import { GroupDropdown } from '../features/shell/GroupDropdown'
import { MemberPanel } from '../features/shell/MemberPanel'
import { useTripEventToasts } from '../features/shell/useTripEventToasts'
import { paths, type TripTab } from './paths'
import { ShellCtaContext, type ShellCta } from './shellCta'
import { LoadingScreen } from './states'
import { defaultTab, tripTabs, useTripDetail } from './trip'

const NAV_ORDER: readonly BottomNavActive[] = ['first', 'second', 'third']

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

  if (activeIndex === -1) return <Navigate replace to={paths.tripTab(trip.tripId, defaultTab(trip.status))} />

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
        nav={<>
          {cta && <div className="bg-surface px-gutter pt-3 pb-3">
            <Button type="primary" size="l" className="w-full" label={cta.label} disabled={cta.disabled} htmlType={cta.htmlType} form={cta.form} onClick={cta.onClick} />
            {cta.secondary && <button type="button" className="mt-2 w-full py-2 text-body-s text-secondary" onClick={cta.secondary.onClick}>{cta.secondary.label}</button>}
          </div>}
          <BottomNav {...{
          active: NAV_ORDER[activeIndex],
          phase: trip.status === 'ENDED' ? 'ended' : 'ongoing',
          locked: NAV_ORDER.filter((_, i) => tabs[i].locked),
          onChange: (active) => {
            const tab = tabs[NAV_ORDER.indexOf(active)]
            if (!tab.locked) navigate(paths.tripTab(trip.tripId, tab.tab))
          },
        }} />
        </>}
      >
        <Suspense fallback={<LoadingScreen inset />}>
          <Outlet />
        </Suspense>
      </Screen>
      <GroupDropdown open={menuOpen} onClose={() => setMenuOpen(false)} currentTripId={trip.tripId} />
      <MemberPanel open={panelOpen} onClose={() => setPanelOpen(false)} trip={trip} />
    </ShellCtaContext>
  )
}
