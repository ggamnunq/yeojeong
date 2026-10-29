import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keys } from '../../../api'
import { db } from '../../../mocks/data'
import { renderApp } from '../../../test/render'
import { expireConnections } from '../../wallet/mocks'
import { mailto } from '../mailto'

// 전체 실행 때 lazy 화면·목 응답이 늦을 수 있어 기다림을 늘린다
configure({ asyncUtilTimeout: 3000 })
vi.setConfig({ testTimeout: 15_000 })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('마이페이지(HF-30)', () => {
  it('위에서부터 프사·닉네임 → 내 지갑(계좌 1 · 카드 2) → 로그아웃 → 탈퇴·삭제 요청 → 푸터 링크', async () => {
    renderApp('/me')
    expect(await screen.findByRole('heading', { name: '마이페이지' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '준용' })).toBeTruthy()
    const wallet = screen.getByRole('link', { name: /내 지갑/ })
    expect(wallet.getAttribute('href')).toBe('/wallet')
    expect(await within(wallet).findByText('계좌 1 · 카드 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '탈퇴·삭제 요청' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '이용약관' }).getAttribute('href')).toBe('/terms')
    expect(screen.getByRole('link', { name: '개인정보처리방침' }).getAttribute('href')).toBe('/privacy')
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

  it('로그아웃: 확인 없이 POST /auth/logout → 캐시 비움 → /login', async () => {
    const { router, queryClient } = renderApp('/me')
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('')
    expect(db.session).toBe('ANONYMOUS')
    // 로그인 화면 가드가 세션을 새로 묻고, 다른 캐시는 비어 있다
    await waitFor(() => expect(queryClient.getQueryData(keys.session)).toEqual({ status: 'ANONYMOUS' }))
    await waitFor(() => {
      expect(queryClient.getQueryData(keys.wallet.methods)).toBeUndefined()
      expect(queryClient.getQueryData(keys.me)).toBeUndefined()
    })
    expect(router.state.location.search).toBe('')
  })

  it('탈퇴·삭제 요청: 요청 코드 복사 → "메일 보내기"는 코드가 든 메일 초안(mailto)을 연다', async () => {
    const open = vi.spyOn(mailto, 'open').mockImplementation(() => {})
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderApp('/me')
    fireEvent.click(await screen.findByRole('button', { name: '탈퇴·삭제 요청' }))
    const dialog = await screen.findByRole('alertdialog', { name: '탈퇴·삭제 요청' })
    expect(within(dialog).getByText('YJD-7K2M-Q9XA-4TRP')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /요청 코드 .* 복사/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('YJD-7K2M-Q9XA-4TRP'))
    expect(await screen.findByText('복사했어요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '메일 보내기' }))
    expect(open).toHaveBeenCalledTimes(1)
    const url = open.mock.calls[0][0] as string
    expect(url.startsWith('mailto:support@jinyeojeong.com?')).toBe(true)
    expect(decodeURIComponent(url)).toContain('YJD-7K2M-Q9XA-4TRP')
  })
})
