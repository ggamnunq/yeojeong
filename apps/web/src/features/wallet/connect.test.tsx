import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { finConsentIds } from './api'
import { external, writeAttemptContext } from './connect'
import { expireConnections, walletMock } from './mocks'
import { ApiError } from '../../api'

const where = (router: ReturnType<typeof renderApp>['router']) =>
  `${router.state.location.pathname}${router.state.location.search}`

const POLL_WAIT = { timeout: 4000 }

let openWindow: ReturnType<typeof vi.spyOn>
let assign: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  sessionStorage.clear()
  openWindow = vi.spyOn(external, 'openWindow').mockReturnValue(true)
  assign = vi.spyOn(external, 'assign').mockImplementation(() => {})
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
  it('추가 → 인증 창을 열고 대기 → 인증되면 선택 → 연결 → 완료 → 확인으로 지갑', async () => {
    const { router } = renderApp('/wallet')
    await openAddSheet()

    expect(await screen.findByRole('heading', { name: '토스에서 인증 중' })).toBeTruthy()
    expect(where(router)).toBe('/wallet/connect/toss?attempt=attempt-1')
    expect(openWindow).toHaveBeenCalledWith('/wallet/connect/select?attempt=attempt-1', 'yj-toss-auth')
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy()
    // 지갑 흐름에는 온보딩 진행 막대가 없다
    expect(screen.queryByRole('progressbar')).toBeNull()

    // 데모: 다음 폴링에서 인증 완료 → WF-07(이미 연결된 3개는 빠진다)
    expect(await screen.findByRole('heading', { name: '불러올 계좌·카드' }, POLL_WAIT)).toBeTruthy()
    const safebox = await screen.findByRole('checkbox', { name: /카카오뱅크 세이프박스/ })
    expect((safebox as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByRole('group', { name: '카드' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '1개 연결' }))

    expect(await screen.findByRole('heading', { name: '연결 완료' })).toBeTruthy()
    expect(screen.getByText('계좌 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    await waitFor(() => expect(where(router)).toBe('/wallet'))
    expect(await screen.findByText('카카오뱅크 세이프박스')).toBeTruthy()
  }, 10_000)

  it('선택 화면: 전체 선택 토글 · 0개면 버튼 비활성 · 계좌 → 카드 묶음', async () => {
    for (const p of db.paymentMethods) if (p.userId === db.meUserId) p.status = 'REMOVED'
    walletMock().attempts['attempt-9'] = {
      id: 'attempt-9',
      userId: db.meUserId,
      purpose: 'SIGNUP',
      status: 'AUTHORIZED',
      polls: 2,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      candidates: [
        { candidateId: 'cand-toss-account', type: 'ACCOUNT', institutionName: '토스뱅크', productName: '토스뱅크 통장', maskedNumber: '1000-12**-**21', last4: '21', preselected: true },
        { candidateId: 'cand-kakao-safebox', type: 'ACCOUNT', institutionName: '카카오뱅크', productName: '카카오뱅크 세이프박스', maskedNumber: '3333-**-****821', last4: '821', preselected: false },
        { candidateId: 'cand-toss-check', type: 'CARD', institutionName: '토스뱅크', productName: '토스뱅크 체크카드', maskedNumber: '5365-****-****-1934', last4: '1934', preselected: true },
        { candidateId: 'cand-shinhan', type: 'CARD', institutionName: '신한카드', productName: '신한카드 Deep Dream', maskedNumber: '4518-****-****-1102', last4: '1102', preselected: true },
      ],
    }
    const { router } = renderApp('/wallet/connect/select?attempt=attempt-9&returnTo=%2Ftrips')
    expect(await screen.findByRole('button', { name: '3개 연결' })).toBeTruthy()
    // 가입 흐름은 진행 막대 3/4
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3')
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
  }, 10_000)
})

describe('금융정보 연동 동의 403 → 시트 → 재시도', () => {
  it('연결 요청이 CONSENT_REQUIRED(FIN_*)면 시트를 열고, 3개 모두 체크해 동의하면 같은 요청을 다시 보낸다', async () => {
    walletMock().finConsent = false
    const { router } = renderApp('/wallet')
    await openAddSheet()

    const sheet = await screen.findByRole('dialog', { name: '금융정보 연동 동의' })
    const cta = within(sheet).getByRole('button', { name: '동의하고 연결' }) as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    // 재동의 화면으로 가지 않는다
    expect(router.state.location.pathname).toBe('/wallet')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: '[필수] 금융정보 연동 약관' }))
    expect(cta.disabled).toBe(true)
    fireEvent.click(within(sheet).getByRole('checkbox', { name: '전체 동의' }))
    await waitFor(() => expect(cta.disabled).toBe(false))
    fireEvent.click(cta)

    expect(await screen.findByRole('heading', { name: '토스에서 인증 중' })).toBeTruthy()
    expect(walletMock().finConsent).toBe(true)
  })

  it('시트를 닫으면 연결 시도 없이 지갑에 남는다', async () => {
    walletMock().finConsent = false
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
  it('팝업이 막히면 같은 창으로 인증 주소를 연다 · ✕는 진입 화면으로', async () => {
    openWindow.mockReturnValue(false)
    const { router } = renderApp('/wallet')
    await openAddSheet()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/wallet/connect/select?attempt=attempt-1'))
    fireEvent.click(await screen.findByRole('button', { name: '닫기' }))
    await waitFor(() => expect(where(router)).toBe('/wallet'))
  })

  it('"토스 다시 열기"는 같은 인증 주소를 새 창으로 연다', async () => {
    walletMock().attempts['attempt-5'] = {
      id: 'attempt-5',
      userId: db.meUserId,
      purpose: 'SIGNUP',
      status: 'WAITING',
      polls: -100,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      candidates: [],
    }
    writeAttemptContext('attempt-5', { purpose: 'SIGNUP', authUrl: 'https://toss.example/auth', opened: true })
    renderApp('/wallet/connect/toss?attempt=attempt-5')
    expect(await screen.findByRole('heading', { name: '토스에서 인증 중' })).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3')
    expect(openWindow).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '토스 다시 열기' }))
    expect(openWindow).toHaveBeenCalledWith('https://toss.example/auth', 'yj-toss-auth')
  })

  it('시도가 만료(410)되면 진입 화면으로 돌아가며 "다시 시도해 주세요"', async () => {
    server.use(http.get('/api/payment-connections/attempts/:attemptId', () => mockError('ATTEMPT_EXPIRED', 410)))
    writeAttemptContext('attempt-7', { purpose: 'WALLET_ADD', opened: true })
    const { router } = renderApp('/wallet/connect/toss?attempt=attempt-7')
    expect(await screen.findByText('다시 시도해 주세요')).toBeTruthy()
    await waitFor(() => expect(where(router)).toBe('/wallet'))
  })
})
