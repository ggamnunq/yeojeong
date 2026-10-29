import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { keys, type ExpenseListParams } from '../../../api'
import { useAccountLink } from '../../../app/features'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { useTripDetail } from '../../../app/trip'
import { Callout, Icon } from '../../../ds'
import { FinConsentSheet } from '../../auth/components/FinConsentSheet'
import { paymentMethodsQuery } from '../../wallet/api'
import { useManualSync } from '../../wallet/useManualSync'
import { useTossConnect } from '../../wallet/useTossConnect'
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
  // 토스 연결 기능(FR-006). 꺼져 있으면 연결 만료 Callout·기간 외 결제·동기화가 없다
  const accountLink = useAccountLink()

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
  const methods = useQuery({
    ...paymentMethodsQuery(),
    enabled: accountLink && ongoing && trip.me.connectionExpired,
  })
  const expiredConnection = methods.data?.connections.find((connection) => connection.status === 'EXPIRED')
  const connect = useTossConnect()
  const touchStart = useRef<number | null>(null)
  // 놓을 때는 마지막 touchmove 값을 읽는다(touchmove 렌더가 끝나기 전에 touchend가 와도 같은 판정)
  const pulled = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const queryClient = useQueryClient()
  // 당겨서 새로고침 = 수동 동기화(진행 중만). 202면 끝날 때까지 스피너 → 목록·배너(여정 상세) 재조회. 429는 토스트 없이 재조회만
  const sync = useManualSync(() => queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId) }))
  // 토스 연결이 꺼져 있으면 당겨서 새로고침 = 목록·배너 재조회만(동기화 요청 없음, FR-006 AC3)
  const reload = useMutation({ mutationFn: () => queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId) }) })
  const refreshing = accountLink ? sync.isPending : reload.isPending
  const refresh = () => (accountLink ? sync.mutate() : reload.mutate())
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
    <div
      className="flex flex-1 flex-col bg-surface"
      onTouchStart={(event) => {
        if (!ongoing || window.scrollY > 0 || refreshing) return
        touchStart.current = event.touches[0]?.clientY ?? null
      }}
      onTouchMove={(event) => {
        if (touchStart.current === null) return
        pulled.current = Math.min(80, Math.max(0, (event.touches[0]?.clientY ?? touchStart.current) - touchStart.current))
        setPullDistance(pulled.current)
      }}
      onTouchEnd={() => {
        if (ongoing && pulled.current >= 56 && !refreshing) refresh()
        touchStart.current = null
        pulled.current = 0
        setPullDistance(0)
      }}
    >
      {/* 당겨서 새로고침 표시는 스피너만(글자 없음, 화면명세 0-6 v0.5.8). 당기는 만큼 돌고, 동기화 중이면 계속 돈다 */}
      {ongoing && (pullDistance > 0 || refreshing) && (
        <div role="status" aria-label={refreshing ? '새로고침 중' : '당겨서 새로고침'} className="flex h-10 items-center justify-center">
          <span
            className={clsx('grid', refreshing && 'animate-spin motion-reduce:animate-none')}
            style={refreshing ? undefined : { transform: `rotate(${Math.round((pullDistance / 56) * 270)}deg)` }}
          >
            <Icon name="refresh" size={20} className={pullDistance >= 56 || refreshing ? 'text-icon-brand' : 'text-icon-subtle'} />
          </span>
        </div>
      )}
      {accountLink && ongoing && trip.me.connectionExpired && (
        <div className="px-gutter pt-2">
          <Callout
            tone="disconnected"
            style="tone"
            label="토스 연결 만료"
            disabled={!expiredConnection || connect.isPending}
            onClick={() =>
              expiredConnection &&
              connect.start({
                purpose: 'RECONNECT',
                reconnectConnectionId: expiredConnection.id,
                from: `${location.pathname}${location.search}`,
                returnTo: `${location.pathname}${location.search}`,
              })
            }
          />
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
        <ListView query={query} onOpen={open} onAddOutOfPeriod={accountLink && ongoing ? () => navigate(paths.outOfPeriod(trip.tripId)) : undefined} />
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
      {connect.consentSheet && <FinConsentSheet {...connect.consentSheet} />}
    </div>
  )
}
