import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import type { ExpenseListItem, ExpenseListParams } from '../../../api'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { useTripDetail } from '../../../app/trip'
import { Callout } from '../../../ds'
import { expensesQuery } from '../api'
import { clock } from '../clock'
import { ControlRow } from '../components/ListParts'
import { ListView, TimelineView } from '../components/Views'
import { defaultDay, kst, readStoredView, storeView, todayDay } from '../rules'
import type { PaymentsView } from '../types'

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

  const now = clock.now()
  const today = todayDay(trip, now)
  const requestedDay = Number(params.get('day'))
  const dayOk = Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= trip.days && (today === null || requestedDay <= today)
  const day = dayOk ? requestedDay : defaultDay(trip, now)

  const status = filterOn ? 'PENDING' : undefined
  const queryParams: ExpenseListParams = view === 'list' ? { status, order: 'desc' } : { status, day, order: 'asc' }
  const query = useInfiniteQuery(expensesQuery(trip.tripId, queryParams))
  const pendingCount = ongoing ? (query.data?.pages[0]?.pendingCount ?? trip.me.pendingCount) : 0

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

  const open = (item: ExpenseListItem) =>
    navigate({ pathname: paths.payment(trip.tripId, item.id), search: location.search }, { state: { fromList: true } })

  return (
    <div className="flex flex-1 flex-col bg-surface">
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
          days={trip.days}
          day={day}
          today={today}
          nowTime={kst(now).time}
          onDayChange={(n) => update((p) => p.set('day', String(n)))}
          onOpen={open}
        />
      )}
      <Outlet />
    </div>
  )
}
