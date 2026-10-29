import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db, TRIP, USER } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'

const PAYMENTS = `/trips/${TRIP.osaka}/payments`

// 앱 전체(가드·셸·lazy 페이지)를 그리는 테스트라 여러 파일이 함께 돌 때 첫 화면이 늦을 수 있다
configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(async () => {
  // lazy 페이지를 미리 받아 첫 테스트가 느려지지 않게
  await import('./pages/PaymentsPage')
})

const section = (name: RegExp) => screen.getByRole('region', { name })
const rowNames = (region: HTMLElement) =>
  within(region)
    .getAllByRole('button')
    .map((b) => b.querySelector('.text-body-m-strong')?.textContent)

describe('결제내역 · 리스트(WF-18)', () => {
  it('날짜별 최신순 · 배너 · 메타 · 미확정 칩 · 합계 없는 날짜 헤더', async () => {
    renderApp(PAYMENTS)
    const day2 = await screen.findByRole('region', { name: '11.13 (금) Day 2' })
    expect(rowNames(day2)).toEqual([
      '551 호라이 난바본점',
      '우메다 스카이빌딩 공중정원',
      'MK택시',
      '오사카성 천수각',
      '오사카성 천수각',
      '오사카 주유패스 4매',
      '패밀리마트 난바역점',
    ])
    expect(rowNames(section(/11\.12 \(목\) Day 1/))).toEqual([
      '쿠시카츠 다루마 신세카이점',
      '돈키호테 도톤보리점',
      '이치란 라멘 도톤보리점',
      '난카이 라피트 간사이공항역',
    ])
    expect(screen.getByRole('button', { name: '확인 필요 2건' })).toBeTruthy()

    const hourai = within(day2).getByRole('button', { name: /551 호라이/ })
    expect(hourai.textContent).toContain('18:20 · 내 결제')
    expect(hourai.textContent).toContain('미확정')
    expect(hourai.textContent).toContain('₩25,740')
    expect(hourai.textContent).toContain('¥2,800')
    // 공동 = 부담 인원 스택(나 먼저 → 가입 순), 남의 결제 메타는 닉네임만
    const mk = within(day2).getByRole('button', { name: /MK택시/ })
    expect(within(mk).getByRole('img', { name: '부담 인원 나, 민지' })).toBeTruthy()
    expect(within(day2).getByRole('button', { name: /우메다/ }).textContent).toContain('16:40 · 민지')
    expect(within(section(/Day 1/)).getByRole('button', { name: /돈키호테/ }).textContent).toContain('개인')
    // C-07: 날짜 헤더에 합계 없음
    expect(screen.queryByText(/공동 ₩/)).toBeNull()
  })

  it('중복 의심 두 행 · 환불 묶음(취소 줄 + 합계)', async () => {
    renderApp(PAYMENTS)
    const day2 = await screen.findByRole('region', { name: /Day 2/ })
    const dups = within(day2).getAllByRole('button', { name: /오사카성 천수각/ })
    expect(dups).toHaveLength(2)
    for (const row of dups) {
      expect(row.textContent).toContain('중복 의심')
      expect(within(row).getByRole('img', { name: /부담 인원 나, 민지 외 2명/ })).toBeTruthy()
    }
    const bundle = within(day2).getByRole('button', { name: /주유패스/ })
    expect(bundle.textContent).toContain('₩121,330')
    expect(bundle.textContent).toContain('12:15 취소')
    expect(bundle.textContent).toContain('−₩121,330')
    expect(bundle.textContent).toContain('합계₩0')
  })

  it('배너를 누르면 미확정만 보이고, ✕로 푼다', async () => {
    const { router } = renderApp(PAYMENTS)
    fireEvent.click(await screen.findByRole('button', { name: '확인 필요 2건' }))
    await waitFor(() => expect(router.state.location.search).toBe('?filter=pending'))
    await waitFor(() => expect(screen.queryByRole('button', { name: /우메다/ })).toBeNull())
    expect(screen.getAllByRole('button', { name: /내 결제/ }).map((b) => b.querySelector('.text-body-m-strong')?.textContent)).toEqual([
      '551 호라이 난바본점',
      '패밀리마트 난바역점',
    ])
    fireEvent.click(screen.getByRole('button', { name: /미확정만 보기 해제/ }))
    expect(await screen.findByRole('button', { name: /우메다/ })).toBeTruthy()
    expect(router.state.location.search).toBe('')
  })

  it('다른 멤버(민지) 시점: 남의 미확정·개인 없음, 배너 없음, 변경됨 표시', async () => {
    db.meUserId = USER.minji
    db.expenses.find((e) => e.id === 'exp-mk')!.changed = true
    renderApp(PAYMENTS)
    const day2 = await screen.findByRole('region', { name: /Day 2/ })
    expect(screen.queryByText('551 호라이 난바본점')).toBeNull()
    expect(screen.queryByText('돈키호테 도톤보리점')).toBeNull()
    expect(screen.queryByRole('button', { name: /확인 필요/ })).toBeNull()
    const mk = within(day2).getByRole('button', { name: /MK택시/ })
    expect(mk.textContent).toContain('14:10 · 준용')
    expect(mk.textContent).toContain('변경됨')
    expect(within(mk).getByRole('img', { name: '부담 인원 나, 준용' })).toBeTruthy()
    expect(within(day2).getByRole('button', { name: /우메다/ }).textContent).toContain('16:40 · 내 결제')
  })

  it('맨 아래 "기간 외 결제 추가"로 이동한다', async () => {
    const { router } = renderApp(PAYMENTS)
    fireEvent.click(await screen.findByRole('button', { name: '기간 외 결제 추가' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trips/${TRIP.osaka}/payments/out-of-period`))
  })

  it('결제가 없으면 빈 상태, 기간 외 결제 추가는 남는다', async () => {
    db.expenses = db.expenses.filter((e) => e.tripId !== TRIP.osaka)
    renderApp(PAYMENTS)
    expect(await screen.findByRole('heading', { name: '아직 결제가 없어요' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '기간 외 결제 추가' })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: '보기' })).toBeTruthy()
  })

  it('종료된 여정: 배너·기간 외 진입 없이 목록만', async () => {
    renderApp(`/trips/${TRIP.jeju}/payments`)
    expect(await screen.findByRole('button', { name: /돈사돈 본점/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /확인 필요/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '기간 외 결제 추가' })).toBeNull()
    // KRW 결제는 원통화 줄이 없다
    expect(screen.getByRole('button', { name: /돈사돈/ }).textContent).not.toContain('36400')
    // 탈퇴한 멤버의 결제: 메타는 "탈퇴한 멤버", 나간 멤버 태그 없음
    const withdrawn = screen.getByRole('button', { name: /함덕 카페 델문도/ })
    expect(withdrawn.textContent).toContain('15:30 · 탈퇴한 멤버')
    expect(withdrawn.textContent).not.toContain('나간 멤버')
  })

  it('시작 전 여정은 결제내역 탭이 잠겨 기본 탭으로 간다', async () => {
    const { router } = renderApp(`/trips/${TRIP.busan}/payments`)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trips/${TRIP.busan}/info`))
  })

  it('목록 조회 실패 → 다시 시도', async () => {
    const { server } = await import('../../mocks/server')
    const { http } = await import('msw')
    const { mockError } = await import('../../mocks/utils')
    let fail = true
    server.use(http.get('/api/trips/:tripId/expenses', () => (fail ? mockError('NOT_FOUND', 404) : undefined)))
    renderApp(PAYMENTS)
    expect(await screen.findByRole('heading', { name: '불러오지 못했어요' })).toBeTruthy()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('region', { name: /Day 2/ })).toBeTruthy()
  })
})

describe('결제내역 · 당겨서 새로고침(FR-402)', () => {
  /** 동기화 요청·목록 요청 수를 센다(응답은 기본 목) */
  function countRequests(syncResponse?: () => Response) {
    const count = { sync: 0, list: 0 }
    server.use(
      http.post('/api/payment-methods/sync', () => {
        count.sync += 1
        return syncResponse?.()
      }),
      http.get('/api/trips/:tripId/expenses', () => {
        count.list += 1
      }),
    )
    return count
  }
  const pull = (target: HTMLElement) => {
    fireEvent.touchStart(target, { touches: [{ clientY: 0 }] })
    fireEvent.touchMove(target, { touches: [{ clientY: 70 }] })
    fireEvent.touchEnd(target)
  }

  it('진행 중이면 수동 동기화 → 끝날 때까지 스피너 → 목록을 다시 받는다', async () => {
    const count = countRequests()
    renderApp(PAYMENTS)
    const day2 = await screen.findByRole('region', { name: '11.13 (금) Day 2' })
    const listedBefore = count.list
    pull(day2)
    expect(await screen.findByText('새로고침 중')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('새로고침 중')).toBeNull())
    expect(count.sync).toBe(1)
    expect(count.list).toBeGreaterThan(listedBefore)
  })

  it('60초 제한(429)이면 토스트 없이 목록만 다시 받는다', async () => {
    const count = countRequests(() => mockError('SYNC_RATE_LIMITED', 429))
    renderApp(PAYMENTS)
    const day2 = await screen.findByRole('region', { name: '11.13 (금) Day 2' })
    const listedBefore = count.list
    pull(day2)
    await waitFor(() => expect(count.list).toBeGreaterThan(listedBefore))
    expect(count.sync).toBe(1)
    expect(screen.queryByText('잠시 후 다시 시도해 주세요')).toBeNull()
  })

  it('종료된 여정은 당겨도 동기화하지 않는다', async () => {
    const count = countRequests()
    renderApp(`/trips/${TRIP.jeju}/payments`)
    const rows = await screen.findAllByRole('region')
    pull(rows[0])
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(count.sync).toBe(0)
    expect(screen.queryByText('새로고침 중')).toBeNull()
  })
})

describe('결제내역 · 무한 스크롤', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('50건 뒤 다음 커서를 이어 받는다', async () => {
    const base = db.expenses.find((e) => e.id === 'exp-ichiran')!
    for (let i = 0; i < 55; i++) {
      db.expenses.push({ ...structuredClone(base), id: `exp-bulk-${i}`, merchantName: `편의점 ${i}`, occurredAt: `2026-11-12T0${i % 9}:${String(i).padStart(2, '0')}:00+09:00` })
    }
    const callbacks: IntersectionObserverCallback[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callbacks.push(cb)
        }
        observe() {}
        disconnect() {}
      },
    )
    renderApp(PAYMENTS)
    await screen.findByRole('region', { name: /Day 2/ })
    expect(screen.queryByText('편의점 0')).toBeNull()
    callbacks.at(-1)!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(await screen.findByText('편의점 0')).toBeTruthy()
  })
})

describe('결제내역 · 타임라인(WF-19)', () => {
  const timelineNames = () =>
    within(screen.getByRole('list', { name: /결제$/ }))
      .getAllByRole('button')
      .map((b) => b.querySelector('.text-body-m-strong')?.textContent)

  it('오늘(Day 2) 시간순, 끝에 지금 18:34, 앞으로 올 날은 잠김, 보기 기억', async () => {
    const { router } = renderApp(PAYMENTS)
    fireEvent.click(await screen.findByRole('radio', { name: '타임라인' }))
    await waitFor(() => expect(router.state.location.search).toBe('?view=timeline'))
    const list = await screen.findByRole('list', { name: 'Day 2 결제' })
    await waitFor(() => expect(within(list).getAllByRole('button').length).toBe(7))
    expect(timelineNames()).toEqual([
      '패밀리마트 난바역점',
      '오사카 주유패스 4매',
      '오사카성 천수각',
      '오사카성 천수각',
      'MK택시',
      '우메다 스카이빌딩 공중정원',
      '551 호라이 난바본점',
    ])
    expect(list.textContent).toContain('18:34')
    expect(list.textContent).toContain('지금')
    expect(within(list).getByRole('button', { name: /패밀리마트/ }).textContent).toContain('내 결제')
    expect(within(list).getByRole('button', { name: /우메다/ }).textContent).toContain('민지')

    const chips = screen.getByRole('group', { name: '날짜' })
    expect(within(chips).getByRole('button', { name: 'Day 2' }).getAttribute('aria-pressed')).toBe('true')
    expect((within(chips).getByRole('button', { name: 'Day 3' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(chips).getByRole('button', { name: 'Day 4' }) as HTMLButtonElement).disabled).toBe(true)
    expect(localStorage.getItem(`yj:payView:${USER.junyong}`)).toBe('timeline')

    fireEvent.click(within(chips).getByRole('button', { name: 'Day 1' }))
    await waitFor(() => expect(router.state.location.search).toBe('?view=timeline&day=1'))
    await screen.findByRole('list', { name: 'Day 1 결제' })
    await waitFor(() => expect(timelineNames()[0]).toBe('난카이 라피트 간사이공항역'))
    expect(screen.queryByText('지금')).toBeNull()
  })

  it('마지막 보기가 타임라인이면 결제내역을 열 때 타임라인', async () => {
    localStorage.setItem(`yj:payView:${USER.junyong}`, 'timeline')
    renderApp(PAYMENTS)
    expect(await screen.findByRole('list', { name: 'Day 2 결제' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: '타임라인' }) as HTMLInputElement).checked).toBe(true)
  })

  it('종료된 여정은 Day 1부터, 지금 노드 없음', async () => {
    renderApp(`/trips/${TRIP.jeju}/payments?view=timeline`)
    expect(await screen.findByRole('list', { name: 'Day 1 결제' })).toBeTruthy()
    await waitFor(() => expect(timelineNames()[0]).toBe('제주 렌터카 공항점'))
    expect(screen.queryByText('지금')).toBeNull()
    expect((screen.getByRole('button', { name: 'Day 3' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
