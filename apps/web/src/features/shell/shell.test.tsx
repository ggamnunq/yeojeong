import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider, type MemberSummary, type TripDetail } from '../../api'
import { buildRoutes, featureRoutes } from '../../app/router'
import type { AppRoute } from '../../app/routes'
import { useShellCta } from '../../app/shellCta'
import { db, MEMBER, TRIP, USER } from '../../mocks/data'
import { createTestQueryClient, renderApp } from '../../test/render'
import { canKick, eventMessage, formatInviteCode, leaveMessage, tripMeta } from './rules'

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname

const member = (over: Partial<MemberSummary>): MemberSummary => ({
  membershipId: 'm',
  nickname: '민지',
  profileImageUrl: null,
  role: 'MEMBER',
  joinOrder: 2,
  isMe: false,
  isLeft: false,
  isWithdrawn: false,
  ...over,
})

describe('셸 규칙', () => {
  it('드롭다운 메타: 진행 중 · 시작 전 · MM.DD · 정산 완료', () => {
    expect(tripMeta({ status: 'ONGOING', startDate: '2026-11-12' })).toBe('진행 중')
    expect(tripMeta({ status: 'UPCOMING', startDate: '2026-12-27' })).toBe('시작 전 · 12.27')
    expect(tripMeta({ status: 'ENDED', startDate: '2026-08-21' })).toBe('정산 완료')
  })

  it('초대코드 3-3', () => {
    expect(formatInviteCode('K7M2QX')).toBe('K7M-2QX')
  })

  it('강퇴는 그룹장 화면 · 남의 행 · 종료 전만', () => {
    const me = { membershipId: 'me', role: 'LEADER' as const, pendingCount: 0, connectionExpired: false }
    expect(canKick({ me, status: 'ONGOING' }, member({}))).toBe(true)
    expect(canKick({ me, status: 'ONGOING' }, member({ isMe: true }))).toBe(false)
    expect(canKick({ me, status: 'ENDED' }, member({}))).toBe(false)
    expect(canKick({ me: { ...me, role: 'MEMBER' }, status: 'UPCOMING' }, member({}))).toBe(false)
  })

  it('나가기 한 줄: 그룹장 → 다음 그룹장, 진행 중 멤버 → 정산 안내, 시작 전 멤버 → 없음', () => {
    const me = member({ membershipId: 'a', nickname: '준용', isMe: true, joinOrder: 1, role: 'LEADER' })
    const others = [member({ membershipId: 'c', nickname: '태현', joinOrder: 3 }), member({ membershipId: 'b', joinOrder: 2 })]
    const base = { members: [me, ...others], me: { membershipId: 'a', role: 'LEADER' as const, pendingCount: 0, connectionExpired: false } }
    expect(leaveMessage({ ...base, status: 'ONGOING' })).toBe('민지님이 그룹장이 돼요')
    const asMember = { ...base, me: { ...base.me, role: 'MEMBER' as const } }
    expect(leaveMessage({ ...asMember, status: 'ONGOING' })).toBe('낸 결제와 부담은 정산에 남아요')
    expect(leaveMessage({ ...asMember, status: 'UPCOMING' })).toBe('')
  })

  it('이벤트 문구', () => {
    expect(eventMessage({ id: '1', type: 'LEADER_CHANGED', payload: { nickname: '민지' } })).toBe('민지님이 새 그룹장이에요')
    expect(eventMessage({ id: '2', type: 'FX_POLICY_CHANGED', payload: {} })).toBe('새 환율로 다시 계산했어요')
  })
})

describe('HF-13 셸', () => {
  it('시작 전: 결제내역 · 현황 탭이 잠겨 있고 눌러도 이동하지 않는다', async () => {
    const { router } = renderApp('/trips/trip-busan/info')
    const locked = await screen.findByRole('button', { name: '결제내역' })
    expect(locked.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: '현황' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(locked)
    expect(path(router)).toBe('/trips/trip-busan/info')
  })

  it('그룹명은 H2(ShellApp) · 헤더 구분선 없음', async () => {
    renderApp('/trips/trip-osaka/payments')
    const name = await screen.findByText('오사카 3박 4일', { selector: 'span' })
    expect(name.className).toContain('text-h2')
  })

  it('페이지가 useShellCta로 하단 CTA를 달고, 떠나면 지운다', async () => {
    const onClick = vi.fn()
    function CtaPage() {
      useShellCta({ label: '여정 시작', onClick })
      return <h2>여정 정보</h2>
    }
    const routes: AppRoute[] = [
      ...featureRoutes.filter((r) => r.path !== '/trips/:tripId/info'),
      { layout: 'trip', path: '/trips/:tripId/info', Component: CtaPage },
    ]
    const router = createMemoryRouter(buildRoutes(routes), { initialEntries: ['/trips/trip-busan/info'] })
    render(
      <ApiProvider client={createTestQueryClient()}>
        <RouterProvider router={router} />
      </ApiProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: '여정 시작' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    await router.navigate('/trips/trip-osaka/payments')
    await screen.findByRole('heading', { name: '결제내역' })
    expect(screen.queryByRole('button', { name: '여정 시작' })).toBeNull()
  })
})

describe('HF-14 그룹 드롭다운', () => {
  const openMenu = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /오사카 3박 4일/ }))
    return screen.findByRole('menu', { name: '여정 전환' })
  }

  it('진행 중 → 시작 전 → 종료 순, 메타 글자, 현재 여정 체크', async () => {
    renderApp('/trips/trip-osaka/payments')
    const menu = await openMenu()
    await waitFor(() => expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(3))
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent)).toEqual(['오사카 3박 4일진행 중', '부산 연말 모임시작 전 · 12.27', '제주 우정여행정산 완료'])
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(screen.getByRole('button', { name: /오사카 3박 4일/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('다른 여정을 고르면 그 여정의 기본 탭으로', async () => {
    const { router } = renderApp('/trips/trip-osaka/payments')
    const menu = await openMenu()
    fireEvent.click(await within(menu).findByRole('menuitemradio', { name: /제주 우정여행/ }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-jeju/settlement'))
  })

  it('새 여정 만들기 · 초대코드로 참여', async () => {
    const first = renderApp('/trips/trip-osaka/payments')
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: '새 여정 만들기' }))
    await waitFor(() => expect(path(first.router)).toBe('/trips/new'))
    first.unmount()

    const second = renderApp('/trips/trip-osaka/payments')
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: '초대코드로 참여' }))
    await waitFor(() => expect(path(second.router)).toBe('/join'))
  })
})

describe('HF-15 그룹원 패널', () => {
  afterEach(() => vi.unstubAllGlobals())

  const openPanel = async () => {
    fireEvent.click(await screen.findByRole('button', { name: '그룹 구성원' }))
    return screen.findByRole('dialog', { name: /그룹원 \d명/ })
  }

  it('그룹장 화면: 나 먼저 · 왕관 · 나 배지, 남의 행에만 강퇴', async () => {
    renderApp('/trips/trip-osaka/payments')
    const panel = await openPanel()
    expect(within(panel).getByRole('heading', { name: '그룹원 4명' })).toBeTruthy()
    expect(within(panel).getByLabelText('그룹장')).toBeTruthy()
    expect(within(panel).getAllByRole('button', { name: /강퇴$/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      '민지 강퇴',
      '태현 강퇴',
      '수빈 강퇴',
    ])
    expect(within(panel).getByText('K7M-2QX')).toBeTruthy()
  })

  it('강퇴: 확인 다이얼로그 → 내보내기 → 토스트 · 행 사라짐', async () => {
    renderApp('/trips/trip-osaka/payments')
    const panel = await openPanel()
    fireEvent.click(within(panel).getByRole('button', { name: '민지 강퇴' }))
    const dialog = await screen.findByRole('alertdialog', { name: '민지님을 내보낼까요?' })
    expect(within(dialog).getByText('부담한 금액은 정산에 남아요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '내보내기' }))
    expect(await screen.findByText('민지님을 내보냈어요')).toBeTruthy()
    expect(await within(panel).findByRole('heading', { name: '그룹원 3명' })).toBeTruthy()
    expect(db.memberships.find((m) => m.membershipId === MEMBER.minji)?.leftAt).not.toBeNull()
  })

  it('멤버 화면에는 강퇴가 없고, 종료 후에는 초대코드도 없다', async () => {
    const upcoming = renderApp('/trips/trip-busan/info')
    let panel = await openPanel()
    expect(within(panel).queryByRole('button', { name: /강퇴$/ })).toBeNull()
    expect(within(panel).getByText('B8N-4RT')).toBeTruthy()
    upcoming.unmount()

    renderApp('/trips/trip-jeju/settlement')
    panel = await openPanel()
    expect(within(panel).queryByText('초대코드')).toBeNull()
    expect(within(panel).queryByRole('button', { name: /강퇴$/ })).toBeNull()
  })

  it('초대코드 복사 → 3-3 형식 그대로 · 토스트', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderApp('/trips/trip-osaka/payments')
    const panel = await openPanel()
    fireEvent.click(within(panel).getByRole('button', { name: '초대코드 복사' }))
    expect(await screen.findByText('복사했어요')).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('K7M-2QX')
  })

  it('초대코드 [초대 QR](복사 왼쪽) → HF-61 초대 QR 시트(W8)', async () => {
    renderApp('/trips/trip-osaka/payments')
    const panel = await openPanel()
    const qr = within(panel).getByRole('button', { name: '초대 QR' })
    const copy = within(panel).getByRole('button', { name: '초대코드 복사' })
    expect(qr.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(qr)
    const sheet = await screen.findByRole('dialog', { name: '초대 QR' })
    expect(within(sheet).getByRole('img', { name: '오사카 3박 4일 참여 QR 코드' })).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: '링크 복사' })).toBeTruthy()
  })

  it('그룹장이 나가면 다음 멤버가 승계하고, 나는 진입 라우팅으로 간다', async () => {
    const { router } = renderApp('/trips/trip-osaka/payments')
    const panel = await openPanel()
    fireEvent.click(within(panel).getByRole('button', { name: '그룹 나가기' }))
    const dialog = await screen.findByRole('alertdialog', { name: '그룹에서 나갈까요?' })
    expect(within(dialog).getByText('민지님이 그룹장이 돼요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '나가기' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-busan/info'))
    expect(db.memberships.find((m) => m.membershipId === MEMBER.minji)?.role).toBe('LEADER')
    expect(db.tripEvents).toHaveLength(1)
  })
})

describe('1회성 이벤트 토스트(FR-004)', () => {
  it('내가 하지 않은 그룹장 승계를 한 번 알리고 ack한다', async () => {
    db.tripEvents.push({
      id: 'evt-1',
      tripId: TRIP.osaka,
      type: 'LEADER_CHANGED',
      payload: { nickname: '민지' },
      actorUserId: USER.minji,
      seenBy: [],
    })
    const { router } = renderApp('/trips/trip-osaka/payments')
    expect(await screen.findByText('민지님이 새 그룹장이에요')).toBeTruthy()
    await waitFor(() => expect(db.tripEvents[0].seenBy).toContain(USER.junyong))

    await router.navigate('/trips/trip-osaka/stats')
    await screen.findByRole('heading', { name: '현황' })
    expect(screen.getAllByText('민지님이 새 그룹장이에요')).toHaveLength(1)
  })

  it('행위자 본인에게는 보이지 않는다', async () => {
    db.tripEvents.push({ id: 'evt-1', tripId: TRIP.osaka, type: 'FX_POLICY_CHANGED', payload: {}, actorUserId: USER.junyong, seenBy: [] })
    renderApp('/trips/trip-osaka/payments')
    await screen.findByRole('heading', { name: '결제내역' })
    const trip = (await (await fetch('/api/trips/trip-osaka')).json()) as TripDetail
    expect(trip.unseenEvents).toEqual([])
    expect(screen.queryByText('새 환율로 다시 계산했어요')).toBeNull()
  })
})
