import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { api, mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
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

  it('shows "카드 내역 불러오기" above the CTA on the empty wallet', async () => {
    db.walletEntries = []
    renderApp('/wallet')
    expect(await screen.findByText('결제 기록이 없어요')).toBeTruthy()
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
    // 추가 인증(WF-54) 동안 — 원문은 화면 state에 없고, hook은 암호문만 들고 있다
    const code = await screen.findByLabelText('인증번호')
    expect(screen.getByText('2:40')).toBeTruthy()
    const mutations = () => JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state))
    expect(mutations()).not.toContain(PASSWORD)
    expect(mutations()).toContain('encryptedPassword')
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(button('확인'))
    expect(await screen.findByText('전체 선택')).toBeTruthy()

    const location = router.state.location
    const where = `${location.pathname}${location.search}${location.hash}${JSON.stringify(location.state)}`
    for (const secret of [PASSWORD, LOGIN_ID, 'twoway']) {
      expect(where).not.toContain(secret)
      expect(storageDump()).not.toContain(secret)
    }
    expect(mutations()).not.toContain(PASSWORD)
    // 결과를 받으면 암호문도 버린다
    expect(mutations()).not.toContain('encryptedPassword')
    // 결과(가맹점·itemToken)는 쿼리 캐시에 없다
    const queries = JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))
    expect(queries).not.toContain('다카시마야')
    expect(queries).not.toContain('mock.')
    await waitFor(() => expect(sent).toHaveLength(2))
    server.events.removeListener('request:start', listener)
    expect(sent.join()).not.toContain(PASSWORD)
    const [first, second] = sent.map((t) => JSON.parse(t) as Record<string, unknown>)
    expect(first).not.toHaveProperty('password')
    expect(second.encryptedPassword).toBe(first.encryptedPassword)
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

describe('동의 관리(WF-30 · 58 · 58b)', () => {
  it('lists the consent and withdraws it', async () => {
    resetCardImportMock({ consented: true })
    renderApp('/me')
    fireEvent.click(await screen.findByRole('link', { name: '동의 관리' }))
    expect(await screen.findByText('카드 내역 조회 동의')).toBeTruthy()
    expect(screen.getByText(/^\d{4}\.\d{2}\.\d{2} 동의$/)).toBeTruthy()
    fireEvent.click(button('카드 내역 조회 동의 철회'))
    const dialog = await screen.findByRole('alertdialog', { name: '동의를 철회할까요?' })
    expect(within(dialog).getByText('카드 내역을 불러오려면 다시 동의해야 해요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '철회' }))
    expect(await screen.findByText('철회했어요')).toBeTruthy()
    expect(await screen.findByText('동의한 항목이 없어요')).toBeTruthy()
    expect(db.cardImportState.consentAgreedAt).toBeNull()
  })

  it('hides "동의 관리" when the feature is off', async () => {
    db.cardImport = false
    renderApp('/me')
    await screen.findByText('로그아웃')
    expect(screen.queryByRole('link', { name: '동의 관리' })).toBeNull()
  })
})

describe('수동 결제 날짜 단계(HF-46d · SheetContent/DateTime)', () => {
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
