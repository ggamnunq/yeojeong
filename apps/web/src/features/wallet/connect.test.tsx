import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ApiError } from '../../api'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { browser } from '../auth/browser'
import { finConsentIds } from './api'
import { external, writeAttemptContext } from './connect'
import { expireConnections, walletMock } from './mocks'

// 전체 실행 때 lazy 화면·목 응답이 늦을 수 있어 기다림을 늘린다
configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 30_000 })

const where = (router: ReturnType<typeof renderApp>['router']) =>
  `${router.state.location.pathname}${router.state.location.search}`

const POLL_WAIT = { timeout: 9000 }

let go: Mock<(url: string) => void>
let cancel: Mock<() => void>
let openWindow: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // 토스 연결 흐름은 기능 플래그가 켜져 있을 때만(FR-006)
  db.accountLink = true
  sessionStorage.clear()
  go = vi.fn()
  cancel = vi.fn()
  vi.spyOn(browser, 'openPending').mockReturnValue({ go, cancel })
  openWindow = vi.spyOn(external, 'openWindow').mockReturnValue(true)
  vi.spyOn(external, 'assign').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function openAddSheet() {
  fireEvent.click(await screen.findByRole('button', { name: '계좌·카드 추가' }))
  const sheet = await screen.findByRole('dialog', { name: '계좌·카드 추가' })
  expect(within(sheet).getByRole('radio', { name: '토스로 불러오기' })).toBeTruthy()
  fireEvent.click(within(sheet).getByRole('button', { name: '연결' }))
}

describe('토스 연결 흐름(HF-28 → 06 → 07 → 08)', () => {
  it('추가 → 누른 순간 연 창을 인증 주소로 → 대기 → 인증되면 선택 → 연결 → 완료 → 확인으로 지갑', async () => {
    const { router } = renderApp('/wallet')
    await openAddSheet()

    expect(await screen.findByRole('heading', { name: '토스에서 인증 중' })).toBeTruthy()
    expect(where(router)).toBe('/wallet/connect/toss?attempt=attempt-1')
    expect(go).toHaveBeenCalledWith('about:blank')
    expect(router.state.location.state).toEqual({ authUrl: 'about:blank', purpose: 'WALLET_ADD', from: '/wallet' })
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy()
    // 지갑 흐름에는 온보딩 진행 막대가 없다
    expect(screen.queryByRole('progressbar')).toBeNull()

    // 데모: 다음 폴링에서 인증 완료 → WF-07(이미 연결된 3개는 빠진다)
    expect(await screen.findByRole('heading', { name: '불러올 계좌·카드' }, POLL_WAIT)).toBeTruthy()
    const safebox = await screen.findByRole('checkbox', { name: /카카오뱅크 세이프박스/ })
    expect((safebox as HTMLInputElement).checked).toBe(true)
    // 계좌는 앞 4·끝 3자리만
    expect(screen.getByText('3333-****-***-821')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '카드' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '1개 연결' }))

    expect(await screen.findByRole('heading', { name: '연결 완료' })).toBeTruthy()
    expect(screen.getByText('계좌 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    await waitFor(() => expect(where(router)).toBe('/wallet'))
    expect(await screen.findByText('카카오뱅크 세이프박스')).toBeTruthy()
  })

  it('선택 화면: 전체 선택 토글 · 0개면 버튼 비활성 · 계좌 → 카드 묶음 · 카드는 끝 4자리만', async () => {
    for (const p of db.paymentMethods) if (p.userId === db.meUserId) p.status = 'REMOVED'
    walletMock().attempts['attempt-9'] = {
      id: 'attempt-9',
      userId: db.meUserId,
      purpose: 'SIGNUP',
      status: 'AUTHORIZED',
      polls: 2,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      candidates: [
        { candidateId: 'cand-toss-account', type: 'ACCOUNT', institutionName: '토스뱅크', productName: '토스뱅크 통장', maskedNumber: '1000-**-****321', last4: '321', preselected: true },
        { candidateId: 'cand-kakao-safebox', type: 'ACCOUNT', institutionName: '카카오뱅크', productName: '카카오뱅크 세이프박스', maskedNumber: '3333-**-****821', last4: '821', preselected: false },
        { candidateId: 'cand-toss-check', type: 'CARD', institutionName: '토스뱅크', productName: '토스뱅크 체크카드', maskedNumber: '**** **** **** 1934', last4: '1934', preselected: true },
        { candidateId: 'cand-shinhan', type: 'CARD', institutionName: '신한카드', productName: '신한카드 Deep Dream', maskedNumber: '**** **** **** 1102', last4: '1102', preselected: true },
      ],
    }
    const { router } = renderApp('/wallet/connect/select?attempt=attempt-9&returnTo=%2Ftrips')
    expect(await screen.findByRole('button', { name: '3개 연결' })).toBeTruthy()
    // 가입 흐름은 진행 막대 3/4
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3')
    expect(screen.getByText('**** **** **** 1934')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '계좌' })).getAllByRole('checkbox')).toHaveLength(2)
    expect(within(screen.getByRole('group', { name: '카드' })).getAllByRole('checkbox')).toHaveLength(2)

    const all = screen.getByRole('checkbox', { name: '전체 선택' }) as HTMLInputElement
    expect(all.checked).toBe(false)
    fireEvent.click(all)
    expect(screen.getByRole('button', { name: '4개 연결' })).toBeTruthy()
    fireEvent.click(all)
    expect((screen.getByRole('button', { name: '0개 연결' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: /토스뱅크 통장/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /토스뱅크 체크카드/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /신한카드/ }))
    fireEvent.click(screen.getByRole('button', { name: '3개 연결' }))

    expect(await screen.findByText('계좌 1 · 카드 2')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4')
    fireEvent.click(screen.getByRole('button', { name: '여정으로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/wallet/connect/done'))
    expect(router.state.location.pathname.startsWith('/trips')).toBe(true)
  })

  it('연결 만료 → 다시 연결(RECONNECT) → 기존 항목이 미리 체크 → 연결하면 만료가 풀린다', async () => {
    expireConnections()
    const { router } = renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: /토스 연결 만료/ }))
    expect(await screen.findByRole('heading', { name: '토스에서 인증 중' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: '3개 연결' }, POLL_WAIT)).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: /카카오뱅크 세이프박스/ }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '3개 연결' }))
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))
    await waitFor(() => expect(where(router)).toBe('/wallet'))
    expect(await screen.findByRole('button', { name: '동기화' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /토스 연결 만료/ })).toBeNull()
  })
})

describe('금융정보 연동 동의 403 → 시트(W3A HF-05b) → 연결', () => {
  it('연결 요청이 CONSENT_REQUIRED(FIN_*)면 빈 창을 닫고 시트를 연다 → 동의하면 연결 시도 후 WF-06', async () => {
    walletMock().finMissing = ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY']
    const { router } = renderApp('/wallet')
    await openAddSheet()

    const sheet = await screen.findByRole('dialog', { name: '금융정보 연동 동의' })
    expect(cancel).toHaveBeenCalled()
    // 재동의 화면으로 가지 않는다
    expect(router.state.location.pathname).toBe('/wallet')
    const cta = within(sheet).getByRole('button', { name: '동의하고 연결' }) as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    fireEvent.click(await within(sheet).findByRole('checkbox', { name: '전체 동의' }))
    await waitFor(() => expect(cta.disabled).toBe(false))
    fireEvent.click(cta)

    expect(await screen.findByRole('heading', { name: '토스에서 인증 중' })).toBeTruthy()
    expect(walletMock().finMissing).toEqual([])
    expect(router.state.location.state).toMatchObject({ purpose: 'WALLET_ADD', from: '/wallet' })
  })

  it('시트를 닫으면 연결 시도 없이 지갑에 남는다', async () => {
    walletMock().finMissing = ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY']
    const { router } = renderApp('/wallet')
    await openAddSheet()
    const sheet = await screen.findByRole('dialog', { name: '금융정보 연동 동의' })
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '금융정보 연동 동의' })).toBeNull())
    expect(router.state.location.pathname).toBe('/wallet')
    expect(Object.keys(walletMock().attempts)).toHaveLength(0)
  })

  it('finConsentIds: 서버 형식(missing + required 객체)·가입 항목 섞임', () => {
    const err = (details: Record<string, unknown>) =>
      new ApiError({ code: 'CONSENT_REQUIRED', message: '', status: 403, details })
    expect(finConsentIds(err({ missing: ['FIN_LINK'], required: [{ id: 'FIN_LINK', version: '2026-11-01' }] }))).toEqual(['FIN_LINK'])
    expect(finConsentIds(err({ required: [{ id: 'THIRD_PARTY', version: '1' }] }))).toEqual(['THIRD_PARTY'])
    expect(finConsentIds(err({ missing: ['TOS', 'FIN_LINK'] }))).toBeNull()
    expect(finConsentIds(new ApiError({ code: 'NOT_FOUND', message: '', status: 404 }))).toBeNull()
  })
})

describe('토스 인증 대기(HF-06)', () => {
  it('가입 시트가 넘긴 location.state: 「토스 다시 열기」는 authUrl, ✕는 from(가입 흐름은 진행 막대 3/4)', async () => {
    const { router } = renderApp('/wallet')
    await screen.findByRole('heading', { name: '지갑' })
    await router.navigate('/wallet/connect/toss?attempt=attempt-signup-1', {
      state: { authUrl: 'https://toss.example/auth', purpose: 'SIGNUP', from: '/signup/wallet' },
    })
    expect(await screen.findByRole('heading', { name: '토스에서 인증 중' })).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3')
    expect(openWindow).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '토스 다시 열기' }))
    expect(openWindow).toHaveBeenCalledWith('https://toss.example/auth', 'yj-toss-auth')
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/signup/wallet'))
  })

  it('시도가 만료(410)되면 "연결 시간이 지났어요" + 「다시 연결」로 새 시도를 만든다', async () => {
    server.use(http.get('/api/payment-connections/attempts/attempt-7', () => mockError('ATTEMPT_EXPIRED', 410)))
    writeAttemptContext('attempt-7', { purpose: 'WALLET_ADD', from: '/wallet', opened: true })
    const { router } = renderApp('/wallet/connect/toss?attempt=attempt-7')
    expect(await screen.findByRole('heading', { name: '연결 시간이 지났어요' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 연결' }))
    await waitFor(() => expect(where(router)).toBe('/wallet/connect/toss?attempt=attempt-1'))
    expect(go).toHaveBeenCalledWith('about:blank')
    expect(await screen.findByRole('heading', { name: '토스에서 인증 중' })).toBeTruthy()
  })

  it('콜백이 사용자 취소(?error=cancelled)를 알리면 토스트 없이 진입 화면으로', async () => {
    writeAttemptContext('attempt-8', { purpose: 'WALLET_ADD', from: '/wallet', opened: true })
    const { router } = renderApp('/wallet/connect/toss?attempt=attempt-8&error=cancelled')
    await waitFor(() => expect(where(router)).toBe('/wallet'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
