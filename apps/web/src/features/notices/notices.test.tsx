import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BannerNotice } from '../../ds'
import { db, TRIP } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/render'
import { MOCK_NOTICES } from './mocks'
import { dismissedNoticeIds, dismissNotice, pickNotice } from './notices'

configure({ asyncUtilTimeout: 3000 })
vi.setConfig({ testTimeout: 15_000 })

const TITLE = MOCK_NOTICES.items[0].title
const OLDER = '개인정보처리방침을 바로잡고 카드 불러오기 안내를 더했어요'
const notice = (id: string, url = '/terms') => ({ id, title: id, url, startsAt: '', endsAt: '' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('공지 고르기 · 닫기 기억', () => {
  it('닫지 않은 것 중 서버 순서(최신부터) 첫 번째, 앱 밖 주소는 쓰지 않는다', () => {
    const items = [notice('new'), notice('old')]
    expect(pickNotice(items, [])?.id).toBe('new')
    expect(pickNotice(items, ['new'])?.id).toBe('old')
    expect(pickNotice(items, ['new', 'old'])).toBeNull()
    expect(pickNotice([notice('x', 'https://evil.example'), notice('y', '//evil.example')], [])).toBeNull()
  })

  it('닫으면 id를 localStorage에 기억한다(깨진 값은 빈 목록)', () => {
    dismissNotice('a')
    dismissNotice('b')
    dismissNotice('a')
    expect(dismissedNoticeIds()).toEqual(['b', 'a'])
    localStorage.setItem('yj:notices:dismissed', '{깨진 값')
    expect(dismissedNoticeIds()).toEqual([])
  })

  it('저장소를 못 쓰면(사생활 보호 모드) 오류 없이 지나간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(dismissedNoticeIds()).toEqual([])
    expect(() => dismissNotice('a')).not.toThrow()
  })
})

describe('Banner/Notice (DS)', () => {
  it('라벨·›는 한 버튼, ✕는 따로(이름 "공지 닫기")', () => {
    const onClick = vi.fn()
    const onClose = vi.fn()
    render(<BannerNotice label="개인정보처리방침이 바뀌어요 · 11.20부터" onClick={onClick} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '개인정보처리방침이 바뀌어요 · 11.20부터' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '공지 닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('onClick·onClose가 없으면 글자만(버튼 없음)', () => {
    render(<BannerNotice label="점검 안내" />)
    expect(screen.getByText('점검 안내')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('공지 배너 자리(Q-57 · HF-60·60b)', () => {
  const banner = () => screen.findByRole('button', { name: TITLE })

  it('GET /notices/active 첫 공지(이용약관 개정 예고): 결제내역 헤더 아래에 보이고 누르면 이용약관 예정본(0.2)', async () => {
    expect(MOCK_NOTICES.items.map((n) => [n.id, n.url])).toEqual([
      ['legal-v0.2-terms', '/terms?v=0.2'],
      ['legal-v0.2-privacy', '/privacy'],
    ])
    expect(TITLE).toMatch(/^이용약관이 바뀌어요 · \d{2}\.\d{2}부터$/)
    const { router } = renderApp(`/trips/${TRIP.osaka}/payments`)
    const button = await banner()
    expect(button.closest('[data-banner-notice]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: OLDER })).toBeNull()
    fireEvent.click(button)
    await waitFor(() => expect(router.state.location.pathname).toBe('/terms'))
    expect(router.state.location.search).toBe('?v=0.2')
  })

  it('✕로 닫으면 그 공지는 다른 화면(마이페이지)에서도 안 보인다', async () => {
    const first = renderApp(`/trips/${TRIP.osaka}/payments`)
    await banner()
    fireEvent.click(screen.getByRole('button', { name: '공지 닫기' }))
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull())
    expect(dismissedNoticeIds()).toEqual(['legal-v0.2-terms'])
    // 한 번에 하나: 닫으면 그다음(처리방침 정정·카드 불러오기 안내) 공지
    expect(await screen.findByRole('button', { name: OLDER })).toBeTruthy()
    first.unmount()
    renderApp('/me')
    await screen.findByRole('heading', { name: '준용' })
    expect(screen.queryByText(TITLE)).toBeNull()
  })

  it('마이페이지(WF-30) 위', async () => {
    renderApp('/me')
    expect(await banner()).toBeTruthy()
  })

  it('여정 없음(WF-09)', async () => {
    db.memberships = db.memberships.filter((m) => m.userId !== db.meUserId)
    renderApp('/trips')
    expect(await banner()).toBeTruthy()
    expect(screen.getByRole('heading', { name: '참여한 여정이 없어요' })).toBeTruthy()
  })

  it('시작 전 여정 정보(WF-16)에는 있고, 진행 중 여정 정보·현황에는 없다', async () => {
    const upcoming = renderApp(`/trips/${TRIP.busan}/info`)
    expect(await banner()).toBeTruthy()
    upcoming.unmount()

    const info = renderApp(`/trips/${TRIP.osaka}/info`)
    await screen.findByRole('heading', { level: 2, name: '여정 정보' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(TITLE)).toBeNull()
    info.unmount()

    renderApp(`/trips/${TRIP.osaka}/stats`)
    await waitFor(() => expect(document.querySelector('main')).toBeTruthy())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(TITLE)).toBeNull()
  })

  it('최신 공지 하나만, 닫으면 다음 공지', async () => {
    server.use(
      http.get('/api/notices/active', () =>
        HttpResponse.json({ items: [notice('새 공지', '/privacy'), notice('옛 공지')] }),
      ),
    )
    renderApp('/me')
    expect(await screen.findByRole('button', { name: '새 공지' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '옛 공지' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '공지 닫기' }))
    expect(await screen.findByRole('button', { name: '옛 공지' })).toBeTruthy()
  })

  it('공지가 없거나 API가 실패하면 그리지 않는다(토스트 없음)', async () => {
    server.use(http.get('/api/notices/active', () => HttpResponse.json({ code: 'INTERNAL', message: 'x' }, { status: 500 })))
    renderApp('/me')
    await screen.findByRole('heading', { name: '준용' })
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelector('[data-banner-notice]')).toBeNull()
    expect(screen.queryByRole('status', { name: /오류|실패/ })).toBeNull()
  })
})
