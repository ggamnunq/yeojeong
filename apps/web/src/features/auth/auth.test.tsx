import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { keys, type SessionResponse } from '../../api'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { toastStore } from '../../notifications/store'
import { renderApp } from '../../test/render'
import { browser } from './browser'

type Router = ReturnType<typeof renderApp>['router']
const where = (router: Router) => `${router.state.location.pathname}${router.state.location.search}`

/** 요청 본문을 기록하고 원래 목으로 넘긴다 */
function record(method: 'post', path: string) {
  const bodies: unknown[] = []
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.clone().json())
    }),
  )
  return bodies
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const checkbox = (name: string | RegExp) => screen.getByRole('checkbox', { name })

// lazy 화면을 미리 변환해 둔다(전체 실행 중 첫 테스트가 findBy 기본 1초를 넘기지 않게)
beforeAll(async () => {
  await Promise.all([
    import('./pages/LoginPage'),
    import('./pages/NicknamePage'),
    import('./pages/TermsPage'),
    import('./pages/SignupWalletPage'),
    import('./pages/ReconsentPage'),
  ])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('WF-02 로그인', () => {
  it('카카오 로그인은 /api/auth/kakao로 최상위 이동한다(returnTo 유지)', async () => {
    db.session = 'ANONYMOUS'
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {})
    renderApp('/login?returnTo=%2Ftrips%2Ftrip-osaka%2Fstats')

    expect(await screen.findByRole('heading', { name: '로그인' })).toBeTruthy()
    expect(screen.getByText('함께 쓰고, 정확히 나누는 여행 공동 지갑')).toBeTruthy()
    expect(screen.getByRole('link', { name: '개인정보처리방침' }).getAttribute('href')).toBe('/privacy')
    // 로그인은 뒤로·진행 막대가 없다
    expect(screen.queryByRole('button', { name: '뒤로 가기' })).toBeNull()

    fireEvent.click(button('카카오 로그인'))
    expect(assign).toHaveBeenCalledWith('/api/auth/kakao?returnTo=%2Ftrips%2Ftrip-osaka%2Fstats')
    expect((button('카카오 로그인') as HTMLButtonElement).disabled).toBe(true)
  })

  it('다른 origin returnTo는 버린다', async () => {
    db.session = 'ANONYMOUS'
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {})
    renderApp('/login?returnTo=%2F%2Fevil.com')
    fireEvent.click(await screen.findByRole('button', { name: '카카오 로그인' }))
    expect(assign).toHaveBeenCalledWith('/api/auth/kakao')
  })

  it('?error=failed면 오류 토스트, cancelled면 아무 표시 없이 주소만 정리한다', async () => {
    db.session = 'ANONYMOUS'
    const failed = renderApp('/login?error=failed&returnTo=%2Fme')
    expect((await screen.findByRole('alert')).textContent).toContain('잠시 후 다시 시도해 주세요')
    await waitFor(() => expect(where(failed.router)).toBe('/login?returnTo=%2Fme'))
    failed.unmount()
    toastStore.clear()

    const cancelled = renderApp('/login?error=cancelled')
    await waitFor(() => expect(where(cancelled.router)).toBe('/login'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('목 모드에서는 fetch로 카카오 로그인을 흉내 내고 가입 단계로 간다', async () => {
    vi.stubEnv('VITE_MOCK_API', '1')
    db.session = 'ANONYMOUS'
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {})
    const { router } = renderApp('/login')
    fireEvent.click(await screen.findByRole('button', { name: '카카오 로그인' }))
    await waitFor(() => expect(where(router)).toBe('/signup/nickname'))
    expect(assign).not.toHaveBeenCalled()
  })
})

/** 가입 티켓 상태로 닉네임 화면을 연다 */
async function openNickname() {
  db.session = 'SIGNUP_REQUIRED'
  const app = renderApp('/signup/nickname')
  const input = (await screen.findByRole('textbox', { name: '닉네임' })) as HTMLInputElement
  return { ...app, input }
}

/** 닉네임 → 약관 화면까지 */
async function openTerms() {
  const app = await openNickname()
  fireEvent.click(button('다음'))
  await screen.findByRole('heading', { name: '약관에 동의해 주세요' })
  await screen.findByRole('checkbox', { name: '[필수] 서비스 이용약관' })
  return app
}

describe('WF-03 닉네임', () => {
  it('카카오 닉네임으로 미리 채우고 카운터를 보인다', async () => {
    const { input } = await openNickname()
    expect(screen.getByRole('heading', { name: '닉네임' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '닉네임을 알려 주세요' })).toBeTruthy()
    expect(input.value).toBe('준용')
    expect(screen.getByText('중복 가능 · 2/10')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1')
  })

  it('비었거나 공백뿐이면 다음이 비활성, 10자를 넘으면 더 들어가지 않고 줄바꿈은 지운다', async () => {
    const { input } = await openNickname()
    const next = button('다음') as HTMLButtonElement
    fireEvent.change(input, { target: { value: '   ' } })
    expect(next.disabled).toBe(true)

    fireEvent.change(input, { target: { value: '가나다라마바사아자차카타' } })
    expect(input.value).toBe('가나다라마바사아자차')
    expect(screen.getByText('중복 가능 · 10/10')).toBeTruthy()

    fireEvent.change(input, { target: { value: '민\n지' } })
    expect(input.value).toBe('민지')
    expect(next.disabled).toBe(false)
  })

  it('✕는 입력을 비우고 포커스를 둔다', async () => {
    const { input } = await openNickname()
    input.focus()
    fireEvent.click(button('입력 지우기'))
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect((button('다음') as HTMLButtonElement).disabled).toBe(true)
  })

  it('다음 → 약관 화면(닉네임은 화면 상태로), 뒤로 오면 입력값 유지', async () => {
    const { input, router } = await openNickname()
    fireEvent.change(input, { target: { value: ' 민지 ' } })
    fireEvent.click(button('다음'))
    await waitFor(() => expect(where(router)).toBe('/signup/terms'))
    expect(router.state.location.state).toMatchObject({ nickname: '민지' })

    await screen.findByRole('heading', { name: '약관에 동의해 주세요' })
    fireEvent.click(button('뒤로 가기'))
    await waitFor(() => expect(where(router)).toBe('/signup/nickname'))
    expect(((await screen.findByRole('textbox', { name: '닉네임' })) as HTMLInputElement).value).toBe('민지')
  })

  it('‹는 가입 티켓을 지우고 로그인으로', async () => {
    const { router } = await openNickname()
    fireEvent.click(button('뒤로 가기'))
    await waitFor(() => expect(where(router)).toBe('/login'))
    expect(db.session).toBe('ANONYMOUS')
  })
})

describe('WF-04 약관 동의', () => {
  it('닉네임 없이 들어오면 닉네임 단계로', async () => {
    db.session = 'SIGNUP_REQUIRED'
    const { router } = renderApp('/signup/terms')
    await waitFor(() => expect(where(router)).toBe('/signup/nickname'))
  })

  it('필수 3행만, AGE14는 › 없음, 마케팅 없음', async () => {
    await openTerms()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2')
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['[필수] 서비스 이용약관', '[필수] 개인정보 수집·이용', '[필수] 만 14세 이상입니다'])
    expect(screen.queryByText(/마케팅/)).toBeNull()
    expect(screen.getByRole('link', { name: '서비스 이용약관 전문' }).getAttribute('href')).toBe('/terms')
    expect(screen.getByRole('link', { name: '개인정보 수집·이용 전문' }).getAttribute('href')).toBe('/consents/PRIVACY')
    expect(screen.queryByRole('link', { name: /만 14세/ })).toBeNull()
    expect(screen.getByRole('link', { name: '개인정보처리방침' }).getAttribute('href')).toBe('/privacy')
  })

  it('전체 동의는 3행을 함께 켜고 끄고, 하나를 풀면 전체 동의도 풀린다. 3행 모두 켜야 다음', async () => {
    await openTerms()
    const next = button('다음') as HTMLButtonElement
    const all = checkbox('전체 동의') as HTMLInputElement
    expect(next.disabled).toBe(true)

    fireEvent.click(all)
    await waitFor(() => expect(next.disabled).toBe(false))
    for (const name of ['[필수] 서비스 이용약관', '[필수] 개인정보 수집·이용', '[필수] 만 14세 이상입니다']) {
      expect((checkbox(name) as HTMLInputElement).checked).toBe(true)
    }

    fireEvent.click(checkbox('[필수] 만 14세 이상입니다'))
    await waitFor(() => expect(all.checked).toBe(false))
    expect(next.disabled).toBe(true)

    fireEvent.click(checkbox('[필수] 만 14세 이상입니다'))
    await waitFor(() => expect(all.checked).toBe(true))

    fireEvent.click(all)
    await waitFor(() => expect((checkbox('[필수] 서비스 이용약관') as HTMLInputElement).checked).toBe(false))
    expect(next.disabled).toBe(true)
  })

  it('전문을 보고 돌아오면 체크가 남는다', async () => {
    const { router } = await openTerms()
    fireEvent.click(checkbox('[필수] 서비스 이용약관'))
    await waitFor(() => expect((checkbox('[필수] 서비스 이용약관') as HTMLInputElement).checked).toBe(true))
    fireEvent.click(screen.getByRole('link', { name: '서비스 이용약관 전문' }))
    await waitFor(() => expect(where(router)).toBe('/terms'))
    await router.navigate(-1)
    expect(((await screen.findByRole('checkbox', { name: '[필수] 서비스 이용약관' })) as HTMLInputElement).checked).toBe(true)
  })

  it('다음 → 가입(닉네임 + 동의 3행 + method) → WF-05, 세션은 로그인 상태', async () => {
    const signup = record('post', '/api/auth/signup')
    const { router, queryClient } = await openTerms()
    fireEvent.click(checkbox('전체 동의'))
    await waitFor(() => expect((button('다음') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button('다음'))

    await waitFor(() => expect(where(router)).toBe('/signup/wallet'))
    expect(await screen.findByRole('heading', { name: '토스 지갑을 연결해 주세요' })).toBeTruthy()
    expect(signup[0]).toEqual({
      nickname: '준용',
      method: 'ALL',
      agreements: [
        { consentId: 'TOS', version: '0.1-draft', agreed: true },
        { consentId: 'PRIVACY', version: '0.1-draft', agreed: true },
        { consentId: 'AGE14', version: '0.1-draft', agreed: true },
      ],
    })
    expect(queryClient.getQueryData<SessionResponse>(keys.session)?.status).toBe('AUTHENTICATED')
  })

  it('행을 하나씩 체크하면 method INDIVIDUAL', async () => {
    const signup = record('post', '/api/auth/signup')
    const { router } = await openTerms()
    for (const name of ['[필수] 서비스 이용약관', '[필수] 개인정보 수집·이용', '[필수] 만 14세 이상입니다']) {
      fireEvent.click(checkbox(name))
      await waitFor(() => expect((checkbox(name) as HTMLInputElement).checked).toBe(true))
    }
    fireEvent.click(button('다음'))
    await waitFor(() => expect(where(router)).toBe('/signup/wallet'))
    expect(signup[0]).toMatchObject({ method: 'INDIVIDUAL' })
  })

  it('서버가 닉네임을 거절하면(VALIDATION_FAILED) 닉네임 화면에 오류를 보인다', async () => {
    server.use(
      http.post('/api/auth/signup', () =>
        mockError('VALIDATION_FAILED', 400, {
          fields: [{ path: 'nickname', code: 'INVALID_CHARACTER', message: '닉네임에 쓸 수 없는 문자가 있어요' }],
        }),
      ),
    )
    const { router } = await openTerms()
    fireEvent.click(checkbox('전체 동의'))
    await waitFor(() => expect((button('다음') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button('다음'))

    await waitFor(() => expect(where(router)).toBe('/signup/nickname'))
    const input = (await screen.findByRole('textbox', { name: '닉네임' })) as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('닉네임에 쓸 수 없는 문자가 있어요')).toBeTruthy()
    expect(input.value).toBe('준용')
  })

  it('가입 티켓이 만료되면(401) 로그인으로', async () => {
    const { router } = await openTerms()
    db.session = 'ANONYMOUS'
    fireEvent.click(checkbox('전체 동의'))
    await waitFor(() => expect((button('다음') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button('다음'))
    await waitFor(() => expect(where(router)).toBe('/login'))
    expect((await screen.findByRole('alert')).textContent).toContain('가입 시간이 지났어요')
  })
})

describe('WF-05 토스 지갑 연동 안내 · WF-05b 연동 동의 시트', () => {
  it('안내 화면: 진행 3, 라벨 2, 나중에 → 진입 라우팅', async () => {
    const { router } = renderApp('/signup/wallet')
    expect(await screen.findByRole('heading', { name: '토스 지갑을 연결해 주세요' })).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3')
    expect(screen.getByText('조회 전용')).toBeTruthy()
    expect(screen.getByText('내 결제는 비공개')).toBeTruthy()
    fireEvent.click(button('나중에'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/trips/trip-osaka/payments'))
  })

  it('로그인 안 했으면 로그인으로', async () => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp('/signup/wallet')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('토스로 연결 → 시트(필수 3행) → 동의하고 연결 → 동의 저장 → 연결 시도 → WF-06', async () => {
    const consents = record('post', '/api/consents')
    const connections = record('post', '/api/payment-connections')
    const go = vi.fn()
    const cancel = vi.fn()
    vi.spyOn(browser, 'openPending').mockReturnValue({ go, cancel })
    const { router } = renderApp('/signup/wallet')

    fireEvent.click(await screen.findByRole('button', { name: '토스로 연결' }))
    const sheet = await screen.findByRole('dialog', { name: '금융정보 연동 동의' })
    await within(sheet).findByRole('checkbox', { name: '[필수] 금융정보 연동 약관' })
    expect(within(sheet).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '[필수] 금융정보 연동 약관',
      '[필수] 금융정보 수집·이용',
      '[필수] 공동 결제 그룹 공개',
    ])
    expect(within(sheet).getByRole('link', { name: '공동 결제 그룹 공개 전문' }).getAttribute('href')).toBe(
      '/consents/THIRD_PARTY',
    )

    const cta = within(sheet).getByRole('button', { name: '동의하고 연결' }) as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    fireEvent.click(within(sheet).getByRole('checkbox', { name: '전체 동의' }))
    await waitFor(() => expect(cta.disabled).toBe(false))
    fireEvent.click(cta)

    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/connect/toss'))
    expect(router.state.location.search).toBe('?attempt=attempt-signup-1')
    expect(router.state.location.state).toEqual({ authUrl: 'about:blank', purpose: 'SIGNUP', from: '/signup/wallet' })
    expect(go).toHaveBeenCalledWith('about:blank')
    expect(cancel).not.toHaveBeenCalled()
    expect(consents[0]).toMatchObject({ stage: 'FIN_LINK', screen: 'WF-05', method: 'ALL' })
    expect(connections[0]).toEqual({ provider: 'TOSS', purpose: 'SIGNUP' })
  })

  it('동의 저장이 실패하면 시트에 머물고 연결 시도를 만들지 않는다', async () => {
    server.use(http.post('/api/consents', () => mockError('INTERNAL_ERROR', 500)))
    const connections = record('post', '/api/payment-connections')
    const cancel = vi.fn()
    vi.spyOn(browser, 'openPending').mockReturnValue({ go: vi.fn(), cancel })
    const { router } = renderApp('/signup/wallet')

    fireEvent.click(await screen.findByRole('button', { name: '토스로 연결' }))
    const sheet = await screen.findByRole('dialog', { name: '금융정보 연동 동의' })
    fireEvent.click(await within(sheet).findByRole('checkbox', { name: '전체 동의' }))
    const cta = within(sheet).getByRole('button', { name: '동의하고 연결' }) as HTMLButtonElement
    await waitFor(() => expect(cta.disabled).toBe(false))
    fireEvent.click(cta)

    await waitFor(() => expect(cancel).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/signup/wallet')
    expect(connections).toHaveLength(0)
  })

  it('✕로 닫으면 시트 없는 안내 화면', async () => {
    const { router } = renderApp('/signup/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '토스로 연결' }))
    const sheet = await screen.findByRole('dialog', { name: '금융정보 연동 동의' })
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(router.state.location.state).toBeFalsy())
    expect(router.state.location.pathname).toBe('/signup/wallet')
  })
})

describe('재동의', () => {
  it('가드가 보낸 항목만 보이고, 동의하면 원래 화면으로', async () => {
    db.consentRequired = ['TOS']
    const reconsent = record('post', '/api/auth/reconsent')
    const { router } = renderApp('/me')
    await waitFor(() => expect(where(router)).toBe('/reconsent?required=TOS&returnTo=%2Fme'))

    expect(await screen.findByRole('heading', { name: '약관이 바뀌었어요' })).toBeTruthy()
    expect(await screen.findByText('서비스 이용 조건, 송금 없음, 정산은 참고 정보')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['[필수] 서비스 이용약관'])
    expect(screen.queryByRole('button', { name: '뒤로 가기' })).toBeNull()

    const agree = button('동의') as HTMLButtonElement
    expect(agree.disabled).toBe(true)
    fireEvent.click(checkbox('[필수] 서비스 이용약관'))
    await waitFor(() => expect(agree.disabled).toBe(false))
    fireEvent.click(agree)

    await waitFor(() => expect(where(router)).toBe('/me'))
    expect(reconsent[0]).toEqual({
      method: 'INDIVIDUAL',
      agreements: [{ consentId: 'TOS', version: '0.1-draft', agreed: true }],
    })
    expect(db.consentRequired).toBeNull()
  })

  it('로그아웃하면 로그인으로', async () => {
    db.consentRequired = ['TOS', 'PRIVACY']
    const { router } = renderApp('/reconsent?required=TOS%2CPRIVACY')
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(where(router)).toBe('/login'))
    expect(db.session).toBe('ANONYMOUS')
  })

  it('다시 받을 동의가 없으면 returnTo(없으면 진입 라우팅)로', async () => {
    const { router } = renderApp('/reconsent?returnTo=%2Fme')
    await waitFor(() => expect(where(router)).toBe('/me'))
  })

  it('미로그인이면 로그인으로', async () => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp('/reconsent?required=TOS')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
