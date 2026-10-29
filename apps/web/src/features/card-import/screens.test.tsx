import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { FetchCardApprovalsResponse } from '@yeojeong/shared'
import { HttpResponse } from 'msw'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { api, mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { cardImportKeys } from './api'
import { typeKeys } from '../../test/typeKeys'
import { resetCardImportMock } from './mocks'

// W7 카드 내역 불러오기 화면(WF-51~58) · 보안 요구(화면명세 L-0 메모리 규칙). 목 시점 = 11.13 18:34, 오사카 진행 중.

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const PASSWORD = 'Plain-Card-Pw!42'
const LOGIN_ID = 'junyong88'

beforeAll(async () => {
  await Promise.all([
    import('../manual/WalletListPage'),
    import('./pages/StartPage'),
    import('./pages/IssuerPage'),
    import('./pages/FlowPage'),
    import('./pages/ConsentsPage'),
  ])
})

beforeEach(() => {
  db.cardImport = true
})
afterEach(() => vi.unstubAllEnvs())

const button = (name: string | RegExp, scope: HTMLElement | typeof screen = screen) =>
  (scope === screen ? screen : within(scope as HTMLElement)).getByRole('button', { name })
const disabled = (el: HTMLElement) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'

/** 지갑 "불러오기" → WF-51 동의 → WF-52 신한카드 → WF-53 */
async function toLogin() {
  const app = renderApp('/wallet')
  fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
  expect(await screen.findByText('카드사 로그인 정보')).toBeTruthy()
  const next = button('계속')
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /카드 내역 조회 동의/ })).toBeTruthy())
  expect(disabled(next)).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: /카드 내역 조회 동의/ }))
  fireEvent.click(button('계속'))
  fireEvent.click(await screen.findByRole('button', { name: /신한카드/ }))
  await screen.findByLabelText('아이디')
  return app
}

function fillLogin(id = LOGIN_ID, password = PASSWORD) {
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: id } })
  fireEvent.change(screen.getByLabelText('비밀번호', { selector: 'input' }), { target: { value: password } })
}

const storageDump = () => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })

describe('진입점(HF-49 · 49b · 0-11)', () => {
  it('hides the entry points and the flow when features.cardImport is off', async () => {
    db.cardImport = false
    const { router } = renderApp('/wallet')
    expect(await screen.findByRole('heading', { name: '내 지갑' })).toBeTruthy()
    await screen.findByText('이번 달')
    expect(screen.queryByRole('button', { name: '불러오기' })).toBeNull()
    await router.navigate('/wallet/import')
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
  })

  it('shows "카드 내역 불러오기" above the CTA on the empty wallet — and hides the header "불러오기" there (HF-49b)', async () => {
    db.walletEntries = []
    renderApp('/wallet')
    expect(await screen.findByText('결제 기록이 없어요')).toBeTruthy()
    // 빈 상태의 진입점은 텍스트 버튼 하나
    expect(screen.queryByRole('button', { name: '불러오기' })).toBeNull()
    fireEvent.click(button('카드 내역 불러오기'))
    expect(await screen.findByText('외부 업체(CODEF)')).toBeTruthy()
  })

  it('goes straight to 57d when remainingToday is 0', async () => {
    db.cardImportState.remaining = 0
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    expect(await screen.findByText('오늘은 더 불러올 수 없어요')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '카드 내역 불러오기' })).toBeTruthy()
    expect(screen.queryByText('카드사 로그인 정보')).toBeNull()
  })

  it('skips the consent row once agreed (facts stay)', async () => {
    resetCardImportMock({ consented: true })
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    expect(await screen.findByText('고른 결제만')).toBeTruthy()
    await waitFor(() => expect(disabled(button('계속'))).toBe(false))
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('a reload into the middle of the flow restarts at WF-51', async () => {
    const { router } = renderApp('/wallet/import/0306')
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/import'))
  })

  it('a restored history state from an earlier page load (stale nonce) restarts at WF-51, even with the consent kept', async () => {
    resetCardImportMock({ consented: true })
    const { router } = renderApp('/wallet')
    await screen.findByText('이번 달')
    // 새로고침 뒤 브라우저가 돌려준 history state: 흐름 표시는 있지만 이 페이지 메모리의 nonce가 아니다
    await router.navigate('/wallet/import/0306', { state: { cardImportFlow: true, nonce: 'from-before-reload', fromWallet: true } })
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/import'))
    expect(await screen.findByText('카드사 로그인 정보')).toBeTruthy()
    expect(screen.queryByLabelText('아이디')).toBeNull()
    // WF-51에서 다시 시작하면 흐름이 이어진다
    await waitFor(() => expect(disabled(button('계속'))).toBe(false))
    fireEvent.click(button('계속'))
    fireEvent.click(await screen.findByRole('button', { name: /신한카드/ }))
    expect(await screen.findByLabelText('아이디')).toBeTruthy()
    for (const path of ['/wallet/import/issuer', '/wallet/import/0306']) {
      await router.navigate(path, { state: { cardImportFlow: true, nonce: 'from-before-reload' } })
      await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/import'))
    }
  })

  it('forward into an old flow entry after leaving the flow restarts at WF-51', async () => {
    resetCardImportMock({ consented: true })
    const { router } = renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    await waitFor(() => expect(disabled(button('계속'))).toBe(false))
    fireEvent.click(button('계속'))
    fireEvent.click(await screen.findByRole('button', { name: /신한카드/ }))
    await screen.findByLabelText('아이디')
    const oldState = router.state.location.state
    // ‹ ‹ ‹로 흐름을 끝내고 지갑으로
    fireEvent.click(button('뒤로 가기'))
    fireEvent.click(await screen.findByRole('button', { name: '뒤로 가기' }))
    await screen.findByText('고른 결제만')
    fireEvent.click(button('뒤로 가기'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
    await router.navigate('/wallet/import/0306', { state: oldState })
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/import'))
  })

  it('the consent row › opens the document in-app, and ‹ there returns to WF-51 with the check kept (HF-51)', async () => {
    const { router } = renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    const check = await screen.findByRole('checkbox', { name: /카드 내역 조회 동의/ })
    fireEvent.click(check)
    const link = screen.getByRole('link', { name: '카드 내역 조회 동의 전문' })
    expect(link.getAttribute('href')).toBe('/consents/CARD_IMPORT')
    // 라우터 이동이면 메모리 라우터 주소가 바뀐다(href 기본 동작 = 전체 새로고침이면 바뀌지 않는다)
    expect(fireEvent.click(link)).toBe(false)
    await waitFor(() => expect(router.state.location.pathname).toBe('/consents/CARD_IMPORT'))
    fireEvent.click(await screen.findByRole('button', { name: '뒤로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/import'))
    const again = await screen.findByRole('checkbox', { name: /카드 내역 조회 동의/ })
    expect((again as HTMLInputElement).checked).toBe(true)
    await waitFor(() => expect(disabled(button('계속'))).toBe(false))
    fireEvent.click(button('계속'))
    expect(await screen.findByRole('heading', { name: '카드사 선택' })).toBeTruthy()
    expect(db.cardImportState.consentVersion).toBe('0.1-draft')
    // 흐름은 그대로(WF-52 ‹ → WF-51, 동의 뒤라 체크 행 없음 · 지갑에서 들어온 흐름이라 ‹ 한 번 더 → 지갑)
    fireEvent.click(button('뒤로 가기'))
    await screen.findByText('고른 결제만')
    fireEvent.click(button('뒤로 가기'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
  })

  it('a new flow from the wallet starts with the check off', async () => {
    const { router } = renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /카드 내역 조회 동의/ }))
    fireEvent.click(button('뒤로 가기'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    expect(((await screen.findByRole('checkbox', { name: /카드 내역 조회 동의/ })) as HTMLInputElement).checked).toBe(false)
  })
})

describe('보안(L-0 메모리 규칙)', () => {
  it('login inputs never autocomplete or spellcheck', async () => {
    await toLogin()
    for (const input of [screen.getByLabelText('아이디'), screen.getByLabelText('비밀번호', { selector: 'input' })]) {
      expect(input.getAttribute('autocomplete')).toBe('off')
      expect(input.getAttribute('spellcheck')).toBe('false')
      expect(input.closest('form')).toBeNull()
    }
    expect(screen.getByLabelText('비밀번호', { selector: 'input' }).getAttribute('type')).toBe('password')
    expect(screen.getByText('비밀번호는 암호화되어 여정도 볼 수 없어요')).toBeTruthy()
  })

  it('clears the plaintext right after submit and keeps it out of caches, storage, URL and history', async () => {
    const sent: string[] = []
    const listener = ({ request }: { request: Request }) => {
      if (request.url.endsWith('/api/card-import/fetch')) void request.clone().text().then((t) => sent.push(t))
    }
    server.events.on('request:start', listener)
    const { router, queryClient } = await toLogin()
    fillLogin('twoway')
    fireEvent.click(button('불러오기'))
    // 추가 인증(WF-54) 동안 — 원문은 화면 state에 없고, 조회는 TanStack 뮤테이션을 쓰지 않는다(variables에 아이디·암호문·인증번호가 남지 않게)
    const code = await screen.findByLabelText('인증번호')
    expect(screen.getByText('2:40')).toBeTruthy()
    const caches = () =>
      JSON.stringify([queryClient.getMutationCache().getAll().map((m) => m.state), queryClient.getQueryCache().getAll().map((q) => q.state)])
    // 뮤테이션 캐시에는 동의 저장(WF-51, 변수 = 문서 버전)만 있다
    expect(queryClient.getMutationCache().getAll().map((m) => m.state.variables)).toEqual(['0.1-draft'])
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(button('확인'))
    expect(await screen.findByText('전체 선택')).toBeTruthy()

    const location = router.state.location
    const where = `${location.pathname}${location.search}${location.hash}${JSON.stringify(location.state)}`
    for (const secret of [PASSWORD, LOGIN_ID, 'twoway', '123456']) {
      expect(where).not.toContain(secret)
      expect(storageDump()).not.toContain(secret)
      expect(caches()).not.toContain(secret)
    }
    expect(caches()).not.toContain('encryptedPassword')
    // 결과(가맹점·itemToken)는 쿼리 캐시에 없다
    expect(caches()).not.toContain('다카시마야')
    expect(caches()).not.toContain('mock.')
    await waitFor(() => expect(sent).toHaveLength(2))
    server.events.removeListener('request:start', listener)
    expect(sent.join()).not.toContain(PASSWORD)
    const [first, second] = sent.map((t) => JSON.parse(t) as Record<string, unknown>)
    expect(first).not.toHaveProperty('password')
    expect(second.encryptedPassword).toBe(first.encryptedPassword)
    expect(caches()).not.toContain(String(first.encryptedPassword))
  })

  it('tells password managers to ignore the login inputs (best effort)', async () => {
    await toLogin()
    for (const input of [screen.getByLabelText('아이디'), screen.getByLabelText('비밀번호', { selector: 'input' })]) {
      expect(input.getAttribute('data-1p-ignore')).toBe('true')
      expect(input.getAttribute('data-lpignore')).toBe('true')
      expect(input.getAttribute('data-bwignore')).toBe('true')
      expect(input.getAttribute('data-form-type')).toBe('other')
    }
  })

  it('wipes ids, password and the result on pagehide, and restarts at WF-51 when restored from bfcache', async () => {
    const { router } = await toLogin()
    fillLogin()
    fireEvent.click(button('불러오기'))
    await screen.findByText('전체 선택')
    window.dispatchEvent(new Event('pagehide'))
    expect(await screen.findByLabelText('아이디')).toBeTruthy()
    expect((screen.getByLabelText('아이디') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('다카시마야 난바점')).toBeNull()
    const show = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(show, 'persisted', { value: true })
    window.dispatchEvent(show)
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/import'))
  })

  it('aborts the in-flight fetch on cancel and ignores its response', async () => {
    let aborted = false
    server.use(
      api.post<FetchCardApprovalsResponse>('/api/card-import/fetch', async ({ request }) => {
        request.signal.addEventListener('abort', () => {
          aborted = true
        })
        await new Promise((r) => setTimeout(r, 500))
        return HttpResponse.json({ status: 'OK', organization: '0306', from: '2026-11-12', to: '2026-11-13', items: [] })
      }),
    )
    await toLogin()
    fillLogin()
    fireEvent.click(button('불러오기'))
    expect(await screen.findByRole('heading', { name: '불러오는 중' })).toBeTruthy()
    fireEvent.click(button('취소'))
    expect(await screen.findByLabelText('아이디')).toBeTruthy()
    await waitFor(() => expect(aborted).toBe(true))
    await new Promise((r) => setTimeout(r, 600))
    // 늦은 응답(0건)으로 화면이 바뀌지 않는다
    expect(screen.queryByText('이 기간에 승인 내역이 없어요')).toBeNull()
    expect(screen.getByLabelText('아이디')).toBeTruthy()
  })

  it('never sends credentials without a valid consent — back to WF-51', async () => {
    const sent = vi.fn()
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/api/card-import/fetch')) sent()
    })
    const { router, queryClient } = await toLogin()
    fillLogin()
    // 그사이 다른 기기에서 철회 → config를 다시 받으면 동의 없음 → 자격 증명을 받지 않고 WF-51로
    db.cardImportState.consentAgreedAt = null
    db.cardImportState.consentVersion = null
    await queryClient.invalidateQueries({ queryKey: cardImportKeys.config })
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/import'))
    expect(await screen.findByRole('checkbox', { name: /카드 내역 조회 동의/ })).toBeTruthy()
    expect(sent).not.toHaveBeenCalled()
    server.events.removeAllListeners('request:start')
  })

  it('shows 54b when the 2-way timer runs out, and "다시 하기" returns to WF-53 with the password emptied', async () => {
    server.use(
      api.post<FetchCardApprovalsResponse>('/api/card-import/fetch', () =>
        HttpResponse.json({ status: 'TWO_WAY_REQUIRED', twoWayToken: 'tw1.short', method: 'SMS', expiresAt: new Date(Date.now() + 1200).toISOString() }),
      ),
    )
    await toLogin()
    fillLogin('twoway')
    fireEvent.click(button('불러오기'))
    await screen.findByLabelText('인증번호')
    const dialog = await screen.findByRole('alertdialog', { name: '인증 시간이 지났어요' })
    expect(within(dialog).getByText('처음부터 다시 불러와 주세요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 하기' }))
    expect(((await screen.findByLabelText('아이디')) as HTMLInputElement).value).toBe('twoway')
    expect((screen.getByLabelText('비밀번호', { selector: 'input' }) as HTMLInputElement).value).toBe('')
  })

  it('empties the password field after a failed login (53b) — 1st, 2nd and 3rd failure', async () => {
    await toLogin()
    fillLogin('wrong')
    fireEvent.click(button('불러오기'))
    expect(await screen.findByText('아이디나 비밀번호가 맞지 않아요')).toBeTruthy()
    const pw = screen.getByLabelText('비밀번호', { selector: 'input' }) as HTMLInputElement
    expect(pw.value).toBe('')
    expect(pw.getAttribute('aria-invalid')).toBe('true')
    fillLogin('wrong')
    fireEvent.click(button('불러오기'))
    expect(await screen.findByText('카드사에서 로그인이 잠길 수 있어요')).toBeTruthy()
    fillLogin('wrong')
    fireEvent.click(button('불러오기'))
    expect(await screen.findByText(/^\d{2}:\d{2} 이후 다시 시도해 주세요$/)).toBeTruthy()
    // 쿨다운 동안 다시 입력해도 불러오기는 꺼져 있다
    fillLogin('wrong')
    expect(disabled(button('불러오기'))).toBe(true)
  })

  it('shows our own copy, never the CODEF message', async () => {
    server.use(api.post('/api/card-import/fetch', () => mockError('CARD_COMPANY_UNAVAILABLE', 503, undefined, 'CODEF 원문 [CF-12345]')))
    await toLogin()
    fillLogin()
    fireEvent.click(button('불러오기'))
    expect(await screen.findByText('신한카드 조회가 잠시 안 돼요')).toBeTruthy()
    expect(screen.queryByText(/CF-12345/)).toBeNull()
    // 다시 시도 → WF-53(아이디 유지, 비밀번호 비움)
    fireEvent.click(button('다시 시도'))
    expect(((await screen.findByLabelText('아이디')) as HTMLInputElement).value).toBe(LOGIN_ID)
    expect((screen.getByLabelText('비밀번호', { selector: 'input' }) as HTMLInputElement).value).toBe('')
  })

  it('refuses to encrypt with an unpinned public key and shows the HF-57 layout', async () => {
    vi.stubEnv('VITE_CODEF_PUBKEY_SHA256', 'f'.repeat(64))
    const fetched = vi.fn()
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/api/card-import/fetch')) fetched()
    })
    await toLogin()
    fillLogin()
    fireEvent.click(button('불러오기'))
    expect(await screen.findByText('신한카드 조회가 잠시 안 돼요')).toBeTruthy()
    expect(fetched).not.toHaveBeenCalled()
    server.events.removeAllListeners('request:start')
  })

  it('drops the result after saving — nothing left in the mutation cache', async () => {
    const { queryClient, router } = await toLogin()
    fillLogin()
    fireEvent.click(button('불러오기'))
    expect(await screen.findByRole('heading', { name: '신한카드 · 11건' })).toBeTruthy()
    // 전체 선택(일부) · 선택 가능 7건 중 기본 5건(여정 기간 안 NEW·부분 취소)
    expect(screen.getByText('7건 중 5건')).toBeTruthy()
    const all = screen.getByRole('checkbox', { name: '전체 선택' })
    expect(all.getAttribute('aria-checked')).toBe('mixed')
    expect(screen.getByText('약 ₩25,740')).toBeTruthy()
    expect(screen.getByText('부분 취소 −₩3,000')).toBeTruthy()
    expect(screen.getAllByText('취소됨')).toHaveLength(3)
    expect(screen.getByText('추가됨')).toBeTruthy()
    expect(screen.getByText('비슷한 기록')).toBeTruthy()
    // 비슷한 기록 선택 → 6건
    fireEvent.click(screen.getByRole('checkbox', { name: /551 호라이 난바본점/ }))
    expect(screen.getByText('7건 중 6건')).toBeTruthy()
    const before = db.walletEntries.length
    fireEvent.click(button('6건 추가'))
    expect(await screen.findByText('6건을 추가했어요')).toBeTruthy()
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
    expect(db.walletEntries.length).toBe(before + 6)
    await waitFor(() => expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state))).not.toContain('mock.'))
  })

  it('asks before leaving the result (56c) and drops it', async () => {
    const { router } = await toLogin()
    fillLogin()
    fireEvent.click(button('불러오기'))
    await screen.findByText('전체 선택')
    fireEvent.click(button('뒤로 가기'))
    const dialog = await screen.findByRole('alertdialog', { name: '불러온 내역을 버릴까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '나가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
  })

  it('0건(56b) EmptyState = 일러스트 144 + 제목 H2(HF-09와 같은 구성)', async () => {
    await toLogin()
    fillLogin('empty')
    fireEvent.click(button('불러오기'))
    const title = await screen.findByRole('heading', { level: 2, name: '이 기간에 승인 내역이 없어요' })
    const illust = title.parentElement?.querySelector('svg')
    expect(illust?.getAttribute('width')).toBe('144')
    expect(button('기간 바꾸기')).toBeTruthy()
  })

  it('shows 56e when the result tokens expired', async () => {
    server.use(api.post('/api/wallet/entries/import', () => mockError('CARD_IMPORT_RESULT_EXPIRED', 410, { invalidIndexes: [0] })))
    await toLogin()
    fillLogin()
    fireEvent.click(button('불러오기'))
    fireEvent.click(await screen.findByRole('button', { name: '5건 추가' }))
    const dialog = await screen.findByRole('alertdialog', { name: '불러온 내역이 만료됐어요' })
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 불러오기' }))
    expect(((await screen.findByLabelText('아이디')) as HTMLInputElement).value).toBe(LOGIN_ID)
  })
})

describe('동의 관리(WF-30 · 58 · 58b) — 기능 플래그와 무관, 유효 동의가 있을 때만', () => {
  it('lists the consent and withdraws it, then returns to HF-30 without the row', async () => {
    resetCardImportMock({ consented: true })
    const { router } = renderApp('/me')
    fireEvent.click(await screen.findByRole('link', { name: '동의 관리' }))
    expect(await screen.findByText('카드 내역 조회 동의')).toBeTruthy()
    expect(screen.getByText(/^\d{4}\.\d{2}\.\d{2} 동의$/)).toBeTruthy()
    fireEvent.click(button('카드 내역 조회 동의 철회'))
    const dialog = await screen.findByRole('alertdialog', { name: '동의를 철회할까요?' })
    expect(within(dialog).getByText('카드 내역을 불러오려면 다시 동의해야 해요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '철회' }))
    expect(await screen.findByText('철회했어요')).toBeTruthy()
    await waitFor(() => expect(router.state.location.pathname).toBe('/me'))
    expect(db.cardImportState.consentAgreedAt).toBeNull()
    await screen.findByText('로그아웃')
    await waitFor(() => expect(screen.queryByRole('link', { name: '동의 관리' })).toBeNull())
  })

  it('shows "동의 관리" and lets the user withdraw even when features.cardImport is off', async () => {
    db.cardImport = false
    resetCardImportMock({ consented: true })
    renderApp('/me')
    fireEvent.click(await screen.findByRole('link', { name: '동의 관리' }))
    fireEvent.click(await screen.findByRole('button', { name: '카드 내역 조회 동의 철회' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '철회' }))
    expect(await screen.findByText('철회했어요')).toBeTruthy()
    expect(db.cardImportState.consentAgreedAt).toBeNull()
  })

  it('works even when the production build has no public key pin (pinPolicy blocked): entry hidden, consents still manageable', async () => {
    vi.stubEnv('VITE_CODEF_PUBKEY_SHA256', '')
    vi.stubEnv('PROD', true)
    resetCardImportMock({ consented: true })
    const { router } = renderApp('/wallet')
    await screen.findByText('이번 달')
    expect(screen.queryByRole('button', { name: '불러오기' })).toBeNull()
    await router.navigate('/me')
    fireEvent.click(await screen.findByRole('link', { name: '동의 관리' }))
    fireEvent.click(await screen.findByRole('button', { name: '카드 내역 조회 동의 철회' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '철회' }))
    expect(await screen.findByText('철회했어요')).toBeTruthy()
    expect(db.cardImportState.consentAgreedAt).toBeNull()
  })

  it('hides "동의 관리" without a valid consent, and /me/consents goes back to HF-30', async () => {
    const { router } = renderApp('/me')
    await screen.findByText('로그아웃')
    // revocable 응답을 받은 뒤에도 행이 없다
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('link', { name: '동의 관리' })).toBeNull()
    await router.navigate('/me/consents')
    await waitFor(() => expect(router.state.location.pathname).toBe('/me'))
  })
})

describe('WF-51 재동의(약관 MAJOR 버전 상승)', () => {
  it('shows the consent row again when the agreed MAJOR version is outdated, and agrees with the new version', async () => {
    resetCardImportMock({ consented: true })
    db.cardImportState.requiredVersion = '1.0'
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    const row = await screen.findByRole('checkbox', { name: /카드 내역 조회 동의/ })
    expect(disabled(button('계속'))).toBe(true)
    fireEvent.click(row)
    fireEvent.click(button('계속'))
    expect(await screen.findByRole('heading', { name: '카드사 선택' })).toBeTruthy()
    expect(db.cardImportState.consentVersion).toBe('1.0')
  })

  it('keeps the row hidden after a MINOR bump', async () => {
    resetCardImportMock({ consented: true })
    db.cardImportState.requiredVersion = '0.2'
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    await waitFor(() => expect(disabled(button('계속'))).toBe(false))
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('수동 결제 날짜 단계(HF-46d · SheetContent/DateTime)', () => {
  it('typing the hour one key at a time keeps "15" (not "01") — HF-48', async () => {
    renderApp('/wallet/new')
    const sheet = await screen.findByRole('dialog', { name: '결제 추가' })
    fireEvent.click(within(sheet).getByRole('button', { name: /^날짜/ }))
    const step = await screen.findByRole('dialog', { name: '날짜' })
    fireEvent.click(within(step).getByRole('button', { name: /11월 12일/ }))
    const hour = within(step).getByRole('textbox', { name: '시' }) as HTMLInputElement
    const minute = within(step).getByRole('textbox', { name: '분' }) as HTMLInputElement
    typeKeys(hour, '1520')
    expect(hour.value).toBe('15')
    expect(minute.value).toBe('20')
    fireEvent.click(within(step).getByRole('button', { name: '확인' }))
    const form = await screen.findByRole('dialog', { name: '결제 추가' })
    expect(within(form).getByRole('button', { name: /^날짜/ }).textContent).toContain('11.12 15:20')
  })

  it('picks a date and time with the DS19 sheet', async () => {
    renderApp('/wallet/new')
    const sheet = await screen.findByRole('dialog', { name: '결제 추가' })
    fireEvent.click(within(sheet).getByRole('button', { name: /^날짜/ }))
    const step = await screen.findByRole('dialog', { name: '날짜' })
    // 미래(내일)는 고를 수 없다
    expect(within(step).getByRole('button', { name: /11월 14일/ }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(within(step).getByRole('button', { name: /11월 12일/ }))
    fireEvent.change(within(step).getByRole('textbox', { name: '시' }), { target: { value: '09' } })
    fireEvent.change(within(step).getByRole('textbox', { name: '분' }), { target: { value: '05' } })
    fireEvent.click(within(step).getByRole('button', { name: '확인' }))
    const form = await screen.findByRole('dialog', { name: '결제 추가' })
    expect(within(form).getByRole('button', { name: /^날짜/ }).textContent).toContain('11.12 09:05')
  })
})
