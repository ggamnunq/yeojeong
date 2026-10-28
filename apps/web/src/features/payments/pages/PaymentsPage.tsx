import { useInfiniteQuery } from '@tanstack/react-query'
import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import type { ExpenseListParams } from '../../../api'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { useTripDetail } from '../../../app/trip'
import { Callout } from '../../../ds'
import { expensesQuery } from '../api'
import { clock } from '../clock'
import { ControlRow } from '../components/ListParts'
import { ListView, TimelineView } from '../components/Views'
import { defaultDay, kst, readStoredView, storeView, todayDay } from '../rules'
import type { ExpenseRow, ExpensesPage, PaymentsView } from '../types'

/**
 * 결제내역(WF-18 리스트 · WF-19 타임라인). 주소: ?view=timeline&day=N · ?filter=pending.
 * 결제 상세 시트(/payments/:expenseId)는 이 화면 위 하위 라우트로 <Outlet />에 그린다.
 */
export default function PaymentsPage() {
  const trip = useTripDetail()
  const { user } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [storedView, setStoredView] = useState<PaymentsView>(() => readStoredView(user?.id))

  const urlView = params.get('view')
  const view: PaymentsView = urlView === 'timeline' || urlView === 'list' ? urlView : storedView
  const filterOn = params.get('filter') === 'pending'
  const ongoing = trip.status === 'ONGOING'

  // 오늘 Day·일수는 목록 응답 period가 기준. 받기 전에는 기기 시각(KST)으로 같은 값을 계산한다
  const [saved, setSaved] = useState<{ tripId: string; period: ExpensesPage['period'] } | null>(null)
  const period = saved?.tripId === trip.tripId ? saved.period : null
  const now = clock.now()
  const today = period ? period.todayDayIndex : todayDay(trip, now)
  const days = period?.days ?? trip.days
  const requestedDay = Number(params.get('day'))
  const dayOk = Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= days && (today === null || requestedDay <= today)
  const day = dayOk ? requestedDay : (today ?? (period ? 1 : defaultDay(trip, now)))

  const status = filterOn ? 'PENDING' : undefined
  const queryParams: ExpenseListParams = view === 'list' ? { status, order: 'desc' } : { status, day, order: 'asc' }
  const query = useInfiniteQuery(expensesQuery(trip.tripId, queryParams))
  const firstPage = query.data?.pages[0]
  const pendingCount = ongoing ? (firstPage?.pendingCount ?? trip.me.pendingCount) : 0
  // 받은 period를 기억해 두면 Day를 바꿔 새로 받는 동안에도 칩·오늘이 그대로다(렌더 중 갱신 — 파생 상태 패턴)
  const loadedPeriod = firstPage?.period
  if (loadedPeriod && (saved?.period !== loadedPeriod || saved.tripId !== trip.tripId)) {
    setSaved({ tripId: trip.tripId, period: loadedPeriod })
  }

  const update = (change: (next: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        change(next)
        return next
      },
      { replace: true },
    )

  // 미확정만 보기에서 0건이 되면 필터를 푼다(Q-19 추천)
  const loaded = query.isSuccess
  useEffect(() => {
    if (!filterOn || !loaded || pendingCount > 0) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('filter')
        return next
      },
      { replace: true },
    )
  }, [filterOn, loaded, pendingCount, setParams])

  const changeView = (next: PaymentsView) => {
    storeView(user?.id, next)
    setStoredView(next)
    update((p) => {
      if (next === 'timeline') p.set('view', 'timeline')
      else p.delete('view')
      p.delete('day')
    })
  }

  const open = (item: ExpenseRow) =>
    navigate({ pathname: paths.payment(trip.tripId, item.id), search: location.search }, { state: { fromList: true } })

  return (
    <div className="flex flex-1 flex-col bg-surface">
      {/* 헤더에는 그룹명이 보이므로 화면 이름은 화면리더에만 */}
      <h2 className="sr-only">결제내역</h2>
      {ongoing && trip.me.connectionExpired && (
        <div className="px-gutter pt-2">
          {/* 다시 연결(WF-06 RECONNECT)은 지갑 플로우가 시작한다 — 지갑 화면의 연결 만료 카드로 보낸다 */}
          <Callout tone="disconnected" style="tone" label="토스 연결 만료" onClick={() => navigate(paths.wallet())} />
        </div>
      )}
      <ControlRow
        pendingCount={pendingCount}
        filterOn={filterOn}
        onToggleFilter={() => update((p) => (filterOn ? p.delete('filter') : p.set('filter', 'pending')))}
        view={view}
        onViewChange={changeView}
      />
      {view === 'list' ? (
        <ListView query={query} onOpen={open} onAddOutOfPeriod={ongoing ? () => navigate(paths.outOfPeriod(trip.tripId)) : undefined} />
      ) : (
        <TimelineView
          query={query}
          days={days}
          day={day}
          today={today}
          nowTime={kst(now).time}
          onDayChange={(n) => update((p) => p.set('day', String(n)))}
          onOpen={open}
        />
      )}
      {/* 시트 chunk를 받는 동안 목록을 스켈레톤으로 바꾸지 않게 셸의 Suspense보다 안쪽에서 받는다 */}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </div>
  )
}
