import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, MEMBER, TRIP, USER } from '../../mocks/data'
import { renderApp } from '../../test/render'

const PAYMENTS = `/trips/${TRIP.osaka}/payments`

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
    fireEvent.click(screen.getByRole('button', { name: '미확정만 보기 해제' }))
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
    expect(await screen.findByRole('button', { name: /돈사돈 흑돼지 본점/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /확인 필요/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '기간 외 결제 추가' })).toBeNull()
    // KRW 결제는 원통화 줄이 없다
    expect(screen.getByRole('button', { name: /돈사돈/ }).textContent).not.toContain('98000')
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
    expect(db.memberships.some((m) => m.membershipId === MEMBER.junyong)).toBe(true)
  })
})
