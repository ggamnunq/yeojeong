import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, TRIP } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/render'
import { fail } from './mocks'

const PAGE = `/trips/${TRIP.osaka}/payments/out-of-period`

// 앱 전체(가드·셸·lazy 페이지)를 그리는 테스트라 여러 파일이 함께 돌 때 첫 화면이 늦을 수 있다
configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(async () => {
  await Promise.all([import('./pages/OutOfPeriodPage'), import('./pages/PaymentsPage')])
})

// 기간 외 결제 후보는 토스 연결 기능이 켜져 있을 때만(FR-006)
beforeEach(() => {
  db.accountLink = true
})

const rows = () => within(screen.getByRole('list', { name: '기간 외 결제' })).getAllByRole('checkbox')

describe('기간 외 결제 추가(HF-43)', () => {
  it('여정 전 후보 날짜순 → 0건 추가 비활성 → 2건 추가 → 결제내역에 미확정 · 여정 전', async () => {
    const { router } = renderApp(PAGE)
    expect(await screen.findByRole('heading', { name: '기간 외 결제 추가' })).toBeTruthy()
    const list = await screen.findByRole('list', { name: '기간 외 결제' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '아고다 · 오리엔탈 익스프레스 난바10.20₩486,000',
      '제주항공 ICN–KIX 4매11.02₩1,032,400',
      'KKday · 유니버설 스튜디오 입장권11.10₩412,800',
      '인천공항 장기주차11.11₩36,000',
    ])
    expect((screen.getByRole('button', { name: '0건 추가' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(rows()[0])
    fireEvent.click(rows()[1])
    fireEvent.click(screen.getByRole('button', { name: '2건 추가' }))

    expect(await screen.findByText('2건 추가했어요')).toBeTruthy()
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trips/${TRIP.osaka}/payments`))
    expect(await screen.findByRole('button', { name: '확인 필요 4건' })).toBeTruthy()
    const before = await screen.findByRole('region', { name: '11.02 (월) 여정 전' })
    expect(within(before).getByRole('button', { name: /제주항공/ }).textContent).toContain('미확정')
    expect(screen.getByRole('region', { name: '10.20 (화) 여정 전' })).toBeTruthy()
    expect(db.expenses.filter((e) => e.origin === 'OUT_OF_PERIOD' && e.status === 'PENDING')).toHaveLength(2)
  })

  it('이미 추가한 건은 후보에 없다', async () => {
    renderApp(PAGE)
    await screen.findByRole('list', { name: '기간 외 결제' })
    fireEvent.click(rows()[3])
    fireEvent.click(screen.getByRole('button', { name: '1건 추가' }))
    await screen.findByText('1건 추가했어요')
    fireEvent.click(await screen.findByRole('button', { name: '기간 외 결제 추가' }))
    await screen.findByRole('list', { name: '기간 외 결제' })
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(screen.queryByText('인천공항 장기주차')).toBeNull()
  })

  it('여정 후 탭은 진행 중엔 빈 상태(C-12)', async () => {
    renderApp(PAGE)
    await screen.findByRole('list', { name: '기간 외 결제' })
    fireEvent.click(rows()[0])
    fireEvent.click(screen.getByRole('radio', { name: '여정 후' }))
    expect(await screen.findByRole('heading', { name: '불러올 결제가 없어요' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '0건 추가' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('후보는 캐시하지 않는다: 탭을 바꿀 때마다 새로 조회하고 그동안 스켈레톤 + 버튼 비활성, 식별자는 매번 새로 발급', async () => {
    const seen: { side: string | null; ids: string[] }[] = []
    server.events.on('response:mocked', async ({ request, response }) => {
      if (!request.url.includes('/out-of-period-candidates')) return
      const body = (await response.clone().json()) as { candidateId: string }[]
      seen.push({ side: new URL(request.url).searchParams.get('side'), ids: body.map((c) => c.candidateId) })
    })
    renderApp(PAGE)
    await screen.findByRole('list', { name: '기간 외 결제' })
    fireEvent.click(rows()[0])
    expect(screen.getByRole('button', { name: '1건 추가' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: '여정 후' }))
    await screen.findByRole('heading', { name: '불러올 결제가 없어요' })
    fireEvent.click(screen.getByRole('radio', { name: '여정 전' }))
    // 다시 조회하는 동안 행 스켈레톤, 고른 것은 비워진다
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '0건 추가' }) as HTMLButtonElement).disabled).toBe(true)
    await screen.findByRole('list', { name: '기간 외 결제' })
    await waitFor(() => expect(seen.map((s) => s.side)).toEqual(['BEFORE', 'AFTER', 'BEFORE']))
    expect(seen[2].ids).toHaveLength(4)
    expect(seen[2].ids.some((id) => seen[0].ids.includes(id))).toBe(false)
    server.events.removeAllListeners()
  })

  it('고른 지 오래돼 식별자가 만료되면(400) 선택을 비우고 다시 조회한다', async () => {
    let calls = 0
    server.use(
      // 세기만 하고 기본 목으로 넘긴다
      http.get('/api/trips/:tripId/out-of-period-candidates', () => {
        calls += 1
      }),
    )
    renderApp(PAGE)
    await screen.findByRole('list', { name: '기간 외 결제' })
    fireEvent.click(rows()[0])
    const now = Date.now()
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60_000)
    fireEvent.click(screen.getByRole('button', { name: '1건 추가' }))
    expect(await screen.findByText('추가할 수 없는 결제가 있어요')).toBeTruthy()
    spy.mockRestore()
    await waitFor(() => expect(calls).toBe(2))
    await screen.findByRole('list', { name: '기간 외 결제' })
    expect(screen.getByRole('button', { name: '0건 추가' })).toBeTruthy()
  })

  it('연결 만료면 다시 연결 Callout', async () => {
    server.use(http.get('/api/trips/:tripId/out-of-period-candidates', () => fail('CONNECTION_EXPIRED')))
    renderApp(PAGE)
    expect(await screen.findByRole('button', { name: /토스 연결 만료/ })).toBeTruthy()
  })

  it('추가할 수 없는 후보(400) → 후보를 다시 받고 선택을 비운다', async () => {
    server.use(http.post('/api/trips/:tripId/out-of-period-expenses', () => fail('OUT_OF_PERIOD_CANDIDATE_INVALID')))
    renderApp(PAGE)
    await screen.findByRole('list', { name: '기간 외 결제' })
    fireEvent.click(rows()[0])
    fireEvent.click(screen.getByRole('button', { name: '1건 추가' }))
    expect(await screen.findByText('추가할 수 없는 결제가 있어요')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: '0건 추가' })).toBeTruthy())
  })

  it('종료된 여정은 결제내역으로', async () => {
    const { router } = renderApp(`/trips/${TRIP.jeju}/payments/out-of-period`)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trips/${TRIP.jeju}/payments`))
  })
})
