import { screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiFetch, keys } from '../api'
import { db } from '../mocks/data'
import { server } from '../mocks/server'
import { mockError } from '../mocks/utils'
import { renderApp } from '../test/render'

const where = (router: ReturnType<typeof renderApp>['router']) =>
  `${router.state.location.pathname}${router.state.location.search}`

describe('RequireAuth', () => {
  it('미로그인이면 /login?returnTo=원래 주소', async () => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp('/wallet')
    await waitFor(() => expect(where(router)).toBe('/login?returnTo=%2Fwallet'))
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeTruthy()
  })

  it('가입 중(SIGNUP_REQUIRED)이면 닉네임 단계로', async () => {
    db.session = 'SIGNUP_REQUIRED'
    const { router } = renderApp('/me')
    await waitFor(() => expect(where(router)).toBe('/signup/nickname'))
  })

  it('세션 확인이 CONSENT_REQUIRED면 /reconsent?required=…&returnTo=…', async () => {
    db.consentRequired = ['TOS', 'PRIVACY']
    const { router } = renderApp('/me')
    await waitFor(() => expect(where(router)).toBe('/reconsent?required=TOS%2CPRIVACY&returnTo=%2Fme'))
  })

  it('로그인이면 그대로 연다', async () => {
    const { router } = renderApp('/me')
    expect(await screen.findByRole('heading', { name: '마이페이지' })).toBeTruthy()
    expect(where(router)).toBe('/me')
  })
})

describe('RequireGuest · RequireSignup', () => {
  it('로그인 상태로 /login이면 returnTo로 보낸다', async () => {
    const { router } = renderApp('/login?returnTo=%2Fme')
    await waitFor(() => expect(where(router)).toBe('/me'))
  })

  it('returnTo가 다른 origin이면 무시하고 진입 라우팅으로', async () => {
    const { router } = renderApp('/login?returnTo=%2F%2Fevil.com')
    await waitFor(() => expect(router.state.location.pathname).toBe('/trips/trip-osaka/payments'))
  })

  it('가입 단계 화면은 가입 티켓이 있을 때만', async () => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp('/signup/terms')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('가입 티켓이 있으면 /login 대신 닉네임 단계로', async () => {
    db.session = 'SIGNUP_REQUIRED'
    const { router } = renderApp('/login')
    await waitFor(() => expect(where(router)).toBe('/signup/nickname'))
    expect(await screen.findByRole('heading', { name: '닉네임' })).toBeTruthy()
  })
})

describe('SessionBridge', () => {
  it('어떤 API든 401이면 캐시를 비우고 /login?returnTo=지금 주소', async () => {
    const { router, queryClient } = renderApp('/trips/trip-osaka/payments')
    await screen.findByRole('heading', { name: '결제내역' })

    db.session = 'ANONYMOUS'
    server.use(http.get('/api/trips/:tripId', () => mockError('UNAUTHENTICATED', 401)))
    await queryClient.refetchQueries({ queryKey: keys.trips.detail('trip-osaka') })

    await waitFor(() => expect(where(router)).toBe('/login?returnTo=%2Ftrips%2Ftrip-osaka%2Fpayments'))
    expect(queryClient.getQueryData(keys.trips.detail('trip-osaka'))).toBeUndefined()
  })

  it('다른 API가 가입 동의 CONSENT_REQUIRED면 재동의 화면으로(토스트 없음)', async () => {
    const { router, queryClient } = renderApp('/trips/trip-osaka/info')
    await screen.findByRole('heading', { name: '여정 정보' })

    server.use(http.get('/api/trips/:tripId', () => mockError('CONSENT_REQUIRED', 403, { required: ['TOS'] })))
    await queryClient.refetchQueries({ queryKey: keys.trips.detail('trip-osaka') })

    await waitFor(() => expect(router.state.location.pathname).toBe('/reconsent'))
    expect(router.state.location.search).toBe('?required=TOS&returnTo=%2Ftrips%2Ftrip-osaka%2Finfo')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('연동 동의(FIN_*)만 빠졌으면 이동하지 않는다(지갑 화면이 시트로 받는다)', async () => {
    const { router, queryClient } = renderApp('/trips/trip-osaka/info')
    await screen.findByRole('heading', { name: '여정 정보' })

    server.use(http.get('/api/me/trips', () => mockError('CONSENT_REQUIRED', 403, { required: ['FIN_LINK'] })))
    await expect(queryClient.fetchQuery({ queryKey: ['probe'], queryFn: () => apiFetch('/me/trips') })).rejects.toThrow()
    expect(router.state.location.pathname).toBe('/trips/trip-osaka/info')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
