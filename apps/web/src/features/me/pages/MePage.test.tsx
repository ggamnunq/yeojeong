import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keys } from '../../../api'
import { http, HttpResponse } from 'msw'
import { db, meOf } from '../../../mocks/data'
import { server } from '../../../mocks/server'
import { renderApp } from '../../../test/render'
import { hasPendingInvite, rememberPendingInvite } from '../../trips/pendingInvite'
import { expireConnections } from '../../wallet/mocks'

// 전체 실행 때 lazy 화면·목 응답이 늦을 수 있어 기다림을 늘린다
configure({ asyncUtilTimeout: 3000 })
vi.setConfig({ testTimeout: 15_000 })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('마이페이지(HF-30)', () => {
  // 지갑 요약 "계좌 a · 카드 c"는 토스 연결 기능이 켜져 있을 때(FR-006). 꺼진 기본값은 아래 "결제 n건"
  beforeEach(() => {
    db.accountLink = true
  })

  it('토스 연결이 꺼져 있으면 "결제 n건"(지갑 항목 수)이고 연결 만료 태그가 없다', async () => {
    db.accountLink = false
    expireConnections()
    renderApp('/me')
    const wallet = await screen.findByRole('link', { name: /내 지갑/ })
    expect(await within(wallet).findByText('결제 7건')).toBeTruthy()
    expect(within(wallet).queryByText('연결 만료')).toBeNull()
  })

  it('서버가 지갑 항목 수를 주지 않으면 "내 지갑"만', async () => {
    db.accountLink = false
    server.use(http.get('/api/users/me', () => HttpResponse.json(meOf())))
    renderApp('/me')
    const wallet = await screen.findByRole('link', { name: /내 지갑/ })
    await screen.findByRole('heading', { name: '준용' })
    expect(within(wallet).queryByText(/결제 \d+건/)).toBeNull()
  })

  it('위에서부터 프사·닉네임 → 내 지갑(계좌 1 · 카드 2) → 로그아웃 → 탈퇴 → 푸터 링크', async () => {
    renderApp('/me')
    expect(await screen.findByRole('heading', { level: 1, name: '마이페이지' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '준용' })).toBeTruthy()
    const wallet = screen.getByRole('link', { name: /내 지갑/ })
    expect(wallet.getAttribute('href')).toBe('/wallet')
    expect(await within(wallet).findByText('계좌 1 · 카드 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy()
    // HF-30: "탈퇴·삭제 요청"(요청 코드 메일) 자리가 "탈퇴"(› 없음, HF-59로)로 바뀌었다
    expect(screen.getByRole('link', { name: '탈퇴' }).getAttribute('href')).toBe('/me/withdraw')
    expect(screen.queryByRole('button', { name: '탈퇴·삭제 요청' })).toBeNull()
    expect(screen.getByRole('link', { name: '이용약관' }).getAttribute('href')).toBe('/terms')
    expect(screen.getByRole('link', { name: '개인정보처리방침' }).getAttribute('href')).toBe('/privacy')
    // 앱 버전: 푸터 바로 아래 한 줄(빌드 값 = apps/web package.json version)
    const version = screen.getByText('베타 v0.1.0')
    expect(version.tagName).toBe('P')
    expect(version.className).toContain('text-caption')
    expect(version.className).toContain('text-tertiary')
    expect(version.className).toContain('text-center')
    expect(version.previousElementSibling?.textContent).toBe('이용약관 · 개인정보처리방침')
    // MVP에서 뺀 항목
    expect(screen.queryByText('닉네임 변경')).toBeNull()
    expect(screen.queryByText(/버전/)).toBeNull()
  })

  it('결제수단이 없으면 "연결 안 됨"', async () => {
    for (const p of db.paymentMethods) if (p.userId === db.meUserId) p.status = 'REMOVED'
    renderApp('/me')
    expect(await screen.findByText('연결 안 됨')).toBeTruthy()
  })

  it('연결이 만료됐으면 지갑 줄 오른쪽에 「연결 만료」, 아니면 없음', async () => {
    const first = renderApp('/me')
    const wallet = await screen.findByRole('link', { name: /내 지갑/ })
    await within(wallet).findByText('계좌 1 · 카드 2')
    expect(within(wallet).queryByText('연결 만료')).toBeNull()
    first.unmount()

    expireConnections()
    renderApp('/me')
    expect(await within(await screen.findByRole('link', { name: /내 지갑/ })).findByText('연결 만료')).toBeTruthy()
  })

  it('로그아웃: 확인 없이 POST /auth/logout → 캐시 비움 → /login(보관 중 초대도 버린다, W8 L2)', async () => {
    rememberPendingInvite('T4K9YP')
    const { router, queryClient } = renderApp('/me')
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('')
    expect(db.session).toBe('ANONYMOUS')
    expect(hasPendingInvite()).toBe(false)
    // 로그인 화면 가드가 세션을 새로 묻고, 다른 캐시는 비어 있다
    await waitFor(() => expect(queryClient.getQueryData(keys.session)).toMatchObject({ status: 'ANONYMOUS' }))
    await waitFor(() => {
      expect(queryClient.getQueryData(keys.wallet.methods)).toBeUndefined()
      expect(queryClient.getQueryData(keys.me)).toBeUndefined()
    })
    expect(router.state.location.search).toBe('')
  })
})
