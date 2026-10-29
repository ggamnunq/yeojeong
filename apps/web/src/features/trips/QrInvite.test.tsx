import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { activeMembership, db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { rememberPendingInvite } from './pendingInvite'
import { qrMatrix, qrPath } from './qr'
import { setupMockToday, stubNavigator, toastMessages } from './test-utils'

setupMockToday()

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname
const joinLink = (code: string) => `${window.location.origin}/join?code=${code}`

describe('HF-61 초대 QR 시트(W8)', () => {
  it('HF-11: [QR][복사][공유] 순서 · QR → 시트(참여 링크 QR · 코드) · 「링크 복사」는 공유 내용 그대로', async () => {
    const nav = stubNavigator()
    renderApp('/trips/trip-osaka/created')
    const qrButton = await screen.findByRole('button', { name: '초대 QR' })
    const row = qrButton.parentElement!
    expect(within(row).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      '초대 QR',
      '복사',
      '공유',
    ])
    fireEvent.click(qrButton)
    const sheet = await screen.findByRole('dialog', { name: '초대 QR' })
    const qr = within(sheet).getByRole('img', { name: '오사카 3박 4일 참여 QR 코드' })
    expect(qr.querySelector('path')!.getAttribute('d')).toBe(qrPath(qrMatrix(joinLink('K7M2QX'))))
    expect(within(sheet).getByText('K7M-2QX')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: '링크 복사' }))
    await waitFor(() => expect(toastMessages()).toContain('복사했어요'))
    expect(nav.writeText).toHaveBeenCalledWith(`오사카 3박 4일 초대코드 K7M-2QX\n${joinLink('K7M2QX')}`)
    // ✕로 닫는다
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '초대 QR' })).toBeNull())
  })

  it('HF-16 · 23 초대코드 행: [QR][복사] · 복사는 그대로 코드만', async () => {
    const nav = stubNavigator()
    renderApp('/trips/trip-busan/info')
    const qrButton = await screen.findByRole('button', { name: '초대 QR' })
    fireEvent.click(screen.getByRole('button', { name: '초대코드 복사' }))
    await waitFor(() => expect(nav.writeText).toHaveBeenCalledWith('B8N-4RT'))
    fireEvent.click(qrButton)
    const sheet = await screen.findByRole('dialog', { name: '초대 QR' })
    expect(within(sheet).getByRole('img', { name: '부산 연말 모임 참여 QR 코드' })).toBeTruthy()
    expect(within(sheet).getByText('B8N-4RT')).toBeTruthy()
  })

  it('종료된 여정(초대코드 없음)에는 QR 버튼도 없다', async () => {
    renderApp('/trips/trip-jeju/info')
    await screen.findByRole('heading', { name: '여정 정보' })
    expect(screen.queryByRole('button', { name: '초대 QR' })).toBeNull()
  })
})

describe('HF-62 QR 진입 초대 응답 시트(W8)', () => {
  it('첫 화면 위에 시트: 제목 · 장소 · 그룹장 · "3명" → 참여하기 → 시작 전 여정 정보', async () => {
    rememberPendingInvite('T4K9YP')
    const { router } = renderApp('/trips/trip-osaka/payments')
    const sheet = await screen.findByRole('dialog', { name: '도쿄 먹방 여행에 참여할까요?' })
    expect(within(sheet).getByText('도쿄')).toBeTruthy()
    expect(within(sheet).getByText('태현')).toBeTruthy()
    expect(within(sheet).getByRole('img', { name: '그룹장' })).toBeTruthy()
    expect(within(sheet).getByText('3명')).toBeTruthy()
    expect(within(sheet).queryByRole('button', { name: '닫기' })).toBeNull()
    // 보관함은 시트를 띄울 때 비운다
    expect(sessionStorage.getItem('yj:invite:pending')).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: '참여하기' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-tokyo/info'))
    expect(activeMembership('trip-tokyo', db.meUserId)).toMatchObject({ role: 'MEMBER' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /참여할까요/ })).toBeNull())
  })

  it('진행 중 여정은 참여하면 결제내역', async () => {
    rememberPendingInvite('D7N3QA')
    const { router } = renderApp('/trips/trip-osaka/payments')
    const sheet = await screen.findByRole('dialog', { name: '다낭 가족여행에 참여할까요?' })
    fireEvent.click(within(sheet).getByRole('button', { name: '참여하기' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-danang/payments'))
  })

  it('취소: 참여하지 않고 시트만 닫는다(첫 화면 그대로)', async () => {
    rememberPendingInvite('T4K9YP')
    const { router } = renderApp('/trips/trip-osaka/payments')
    const sheet = await screen.findByRole('dialog', { name: '도쿄 먹방 여행에 참여할까요?' })
    fireEvent.click(within(sheet).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /참여할까요/ })).toBeNull())
    expect(path(router)).toBe('/trips/trip-osaka/payments')
    expect(activeMembership('trip-tokyo', db.meUserId)).toBeUndefined()
  })

  it('참여 요청이 429면 시트를 그대로 두고 토스트(다시 누를 수 있다) · 인원 초과면 시트를 닫고 안내', async () => {
    rememberPendingInvite('T4K9YP')
    server.use(http.post('/api/invites/join', () => mockError('RATE_LIMITED', 429)))
    renderApp('/trips/trip-osaka/payments')
    const sheet = await screen.findByRole('dialog', { name: '도쿄 먹방 여행에 참여할까요?' })
    fireEvent.click(within(sheet).getByRole('button', { name: '참여하기' }))
    await waitFor(() => expect(toastMessages().length).toBeGreaterThan(0))
    expect(screen.getByRole('dialog', { name: '도쿄 먹방 여행에 참여할까요?' })).toBeTruthy()
    await waitFor(() => expect((within(sheet).getByRole('button', { name: '참여하기' }) as HTMLButtonElement).getAttribute('aria-busy')).toBeNull())

    server.use(http.post('/api/invites/join', () => mockError('MEMBER_LIMIT_EXCEEDED')))
    fireEvent.click(within(sheet).getByRole('button', { name: '참여하기' }))
    await waitFor(() => expect(toastMessages()).toContain('참여할 수 없는 여정이에요'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /참여할까요/ })).toBeNull())
  })

  it('이미 멤버면 시트 없이 그 여정으로 + "이미 참여한 여정이에요"', async () => {
    rememberPendingInvite('K7M2QX')
    const { router } = renderApp('/trips/trip-busan/info')
    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/payments'))
    expect(toastMessages()).toContain('이미 참여한 여정이에요')
    expect(screen.queryByRole('dialog', { name: /참여할까요/ })).toBeNull()
  })

  it.each([
    ['형식이 틀린 코드', 'ABC', '초대코드를 다시 확인해 주세요'],
    ['없는 코드', 'ZZZZZZ', '초대코드를 다시 확인해 주세요'],
    ['강퇴된 여정', 'X2P8RW', '참여할 수 없는 여정이에요'],
  ])('%s → 시트 없이 첫 화면 + 토스트', async (_, code, message) => {
    rememberPendingInvite(code)
    const { router } = renderApp('/trips/trip-osaka/payments')
    await waitFor(() => expect(toastMessages()).toContain(message))
    expect(path(router)).toBe('/trips/trip-osaka/payments')
    expect(screen.queryByRole('dialog', { name: /참여할까요/ })).toBeNull()
  })

  it('첫 화면이 아니면(작성 화면 등) 기다렸다가 첫 화면에서 띄운다', async () => {
    rememberPendingInvite('T4K9YP')
    const { router } = renderApp('/trips/new')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('dialog', { name: /참여할까요/ })).toBeNull()
    expect(sessionStorage.getItem('yj:invite:pending')).not.toBeNull()
    await router.navigate('/trips/trip-osaka/payments')
    expect(await screen.findByRole('dialog', { name: '도쿄 먹방 여행에 참여할까요?' })).toBeTruthy()
  })
})

describe('HF-62b 로그인 화면 안내', () => {
  it('초대가 보관돼 있으면 카카오 버튼 위 "초대받은 여정이 있어요"(그룹 이름은 보이지 않는다)', async () => {
    db.session = 'ANONYMOUS'
    rememberPendingInvite('T4K9YP')
    renderApp('/login')
    expect(await screen.findByText('초대받은 여정이 있어요')).toBeTruthy()
    expect(screen.queryByText(/도쿄/)).toBeNull()
  })

  it('없으면 안내도 없다', async () => {
    db.session = 'ANONYMOUS'
    renderApp('/login')
    await screen.findByRole('button', { name: /카카오/ })
    expect(screen.queryByText('초대받은 여정이 있어요')).toBeNull()
  })
})
