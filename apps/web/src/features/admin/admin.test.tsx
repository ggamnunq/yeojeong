import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { AdminFeatureGrantList } from '@yeojeong/shared'
import { HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { api, mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { ADMIN_MOCK_CREDENTIALS, ADMIN_MOCK_TOTP_CODES, ADMIN_MOCK_USER, resetAdminMock, signInAdminMock } from './mocks'
import { formatWait } from './format'
import { safeAdminReturnTo } from './paths'

afterEach(() => resetAdminMock())

type Router = ReturnType<typeof renderApp>['router']
const location = (router: Router) => `${router.state.location.pathname}${router.state.location.search}`

const FAILED = '아이디, 비밀번호 또는 인증 코드가 맞지 않아요'
const [CODE, CODE2] = ADMIN_MOCK_TOTP_CODES

async function login(username: string, password: string, totp: string = CODE) {
  fireEvent.change(await screen.findByLabelText('아이디'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('인증 코드'), { target: { value: totp } })
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))
}

/** 탈퇴 폼 채우기(사유·닉네임·재인증) */
function fillWithdraw(nickname: string, step: { password?: string; totp?: string } = {}) {
  fireEvent.change(screen.getByLabelText('사유'), { target: { value: '고객센터 요청 처리' } })
  fireEvent.change(screen.getByLabelText('닉네임 다시 입력'), { target: { value: nickname } })
  fireEvent.change(screen.getByLabelText('관리자 비밀번호'), { target: { value: step.password ?? ADMIN_MOCK_CREDENTIALS.password } })
  fireEvent.change(screen.getByLabelText('인증 코드'), { target: { value: step.totp ?? CODE2 } })
}

async function confirmWithdraw() {
  fireEvent.click(screen.getByRole('button', { name: '탈퇴 처리' }))
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: '탈퇴 처리' }))
}

const userRows = () => within(screen.getByRole('region', { name: '회원 목록 표' })).getAllByRole('row').slice(1)

describe('관리자 로그인 /admin/login', () => {
  it('맞는 자격 증명이면 returnTo(관리자 화면)로 간다', async () => {
    const { router } = renderApp('/admin/login?returnTo=%2Fadmin%2Fcodef')
    await login(ADMIN_MOCK_CREDENTIALS.username, ADMIN_MOCK_CREDENTIALS.password)
    await waitFor(() => expect(location(router)).toBe('/admin/codef'))
    expect(await screen.findByRole('heading', { level: 1, name: 'CODEF 현황' })).toBeTruthy()
  })

  it('틀리면 무엇이 틀렸는지 말하지 않는 일반 문구 + 비밀번호·인증 코드를 비운다', async () => {
    renderApp('/admin/login')
    await login('admin', 'wrong-password')
    expect((await screen.findByRole('alert')).textContent).toBe(FAILED)
    expect((screen.getByLabelText('아이디') as HTMLInputElement).value).toBe('admin')
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('인증 코드') as HTMLInputElement).value).toBe('')
  })

  it('인증 코드가 틀려도 같은 일반 문구', async () => {
    renderApp('/admin/login')
    await login(ADMIN_MOCK_CREDENTIALS.username, ADMIN_MOCK_CREDENTIALS.password, '000000')
    expect((await screen.findByRole('alert')).textContent).toBe(FAILED)
  })

  it('인증 코드는 숫자 6자리만 받고, 6자리가 되어야 로그인 버튼이 켜진다', async () => {
    renderApp('/admin/login')
    const submit = () => screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement
    fireEvent.change(await screen.findByLabelText('아이디'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw' } })
    const code = screen.getByLabelText('인증 코드') as HTMLInputElement
    expect(code.getAttribute('autocomplete')).toBe('one-time-code')
    expect(code.getAttribute('inputmode')).toBe('numeric')
    fireEvent.change(code, { target: { value: '12a3 45' } })
    expect(code.value).toBe('12345')
    expect(submit().disabled).toBe(true)
    fireEvent.change(code, { target: { value: '1234567' } })
    expect(code.value).toBe('123456')
    expect(submit().disabled).toBe(false)
  })

  it('한 번 쓴 인증 코드로는 다시 로그인할 수 없다', async () => {
    const { router } = renderApp('/admin/login')
    await login(ADMIN_MOCK_CREDENTIALS.username, ADMIN_MOCK_CREDENTIALS.password)
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'))
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'))
    await login(ADMIN_MOCK_CREDENTIALS.username, ADMIN_MOCK_CREDENTIALS.password, CODE)
    expect((await screen.findByRole('alert')).textContent).toBe(FAILED)
  })

  it('여러 번 틀리면 429 문구와 남은 시간', async () => {
    renderApp('/admin/login')
    for (let i = 0; i < 5; i += 1) {
      await login('admin', `wrong-${i}`)
      await screen.findByText(FAILED)
    }
    await login(ADMIN_MOCK_CREDENTIALS.username, ADMIN_MOCK_CREDENTIALS.password)
    expect((await screen.findByText(/로그인 시도가 너무 많아요/)).textContent).toContain('(15분 후)')
  })

  it('returnTo는 /admin 화면만(일반 화면·외부·로그인 자신은 버린다)', () => {
    expect(safeAdminReturnTo('/admin/users?q=a')).toBe('/admin/users?q=a')
    expect(safeAdminReturnTo('/trips')).toBeNull()
    expect(safeAdminReturnTo('//evil.com/admin/users')).toBeNull()
    expect(safeAdminReturnTo('/admin/login')).toBeNull()
    expect(safeAdminReturnTo('/administrator')).toBeNull()
    expect(formatWait(45)).toBe('45초')
    expect(formatWait(900)).toBe('15분')
  })

  it('robots noindex meta를 그린다', async () => {
    renderApp('/admin/login')
    await screen.findByLabelText('아이디')
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
  })
})

describe('관리자 세션 분리', () => {
  it('관리자 세션이 없으면 카카오 로그인(/login)이 아니라 /admin/login?returnTo=…로 간다', async () => {
    const { router } = renderApp('/admin/users?sort=lastLoginAt')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'))
    expect(router.state.location.search).toBe(`?returnTo=${encodeURIComponent('/admin/users?sort=lastLoginAt')}`)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('/admin은 회원 목록으로', async () => {
    signInAdminMock()
    const { router } = renderApp('/admin')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'))
  })

  it('로그아웃하면 로그인 화면으로 가고, 다시 들어가면 막힌다', async () => {
    signInAdminMock()
    const { router } = renderApp('/admin/users')
    await screen.findByRole('heading', { level: 1, name: '회원' })
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'))
    await router.navigate('/admin/codef')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'))
    expect(screen.queryByText('36 / 100')).toBeNull()
  })
})

describe('회원 목록 /admin/users', () => {
  it('열·상태·카드 불러오기 + 더 보기(커서)', async () => {
    signInAdminMock()
    renderApp('/admin/users')
    await screen.findByRole('link', { name: '준용' })
    expect(userRows()).toHaveLength(20)
    const minji = screen.getByRole('link', { name: '민지' }).closest('tr') as HTMLElement
    expect(within(minji).getByText('탈퇴 요청')).toBeTruthy()
    const junyong = screen.getByRole('link', { name: '준용' }).closest('tr') as HTMLElement
    expect(within(junyong).getByText('env 허용 목록 · 켜짐')).toBeTruthy()
    expect(within(junyong).getByText(ADMIN_MOCK_USER.junyong)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))
    await waitFor(() => expect(userRows()).toHaveLength(25))
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
  })

  it('닉네임 부분 검색 · 사용자 ID 정확 검색', async () => {
    signInAdminMock()
    const { router } = renderApp('/admin/users')
    await screen.findByRole('link', { name: '준용' })
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '민' } })
    fireEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() => expect(userRows()).toHaveLength(1))
    expect(location(router)).toBe('/admin/users?q=%EB%AF%BC')
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: ADMIN_MOCK_USER.taehyeon } })
    fireEvent.click(screen.getByRole('button', { name: '검색' }))
    await screen.findByRole('link', { name: '태현' })
    expect(userRows()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '없는닉네임' } })
    fireEvent.click(screen.getByRole('button', { name: '검색' }))
    expect(await screen.findByText('검색 결과가 없어요')).toBeTruthy()
  })

  it('정렬을 최근 로그인으로 바꾸면 순서가 바뀐다', async () => {
    signInAdminMock()
    const { router } = renderApp('/admin/users')
    await screen.findByRole('link', { name: '준용' })
    const first = () => within(userRows()[0]).getAllByRole('cell')[1].textContent
    expect(first()).toBe('준용')
    expect(within(userRows()[1]).getAllByRole('cell')[1].textContent).toBe('민지')
    fireEvent.click(screen.getByRole('radio', { name: '최근 로그인' }))
    await waitFor(() => expect(location(router)).toBe('/admin/users?sort=lastLoginAt'))
    await waitFor(() => expect(userRows()).toHaveLength(20))
    // 최근 로그인 순: 준용(0시간 전) → 여행자19(1시간 전)
    await waitFor(() => expect(within(userRows()[1]).getAllByRole('cell')[1].textContent).toBe('여행자19'))
  })
})

describe('회원 상세 /admin/users/:userId', () => {
  it('정보·동의·여정·건수만 보이고 결제 내용(금액·가맹점)은 없다', async () => {
    signInAdminMock()
    renderApp(`/admin/users/${ADMIN_MOCK_USER.junyong}`)
    expect(await screen.findByRole('heading', { level: 1, name: '준용' })).toBeTruthy()
    expect(screen.getByText('••••4821')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '결제' })).getByText('12')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '결제수단' })).getByText('2')).toBeTruthy()
    const consents = screen.getByRole('region', { name: '동의 현황 표' })
    expect(within(consents).getByText('서비스 이용약관')).toBeTruthy()
    expect(within(consents).getByText(/HF-58/)).toBeTruthy()
    const trips = screen.getByRole('region', { name: '그룹 · 여정 표' })
    expect(within(trips).getByText('오사카 3박 4일')).toBeTruthy()
    expect(within(trips).getByText('삭제됨')).toBeTruthy()
    expect(within(trips).getByText('2026-10-27 ~ 2026-10-30')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/₩|가맹점|금액/)
  })

  it('없는 회원이면 안내', async () => {
    signInAdminMock()
    renderApp('/admin/users/00000000-0000-4000-8000-00000000abcd')
    expect(await screen.findByText('회원을 찾을 수 없어요')).toBeTruthy()
  })

  it('탈퇴 처리: 사유·닉네임·재인증(비밀번호 + 인증 코드)이 있어야 버튼이 켜지고 → 확인 다이얼로그 → 목록 + 안내', async () => {
    signInAdminMock()
    const { router } = renderApp(`/admin/users/${ADMIN_MOCK_USER.taehyeon}`)
    await screen.findByRole('heading', { level: 1, name: '태현' })
    const submit = () => screen.getByRole('button', { name: '탈퇴 처리' }) as HTMLButtonElement
    expect(submit().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '고객센터 요청 처리' } })
    fireEvent.change(screen.getByLabelText('닉네임 다시 입력'), { target: { value: '태' } })
    expect(submit().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('닉네임 다시 입력'), { target: { value: '태현' } })
    // 재인증 없이는 아직 꺼져 있다
    expect(submit().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('관리자 비밀번호'), { target: { value: ADMIN_MOCK_CREDENTIALS.password } })
    expect(submit().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('인증 코드'), { target: { value: '13579' } })
    expect(submit().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('인증 코드'), { target: { value: CODE2 } })
    expect(submit().disabled).toBe(false)
    fireEvent.click(submit())
    const dialog = await screen.findByRole('alertdialog', { name: '태현 님을 탈퇴 처리할까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '탈퇴 처리' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'))
    expect(await screen.findByText('태현 님을 탈퇴 처리했어요')).toBeTruthy()
    await screen.findByRole('link', { name: '준용' })
    expect(screen.queryByRole('link', { name: '태현' })).toBeNull()
  })

  it('서버가 닉네임 불일치로 거절하면 입력 옆에 문구', async () => {
    signInAdminMock()
    server.use(api.post<never>('/api/admin/users/:userId/withdraw', () => mockError('ADMIN_CONFIRM_MISMATCH', 400)))
    renderApp(`/admin/users/${ADMIN_MOCK_USER.taehyeon}`)
    await screen.findByRole('heading', { level: 1, name: '태현' })
    fillWithdraw('태현')
    await confirmWithdraw()
    expect(await screen.findByText('닉네임이 맞지 않아요')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: '태현' })).toBeTruthy()
  })

  it('재인증이 틀리면 입력 옆에 문구 + 인증 코드를 비우고, 회원은 그대로', async () => {
    signInAdminMock()
    renderApp(`/admin/users/${ADMIN_MOCK_USER.taehyeon}`)
    await screen.findByRole('heading', { level: 1, name: '태현' })
    fillWithdraw('태현', { password: 'wrong-password' })
    await confirmWithdraw()
    expect(await screen.findByText('비밀번호 또는 인증 코드가 맞지 않아요')).toBeTruthy()
    expect((screen.getByLabelText('인증 코드') as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('button', { name: '탈퇴 처리' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('heading', { level: 1, name: '태현' })).toBeTruthy()
    // 틀린 코드도 같은 문구
    fireEvent.change(screen.getByLabelText('관리자 비밀번호'), { target: { value: ADMIN_MOCK_CREDENTIALS.password } })
    fireEvent.change(screen.getByLabelText('인증 코드'), { target: { value: '000000' } })
    await confirmWithdraw()
    expect(await screen.findByText('비밀번호 또는 인증 코드가 맞지 않아요')).toBeTruthy()
  })

  it('재인증을 여러 번 틀리면 429 문구와 남은 시간', async () => {
    signInAdminMock()
    server.use(
      api.post<never>('/api/admin/users/:userId/withdraw', () =>
        mockError('ADMIN_STEP_UP_RATE_LIMITED', 429, { retryAfter: new Date(Date.now() + 600_000).toISOString(), retryAfterSec: 600 }),
      ),
    )
    renderApp(`/admin/users/${ADMIN_MOCK_USER.taehyeon}`)
    await screen.findByRole('heading', { level: 1, name: '태현' })
    fillWithdraw('태현')
    await confirmWithdraw()
    expect((await screen.findByText(/확인 시도가 너무 많아요/)).textContent).toContain('(10분 후)')
  })
})

describe('CODEF 현황 /admin/codef', () => {
  it('오늘 수치 · 결과 코드별 · 14일(보관 지난 날은 —) · 상위 회원 · 플래그', async () => {
    signInAdminMock()
    renderApp('/admin/codef')
    expect(await screen.findByText('36 / 100')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '남은 호출' })).getByText('64')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '예약 중' })).getByText('3')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '오늘 결과 코드별' })).getByText('CARD_LOGIN_FAILED')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '오늘 카드사별' })).getByText('0306')).toBeTruthy()
    const days = within(screen.getByRole('region', { name: '일별 호출 표' })).getAllByRole('row').slice(1)
    expect(days).toHaveLength(14)
    expect(within(days[0]).getAllByRole('cell')[1].textContent).toBe('—')
    expect(within(days[13]).getAllByRole('cell')[1].textContent).not.toBe('—')
    const top = screen.getByRole('region', { name: '회원별 오늘 조회 표' })
    expect(within(top).getByText('탈퇴한 회원')).toBeTruthy()
    expect(within(top).getByText('6 / 10')).toBeTruthy()
    expect(screen.getByText('FEATURE_CARD_IMPORT')).toBeTruthy()
    expect(screen.getByText('1명', { selector: 'dd' })).toBeTruthy()
  })
})

describe('기능 권한 /admin/features', () => {
  const matrix = () => screen.getByRole('region', { name: '기능 권한 표' })
  const grantRows = () => within(matrix()).getAllByRole('row').slice(1)
  const toggle = (name: string, feature: string) => screen.getByRole('switch', { name: `${name} ${feature} 권한` }) as HTMLButtonElement

  it('메뉴에서 들어가고, 기능별 단계 · 권한 있는 회원(관리자·env) · 출처 · 지금 켜짐 · 카드 동의·오늘 조회를 보여 준다', async () => {
    signInAdminMock()
    const { router } = renderApp('/admin/users')
    await screen.findByRole('heading', { level: 1, name: '회원' })
    fireEvent.click(within(screen.getByRole('navigation', { name: '관리자 메뉴' })).getByRole('link', { name: '기능 권한' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/features'))
    await screen.findByRole('region', { name: '기능 권한 표' })
    // 기능별 단계(읽기 전용)
    const card = screen.getByRole('group', { name: '카드 불러오기 단계' })
    expect(within(card).getByText('허용 목록')).toBeTruthy()
    expect(within(card).getByText('FEATURE_CARD_IMPORT=allowlist')).toBeTruthy()
    expect(within(card).getByText(/env 목록 2명/)).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '알리페이 파일 단계' })).getByText('FEATURE_FILE_IMPORT=allowlist')).toBeTruthy()
    // 관리자 권한(최근 순) → env 항목
    expect(grantRows()).toHaveLength(4)
    expect(toggle('여행자05', '카드 불러오기').getAttribute('aria-checked')).toBe('true')
    expect(toggle('여행자05', '위챗페이 파일').getAttribute('aria-checked')).toBe('false')
    expect(toggle('민지', '위챗페이 파일').getAttribute('aria-checked')).toBe('true')
    // env 항목: 토글은 꺼짐(관리자 권한 없음) + env 태그 + 지금 켜짐 + 동의·오늘 조회
    const junyong = grantRows().find((row) => within(row).queryByText('준용')) as HTMLElement
    expect(toggle('준용', '카드 불러오기').getAttribute('aria-checked')).toBe('false')
    expect(within(junyong).getByText('env')).toBeTruthy()
    expect(within(junyong).getByText('켜짐 · 미동의 · 오늘 6/10')).toBeTruthy()
    // 회원이 없는 env 항목에는 줄 수 없다
    expect(toggle(ADMIN_MOCK_USER.withdrawn, '카드 불러오기').disabled).toBe(true)
    expect(within(matrix()).getByText('없는 회원')).toBeTruthy()
  })

  it('옛 주소 /admin/card-import는 기능 권한으로 간다', async () => {
    signInAdminMock()
    const { router } = renderApp('/admin/card-import')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/features'))
    expect(await screen.findByRole('heading', { level: 1, name: '기능 권한' })).toBeTruthy()
  })

  it('기능이 꺼져 있으면 단계와 이유를 보여 준다', async () => {
    signInAdminMock()
    server.use(
      api.get<AdminFeatureGrantList>('/api/admin/feature-grants', () =>
        HttpResponse.json({
          asOf: '2026-10-29T12:00:00+09:00',
          features: [
            { feature: 'CARD_IMPORT', configuredMode: 'allowlist', effectiveMode: 'off', offReason: 'CODEF_KEYS_MISSING', envUserCount: 0 },
            { feature: 'FILE_IMPORT_WECHAT', configuredMode: 'on', effectiveMode: 'on', offReason: null, envUserCount: 0 },
            { feature: 'FILE_IMPORT_ALIPAY', configuredMode: 'on', effectiveMode: 'off', offReason: 'PROVIDER_DISABLED', envUserCount: 0 },
          ],
          cardImportDailyLimit: 10,
          items: [],
          truncated: false,
        }),
      ),
    )
    renderApp('/admin/features')
    const card = await screen.findByRole('group', { name: '카드 불러오기 단계' })
    expect(within(card).getByText('꺼짐')).toBeTruthy()
    expect(within(card).getByText('꺼져 있어 권한이 있어도 보이지 않아요')).toBeTruthy()
    expect(within(card).getByText(/CODEF 키가 없어 꺼짐/)).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '위챗페이 파일 단계' })).getByText('전체 공개')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '알리페이 파일 단계' })).getByText(/FILE_IMPORT_PROVIDERS에 없어 꺼짐/)).toBeTruthy()
    expect(screen.getByText('권한을 준 회원이 없어요')).toBeTruthy()
  })

  it('부여: 회원 검색 → 토글 → 확인 다이얼로그 → 켜지고 권한 있는 회원 목록에 보인다', async () => {
    signInAdminMock()
    renderApp('/admin/features')
    await screen.findByRole('region', { name: '기능 권한 표' })
    fireEvent.change(screen.getByLabelText('회원 검색'), { target: { value: '태현' } })
    fireEvent.click(screen.getByRole('button', { name: '회원 찾기' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '검색 결과 (1명)' })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('부여 메모(선택)'), { target: { value: '위챗 실파일 검증' } })
    fireEvent.click(toggle('태현', '위챗페이 파일'))
    const dialog = await screen.findByRole('alertdialog', { name: '태현 님에게 위챗페이 파일 권한을 줄까요?' })
    expect(within(dialog).getByText('다음 요청부터 바로 보여요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '권한 주기' }))
    expect(await screen.findByText('태현 님에게 위챗페이 파일 권한을 줬어요')).toBeTruthy()
    await waitFor(() => expect(toggle('태현', '위챗페이 파일').getAttribute('aria-checked')).toBe('true'))
    expect((screen.getByLabelText('부여 메모(선택)') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '권한 있는 회원 보기' }))
    await waitFor(() => expect(grantRows()).toHaveLength(5))
  })

  it('취소하면 아무것도 바뀌지 않는다', async () => {
    signInAdminMock()
    renderApp('/admin/features')
    await screen.findByRole('region', { name: '기능 권한 표' })
    fireEvent.click(toggle('여행자05', '알리페이 파일'))
    const dialog = await screen.findByRole('alertdialog', { name: '여행자05 님에게 알리페이 파일 권한을 줄까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(toggle('여행자05', '알리페이 파일').getAttribute('aria-checked')).toBe('false')
  })

  it('회수: 확인 다이얼로그(Danger) → 목록에서 빠진다', async () => {
    signInAdminMock()
    renderApp('/admin/features')
    await screen.findByRole('region', { name: '기능 권한 표' })
    fireEvent.click(toggle('여행자05', '카드 불러오기'))
    const dialog = await screen.findByRole('alertdialog', { name: '여행자05 님의 카드 불러오기 권한을 회수할까요?' })
    expect(within(dialog).getByText('다음 요청부터 보이지 않아요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '회수' }))
    expect(await screen.findByText('여행자05 님의 카드 불러오기 권한을 회수했어요')).toBeTruthy()
    await waitFor(() => expect(grantRows()).toHaveLength(3))
    expect(screen.queryByRole('link', { name: '여행자05' })).toBeNull()
  })

  it('env 회원에게 관리자 권한을 더하면 회수 안내가 "env로 계속 보여요"가 된다', async () => {
    signInAdminMock()
    renderApp('/admin/features')
    await screen.findByRole('region', { name: '기능 권한 표' })
    fireEvent.click(toggle('준용', '카드 불러오기'))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '권한 주기' }))
    await waitFor(() => expect(toggle('준용', '카드 불러오기').getAttribute('aria-checked')).toBe('true'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    fireEvent.click(toggle('준용', '카드 불러오기'))
    const dialog = await screen.findByRole('alertdialog', { name: '준용 님의 카드 불러오기 권한을 회수할까요?' })
    expect(within(dialog).getByText('env 목록에도 있어 회수해도 계속 보여요')).toBeTruthy()
  })

  it('서버가 거절하면(409) 문구를 보여 준다', async () => {
    signInAdminMock()
    server.use(api.post<never>('/api/admin/feature-grants', () => mockError('ADMIN_FEATURE_GRANT_EXISTS', 409)))
    renderApp('/admin/features')
    await screen.findByRole('region', { name: '기능 권한 표' })
    fireEvent.click(toggle('민지', '알리페이 파일'))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '권한 주기' }))
    expect(await screen.findByText('이미 이 기능 권한이 있는 회원이에요')).toBeTruthy()
  })

  it('회원 상세: 기능별 토글로 부여 → 확인 → 켜짐 → 회수(확인) → 꺼짐', async () => {
    signInAdminMock()
    renderApp(`/admin/users/${ADMIN_MOCK_USER.taehyeon}`)
    await screen.findByRole('heading', { level: 1, name: '태현' })
    const section = () => screen.getByRole('region', { name: '기능 권한' })
    const alipay = () => within(section()).getByRole('switch', { name: '태현 알리페이 파일 권한' })
    await waitFor(() => expect(alipay().getAttribute('aria-checked')).toBe('false'))
    fireEvent.click(alipay())
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '태현 님에게 알리페이 파일 권한을 줄까요?' })).getByRole('button', { name: '권한 주기' }))
    await waitFor(() => expect(alipay().getAttribute('aria-checked')).toBe('true'))
    expect(within(section()).getByText('태현 님에게 알리페이 파일 권한을 줬어요')).toBeTruthy()
    fireEvent.click(alipay())
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '태현 님의 알리페이 파일 권한을 회수할까요?' })).getByRole('button', { name: '회수' }))
    await waitFor(() => expect(alipay().getAttribute('aria-checked')).toBe('false'))
  })

  it('회원 상세: env로 준 카드 권한은 회수할 수 없다고 안내한다', async () => {
    signInAdminMock()
    renderApp(`/admin/users/${ADMIN_MOCK_USER.junyong}`)
    await screen.findByRole('heading', { level: 1, name: '준용' })
    const section = screen.getByRole('region', { name: '기능 권한' })
    expect(await within(section).findByText(/env로 준 권한이라 여기서 회수할 수 없어요/)).toBeTruthy()
    expect(within(section).getByRole('switch', { name: '준용 카드 불러오기 권한' }).getAttribute('aria-checked')).toBe('false')
  })
})
