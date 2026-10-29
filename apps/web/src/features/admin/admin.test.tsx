import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { api, mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { ADMIN_MOCK_CREDENTIALS, ADMIN_MOCK_USER, resetAdminMock, signInAdminMock } from './mocks'
import { formatWait } from './format'
import { safeAdminReturnTo } from './paths'

afterEach(() => resetAdminMock())

type Router = ReturnType<typeof renderApp>['router']
const location = (router: Router) => `${router.state.location.pathname}${router.state.location.search}`

async function login(username: string, password: string) {
  fireEvent.change(await screen.findByLabelText('아이디'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))
}

const userRows = () => within(screen.getByRole('region', { name: '회원 목록 표' })).getAllByRole('row').slice(1)

describe('관리자 로그인 /admin/login', () => {
  it('맞는 자격 증명이면 returnTo(관리자 화면)로 간다', async () => {
    const { router } = renderApp('/admin/login?returnTo=%2Fadmin%2Fcodef')
    await login(ADMIN_MOCK_CREDENTIALS.username, ADMIN_MOCK_CREDENTIALS.password)
    await waitFor(() => expect(location(router)).toBe('/admin/codef'))
    expect(await screen.findByRole('heading', { level: 1, name: 'CODEF 현황' })).toBeTruthy()
  })

  it('틀리면 어느 쪽이 틀렸는지 말하지 않는 일반 문구 + 비밀번호만 비운다', async () => {
    renderApp('/admin/login')
    await login('admin', 'wrong-password')
    expect((await screen.findByRole('alert')).textContent).toBe('아이디 또는 비밀번호가 맞지 않아요')
    expect((screen.getByLabelText('아이디') as HTMLInputElement).value).toBe('admin')
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('')
  })

  it('여러 번 틀리면 429 문구와 남은 시간', async () => {
    renderApp('/admin/login')
    for (let i = 0; i < 5; i += 1) {
      await login('admin', `wrong-${i}`)
      await screen.findByText('아이디 또는 비밀번호가 맞지 않아요')
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
    expect(within(junyong).getByText('허용 목록 · 켜짐')).toBeTruthy()
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

  it('탈퇴 처리: 사유·닉네임이 맞아야 버튼이 켜지고 → 확인 다이얼로그 → 목록 + 안내', async () => {
    signInAdminMock()
    const { router } = renderApp(`/admin/users/${ADMIN_MOCK_USER.taehyeon}`)
    await screen.findByRole('heading', { level: 1, name: '태현' })
    const submit = () => screen.getByRole('button', { name: '탈퇴 처리' }) as HTMLButtonElement
    expect(submit().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '고객센터 요청 처리' } })
    fireEvent.change(screen.getByLabelText('닉네임 다시 입력'), { target: { value: '태' } })
    expect(submit().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('닉네임 다시 입력'), { target: { value: '태현' } })
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
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '고객센터 요청 처리' } })
    fireEvent.change(screen.getByLabelText('닉네임 다시 입력'), { target: { value: '태현' } })
    fireEvent.click(screen.getByRole('button', { name: '탈퇴 처리' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '탈퇴 처리' }))
    expect(await screen.findByText('닉네임이 맞지 않아요')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: '태현' })).toBeTruthy()
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
