import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { db, TRIP } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { JEJU, seedJejuSettlement } from './mockData'

// 앱 전체(가드·셸·lazy 화면)를 여는 테스트라 CI·부하가 큰 환경에서 1초 기본 대기가 모자랄 수 있다(이 파일에만 적용)
configure({ asyncUtilTimeout: 5000 })

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname

async function openSettlement() {
  const app = renderApp('/trips/trip-jeju/settlement')
  await screen.findByRole('heading', { name: '총 공동 지출' })
  return app
}
const rows = () => within(screen.getByRole('list', { name: '멤버별 정산' })).getAllByRole('button')

describe('정산 요약(HF-25)', () => {
  it('총 공동 지출 · N빵 1인 · 도착 경로', async () => {
    await openSettlement()
    const hero = screen.getByRole('region', { name: '총 공동 지출' })
    expect(hero.textContent).toContain('₩826,910')
    expect(hero.textContent).toContain('N빵 1인₩206,728')
    expect(within(hero).getByRole('img', { name: '도착' })).toBeTruthy()
    expect(hero.textContent).toContain('08.21 (금)')
    expect(hero.textContent).toContain('08.23 (일)')
  })

  it('멤버별 정산: 나 먼저 → 가입 순, 부호 + 받을 돈·보낼 돈', async () => {
    await openSettlement()
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual([
      '준용 (나), 결제 ₩316,390, 부담 ₩213,300, 받을 돈 ₩103,090',
      '태현, 결제 ₩191,200, 부담 ₩200,155, 보낼 돈 ₩8,955',
      '민지, 결제 ₩186,960, 부담 ₩213,300, 보낼 돈 ₩26,340',
      '수빈 (나간 멤버), 결제 ₩132,360, 부담 ₩200,155, 보낼 돈 ₩67,795',
    ])
    const [me, , minji] = rows()
    expect(me.textContent).toContain('+₩103,090받을 돈')
    expect(me.textContent).toContain('나')
    expect(minji.textContent).toContain('−₩26,340보낼 돈')
  })

  it('송금 권장안은 화면에 없다(C-14)', async () => {
    await openSettlement()
    expect(screen.queryByText(/송금|→/)).toBeNull()
  })

  it('행을 누르면 그 멤버의 결제 내역', async () => {
    const { router } = await openSettlement()
    fireEvent.click(rows()[2])
    await waitFor(() => expect(path(router)).toBe(`/trips/trip-jeju/settlement/${JEJU.minji}`))
  })

  it('진행 중으로 판정되면(409) 여정을 다시 받아 그 단계의 탭으로', async () => {
    server.use(
      http.get('/api/trips/:tripId/settlement', () => {
        db.trips.find((t) => t.tripId === TRIP.jeju)!.status = 'ONGOING'
        return mockError('TRIP_PHASE_INVALID')
      }),
    )
    const { router } = renderApp('/trips/trip-jeju/settlement')
    await waitFor(() => expect(path(router)).toBe('/trips/trip-jeju/payments'))
  })
})

describe('나간 멤버(HF-44)', () => {
  it('결제·부담이 있으면 흐린 프사 + 「나간 멤버」로 남고 누를 수 있다', async () => {
    const { router } = await openSettlement()
    const subin = rows()[3]
    expect(within(subin).getByText('나간 멤버')).toBeTruthy()
    expect(subin.textContent).toContain('−₩67,795보낼 돈')
    fireEvent.click(subin)
    await waitFor(() => expect(path(router)).toBe(`/trips/trip-jeju/settlement/${JEJU.subin}`))
  })

  it('탈퇴한 멤버: 기본 아바타 + "탈퇴한 멤버", 태그 없음, 탭 불가', async () => {
    seedJejuSettlement({ withdrawn: true })
    const { router } = await openSettlement()
    expect(rows()).toHaveLength(5)
    const gone = rows()[4] as HTMLButtonElement
    expect(gone.getAttribute('aria-label')).toBe('탈퇴한 멤버, 결제 ₩24,000, 부담 ₩4,800, 받을 돈 ₩19,200')
    expect(gone.textContent).not.toContain('나간 멤버')
    expect(gone.querySelector('[data-source]')?.getAttribute('data-source')).toBe('default')
    expect(gone.querySelector('.grayscale')).toBeNull()
    expect(gone.disabled).toBe(true)
    fireEvent.click(gone)
    expect(path(router)).toBe('/trips/trip-jeju/settlement')
    // 나간 멤버(수빈)는 그대로 태그 + 탭 가능
    expect(within(rows()[3]).getByText('나간 멤버')).toBeTruthy()
    expect((rows()[3] as HTMLButtonElement).disabled).toBe(false)
  })

  it('결제·부담이 없는 나간 멤버는 목록에서 빠진다(FR-705)', async () => {
    seedJejuSettlement()
    db.users.push({ id: 'user-haeun', nickname: '하은', profileImageUrl: null })
    db.memberships.push({
      membershipId: 'mem-jeju-haeun',
      tripId: TRIP.jeju,
      userId: 'user-haeun',
      role: 'MEMBER',
      joinOrder: 5,
      leftAt: '2026-08-21T10:00:00+09:00',
    })
    await openSettlement()
    expect(rows()).toHaveLength(4)
    expect(screen.queryByText('하은')).toBeNull()
  })
})
