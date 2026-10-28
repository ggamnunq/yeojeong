import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, TRIP } from '../mocks/data'
import { renderApp, renderWithProviders } from '../test/render'
import { readLastTripId, rememberTripId, useCurrentTrip } from './trip'

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname

describe('진입 라우팅(/)', () => {
  it('마지막으로 본 진행 중 여정의 결제내역으로', async () => {
    const { router } = renderApp('/')
    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/payments'))
  })

  it('이 기기에서 마지막으로 본 여정이 먼저', async () => {
    rememberTripId(TRIP.jeju)
    const { router } = renderApp('/')
    await waitFor(() => expect(path(router)).toBe('/trips/trip-jeju/settlement'))
  })

  it('소속 여정이 없으면 /trips', async () => {
    db.memberships = db.memberships.filter((m) => m.userId !== db.meUserId)
    const { router } = renderApp('/')
    await waitFor(() => expect(path(router)).toBe('/trips'))
  })

  it('미로그인이면 /login', async () => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp('/')
    await waitFor(() => expect(path(router)).toBe('/login'))
  })
})

describe('RequireTrip · 단계별 기본 탭', () => {
  it('/trips/:tripId는 단계별 기본 탭으로', async () => {
    const upcoming = renderApp('/trips/trip-busan')
    await waitFor(() => expect(path(upcoming.router)).toBe('/trips/trip-busan/info'))
    upcoming.unmount()
    const ended = renderApp('/trips/trip-jeju')
    await waitFor(() => expect(path(ended.router)).toBe('/trips/trip-jeju/settlement'))
  })

  it('잠긴 탭·이 단계에 없는 탭 주소는 기본 탭으로', async () => {
    const locked = renderApp('/trips/trip-busan/payments')
    await waitFor(() => expect(path(locked.router)).toBe('/trips/trip-busan/info'))
    locked.unmount()
    const ended = renderApp('/trips/trip-jeju/stats')
    await waitFor(() => expect(path(ended.router)).toBe('/trips/trip-jeju/settlement'))
  })

  it('멤버가 아닌 여정(404)이면 진입 라우팅으로 가고 기억도 지운다', async () => {
    rememberTripId('trip-unknown')
    const { router } = renderApp('/trips/trip-unknown/payments')
    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/payments'))
    expect(readLastTripId()).toBe(TRIP.osaka)
  })

  it('연 여정을 이 기기에 기억한다', async () => {
    renderApp('/trips/trip-busan/info')
    await screen.findByRole('heading', { name: '여정 정보' })
    expect(readLastTripId()).toBe(TRIP.busan)
  })
})

describe('AppShell', () => {
  it('헤더에 그룹명, 하단에 단계별 탭', async () => {
    renderApp('/trips/trip-jeju/settlement')
    expect(await screen.findByRole('button', { name: /제주 우정여행/ })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: '여정 메뉴' })
    expect(nav.textContent).toContain('정산')
    expect(screen.getByRole('button', { name: '정산' }).getAttribute('aria-current')).toBe('page')
  })

  it('탭을 누르면 이동하고, 잠긴 탭은 그대로', async () => {
    const ongoing = renderApp('/trips/trip-osaka/payments')
    fireEvent.click(await screen.findByRole('button', { name: '현황' }))
    await waitFor(() => expect(path(ongoing.router)).toBe('/trips/trip-osaka/stats'))
    ongoing.unmount()

    const upcoming = renderApp('/trips/trip-busan/info')
    fireEvent.click(await screen.findByRole('button', { name: '결제내역' }))
    expect(path(upcoming.router)).toBe('/trips/trip-busan/info')
  })

  it('지갑·마이 버튼', async () => {
    const { router } = renderApp('/trips/trip-osaka/info')
    fireEvent.click(await screen.findByRole('button', { name: '지갑' }))
    await waitFor(() => expect(path(router)).toBe('/wallet'))
  })
})

describe('useCurrentTrip', () => {
  function Probe() {
    const { tripId, trip, isPending } = useCurrentTrip()
    if (isPending) return <p>loading</p>
    return <p>{tripId ? `${tripId}:${trip?.groupName}` : 'none'}</p>
  }

  it('URL :tripId가 먼저', async () => {
    renderWithProviders(<Probe />, { route: '/trips/trip-busan/info', path: '/trips/:tripId/*' })
    expect(await screen.findByText('trip-busan:부산 연말 모임')).toBeTruthy()
  })

  it('URL에 없으면 기억한 여정 → 진입 라우팅 규칙', async () => {
    rememberTripId(TRIP.jeju)
    renderWithProviders(<Probe />, { route: '/wallet' })
    expect(await screen.findByText('trip-jeju:제주 우정여행')).toBeTruthy()
  })

  it('소속 여정이 없으면 null', async () => {
    db.memberships = []
    renderWithProviders(<Probe />, { route: '/me' })
    expect(await screen.findByText('none')).toBeTruthy()
  })
})
