import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { db, EDGE_EXPENSE_IDS, MEMBER, TRIP, USER } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/render'
import type { TripSummary } from '../settlement/types'

// 앱 전체(가드·셸·lazy 화면)를 여는 테스트라 CI·부하가 큰 환경에서 1초 기본 대기가 모자랄 수 있다(이 파일에만 적용)
configure({ asyncUtilTimeout: 5000 })

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname

/** 명세 샘플(11.13 18:34)과 같게: 엣지 시나리오 결제를 뺀다 */
const specSample = () => {
  db.expenses = db.expenses.filter((e) => !(EDGE_EXPENSE_IDS as readonly string[]).includes(e.id))
}
const setBudget = (budgetKrw: number) => {
  db.trips.find((t) => t.tripId === TRIP.osaka)!.budgetKrw = budgetKrw
}
const region = (name: string) => screen.getByRole('region', { name })

async function openStats() {
  const app = renderApp('/trips/trip-osaka/stats')
  await screen.findByRole('region', { name: /내가 (낼|받을) 금액/ })
  return app
}

describe('현황(HF-22) 수치', () => {
  it('명세 샘플: 내가 낼 금액 ₩32,080 · 공동 ₩352,790 / ₩1,200,000 · 내 지출 ₩174,190 · 멤버별 부담', async () => {
    specSample()
    await openStats()
    expect(region('내가 낼 금액').textContent).toContain('₩32,080')

    const shared = region('공동 지출')
    expect(shared.textContent).toContain('₩352,790')
    expect(shared.textContent).toContain('/ ₩1,200,000')
    const bar = within(shared).getByRole('meter')
    expect(bar.getAttribute('aria-valuenow')).toBe('29')
    expect(bar.getAttribute('data-state')).toBe('normal')
    expect(within(shared).queryByText(/초과/)).toBeNull()

    const spending = region('내 지출')
    expect(spending.textContent).toContain('₩174,190')
    expect(within(spending).getByText('공동 54%')).toBeTruthy()
    expect(within(spending).getByText('개인 46%')).toBeTruthy()

    const rows = within(region('멤버별 부담')).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['준용나₩94,770', '민지₩94,770', '태현₩81,625', '수빈₩81,625'])
  })

  it('미확정 결제는 어디에도 넣지 않는다(FR-601)', async () => {
    specSample()
    // 결제자가 나인 미확정 2건(패밀리마트·551)이 있어도 같은 값
    expect(db.expenses.filter((e) => e.tripId === TRIP.osaka && e.status === 'PENDING')).toHaveLength(2)
    await openStats()
    expect(region('공동 지출').textContent).toContain('₩352,790')
    expect(region('내 지출').textContent).toContain('₩174,190')
  })

  it('받을 돈이 있으면 「내가 받을 금액」(제안)', async () => {
    specSample()
    db.expenses.find((e) => e.id === 'exp-kushikatsu')!.payerMembershipId = MEMBER.junyong
    await openStats()
    // 62,690 + 117,660 − 94,770
    expect(region('내가 받을 금액').textContent).toContain('₩85,580')
  })

  it('예산 경계: 80% 미만 정상 · 80% 주의 · 100% 주의 · 100% 넘으면 초과 + 「초과 ₩N」', async () => {
    specSample()
    const cases: [number, string, string | null][] = [
      [440_988, 'normal', null], // 79.99…%
      [440_987, 'caution', null], // 80.00…%
      [352_790, 'caution', null], // 100%
      [352_789, 'over', '초과 ₩1'],
      [300_000, 'over', '초과 ₩52,790'],
    ]
    for (const [budget, state, over] of cases) {
      setBudget(budget)
      const app = await openStats()
      const shared = region('공동 지출')
      expect(within(shared).getByRole('meter').getAttribute('data-state')).toBe(state)
      if (over) expect(within(shared).getByText(over)).toBeTruthy()
      else expect(within(shared).queryByText(/초과/)).toBeNull()
      app.unmount()
    }
  })

  it('내 지출 0이면 막대 비움 · 범례 없음(FR-603)', async () => {
    server.use(
      http.get('/api/trips/:tripId/summary', () =>
        HttpResponse.json<TripSummary>({
          asOf: '2026-11-13T18:34:00+09:00',
          me: { membershipId: MEMBER.junyong, netKrw: 0, toPayKrw: 0, toReceiveKrw: 0 },
          sharedTotalKrw: 0,
          budgetKrw: 1_200_000,
          budgetRatio: 0,
          budgetState: 'NORMAL',
          overBudgetKrw: 0,
          mySpending: { totalKrw: 0, sharedBurdenKrw: 0, personalKrw: 0, sharedPct: null, personalPct: null },
          burdens: [],
        }),
      ),
    )
    await openStats()
    expect(region('내가 낼 금액').textContent).toContain('₩0')
    const spending = region('내 지출')
    expect(spending.textContent).toContain('₩0')
    expect(within(spending).queryByText(/공동 \d+%/)).toBeNull()
    expect(spending.querySelector('[data-part]')).toBeNull()
  })

  it('나간 멤버도 멤버별 부담에 남는다(FR-604)', async () => {
    specSample()
    db.memberships.find((m) => m.membershipId === MEMBER.subin)!.leftAt = '2026-11-13T12:00:00+09:00'
    await openStats()
    const subin = within(region('멤버별 부담')).getAllByRole('listitem')[3]
    expect(subin.textContent).toContain('수빈')
    expect(subin.textContent).toContain('나간 멤버')
    expect(subin.textContent).toContain('₩81,625')
  })

  it('탈퇴한 멤버는 "탈퇴한 멤버", 태그 없음', async () => {
    specSample()
    // 서버와 같다: 탈퇴하면 멤버십 userId NULL + leaveReason ACCOUNT_DELETED
    Object.assign(db.memberships.find((m) => m.membershipId === MEMBER.subin)!, {
      leftAt: '2026-11-13T12:00:00+09:00',
      userId: null,
      leaveReason: 'ACCOUNT_DELETED',
    })
    db.users = db.users.filter((u) => u.id !== USER.subin)
    await openStats()
    const gone = within(region('멤버별 부담')).getAllByRole('listitem')[3]
    expect(gone.textContent).toBe('탈퇴한 멤버₩81,625')
  })

  it('불러오지 못하면 다시 시도', async () => {
    let fail = true
    server.use(
      http.get('/api/trips/:tripId/summary', () => (fail ? HttpResponse.json({}, { status: 500 }) : undefined)),
    )
    renderApp('/trips/trip-osaka/stats')
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }))
    fail = false
    expect(await screen.findByRole('region', { name: '내가 낼 금액' })).toBeTruthy()
  })
})

describe('탭 전환', () => {
  it('진행 중: 결제내역 → 현황 탭', async () => {
    const { router } = renderApp('/trips/trip-osaka/payments')
    fireEvent.click(await screen.findByRole('button', { name: '현황' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/stats'))
    expect(await screen.findByRole('region', { name: '내가 낼 금액' })).toBeTruthy()
  })

  it('종료 후: 현황 주소는 정산으로, 2번 탭이 정산', async () => {
    const { router } = renderApp('/trips/trip-jeju/stats')
    await waitFor(() => expect(path(router)).toBe('/trips/trip-jeju/settlement'))
    expect(await screen.findByRole('heading', { name: '총 공동 지출' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '정산' }).getAttribute('aria-current')).toBe('page')
  })

  it('시작 전: 현황 탭은 잠겨 여정 정보로', async () => {
    const { router } = renderApp('/trips/trip-busan/stats')
    await waitFor(() => expect(path(router)).toBe('/trips/trip-busan/info'))
  })
})
