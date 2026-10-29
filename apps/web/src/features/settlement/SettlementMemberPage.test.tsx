import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, MEMBER, TRIP } from '../../mocks/data'
import { renderApp } from '../../test/render'
import { JEJU, JEJU_WITHDRAWN, seedJejuSettlement } from '../../mocks/seeds'

// 앱 전체(가드·셸·lazy 화면)를 여는 테스트라 CI·부하가 큰 환경에서 1초 기본 대기가 모자랄 수 있다(이 파일에만 적용)
configure({ asyncUtilTimeout: 5000 })

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname

async function openMember(membershipId: string, tripId: string = TRIP.jeju) {
  const app = renderApp(`/trips/${tripId}/settlement/${membershipId}`)
  await screen.findByRole('heading', { name: /공동 결제 \d+건/ })
  return app
}
const title = () => screen.getByRole('heading', { level: 1 })
const list = (name: RegExp) => within(screen.getByRole('list', { name }))

describe('멤버별 결제 내역(HF-26) · 가시성', () => {
  it('남(민지): 공동 결제 목록 + 개인 결제는 건수만 「비공개」(C-02)', async () => {
    await openMember(JEJU.minji)
    expect(title().textContent).toBe('민지')
    const hero = screen.getByRole('region', { name: '보낼 돈' })
    expect(hero.textContent).toContain('−₩26,340')
    expect(hero.textContent).toContain('결제₩186,960')
    expect(hero.textContent).toContain('부담₩213,300')

    const shared = list(/공동 결제 3건/).getAllByRole('button')
    // 최신순(occurredAt 내림차순)
    expect(shared.map((r) => r.textContent?.split('08.')[0])).toEqual(['동문재래시장', '우도 도항선', '제주 렌터카 공항점'])
    expect(shared[2].textContent).toContain('08.21 11:20 · 민지')
    expect(shared[2].textContent).toContain('₩54,780')

    expect(screen.getByRole('heading', { name: '개인 결제 3건' })).toBeTruthy()
    expect(screen.getByText('비공개')).toBeTruthy()
    for (const merchant of ['올리브영 제주탑동점', '카페 델문도', '아쿠아플라넷 기념품']) {
      expect(screen.queryByText(merchant)).toBeNull()
    }
  })

  it('본인: 받을 돈 영웅 + 개인 결제 목록까지', async () => {
    await openMember(JEJU.junyong)
    expect(title().textContent).toBe('준용나')
    expect(screen.getByRole('region', { name: '받을 돈' }).textContent).toContain('+₩103,090')
    const shared = list(/공동 결제 4건/).getAllByRole('button')
    expect(shared.at(-1)?.textContent).toContain('08.21 13:10 · 내 결제')
    const personal = list(/개인 결제 2건/).getAllByRole('button')
    expect(personal.map((r) => r.textContent?.includes('개인'))).toEqual([true, true])
    expect(personal[0].textContent).toContain('CU 제주공항점')
    expect(personal[1].textContent).toContain('기념품 숍 바람')
    expect(screen.queryByText('비공개')).toBeNull()
  })

  it('개인 결제 0건이면 비공개 라벨 없음', async () => {
    await openMember(JEJU.taehyeon)
    expect(screen.getByRole('heading', { name: '개인 결제 0건' })).toBeTruthy()
    expect(screen.queryByText('비공개')).toBeNull()
  })

  it('공동 결제 0건이면 라벨만, 목록 없음', async () => {
    seedJejuSettlement()
    db.expenses = db.expenses.filter((e) => !(e.payerMembershipId === JEJU.taehyeon && e.status === 'SHARED'))
    await openMember(JEJU.taehyeon)
    expect(screen.getByRole('heading', { name: '공동 결제 0건' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: /공동 결제/ })).toBeNull()
  })
})

describe('나간 멤버(HF-44)', () => {
  it('제목 옆 「나간 멤버」, 나머지는 같다', async () => {
    await openMember(JEJU.subin)
    expect(title().textContent).toBe('수빈나간 멤버')
    expect(screen.getByRole('region', { name: '보낼 돈' }).textContent).toContain('−₩67,795')
    expect(list(/공동 결제 2건/).getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: '개인 결제 1건' })).toBeTruthy()
    expect(screen.getByText('비공개')).toBeTruthy()
  })
})

describe('이동', () => {
  it('공동 결제 행 → 이 화면 위 잠금 상세 시트(정산 하위 주소, 하단 탭 이동 없음) → 닫으면 HF-26 그대로', async () => {
    const { router } = await openMember(JEJU.minji)
    fireEvent.click(list(/공동 결제/).getAllByRole('button').at(-1)!)
    await waitFor(() => expect(path(router)).toBe(`/trips/trip-jeju/settlement/${JEJU.minji}/payments/jeju-rentcar`))
    const sheet = await screen.findByRole('dialog', { name: '제주 렌터카 공항점' })
    // HF-26 화면이 시트 아래 그대로 있다
    expect(title().textContent).toBe('민지')
    // 종료 후 = 잠금 상세(분담 편집 없음)
    expect(within(sheet).queryByRole('radiogroup')).toBeNull()

    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(path(router)).toBe(`/trips/trip-jeju/settlement/${JEJU.minji}`))
    expect(screen.queryByRole('dialog', { name: '제주 렌터카 공항점' })).toBeNull()
  })

  it('주소로 바로 연 시트도 닫으면 HF-26으로(결제내역 탭으로 가지 않는다)', async () => {
    const { router } = renderApp(`/trips/trip-jeju/settlement/${JEJU.minji}/payments/jeju-rentcar`)
    const sheet = await screen.findByRole('dialog', { name: '제주 렌터카 공항점' })
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(path(router)).toBe(`/trips/trip-jeju/settlement/${JEJU.minji}`))
  })

  it('본인 개인 결제 행도 같은 시트로 연다', async () => {
    const { router } = await openMember(JEJU.junyong)
    fireEvent.click(list(/개인 결제 2건/).getAllByRole('button')[0])
    await waitFor(() => expect(path(router)).toBe(`/trips/trip-jeju/settlement/${JEJU.junyong}/payments/jeju-cu`))
    expect(await screen.findByRole('dialog', { name: 'CU 제주공항점' })).toBeTruthy()
  })

  it('남의 「비공개」 줄은 누를 수 없다', async () => {
    await openMember(JEJU.minji)
    const privateRow = screen.getByRole('heading', { name: '개인 결제 3건' }).parentElement!
    expect(within(privateRow).queryByRole('button')).toBeNull()
  })

  it('탈퇴한 멤버 상세를 주소로 열면 서버 404 → 정산 요약으로', async () => {
    seedJejuSettlement({ withdrawn: true })
    const { router } = renderApp(`/trips/trip-jeju/settlement/${JEJU_WITHDRAWN}`)
    await waitFor(() => expect(path(router)).toBe('/trips/trip-jeju/settlement'))
  })

  it('‹ → 정산 요약(바로 연 주소여도)', async () => {
    const { router } = await openMember(JEJU.minji)
    fireEvent.click(screen.getByRole('button', { name: '뒤로 가기' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-jeju/settlement'))
  })

  it('정산 대상이 아닌 멤버십(404)은 정산 요약으로', async () => {
    const { router } = renderApp('/trips/trip-jeju/settlement/mem-unknown')
    await waitFor(() => expect(path(router)).toBe('/trips/trip-jeju/settlement'))
  })

  it('종료 전 여정이면 현황으로', async () => {
    const { router } = renderApp(`/trips/trip-osaka/settlement/${MEMBER.minji}`)
    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/stats'))
  })

  it('외화 여정은 원통화를 오른쪽 아래에', async () => {
    db.trips.find((t) => t.tripId === TRIP.osaka)!.status = 'ENDED'
    await openMember(MEMBER.minji, TRIP.osaka)
    const first = list(/공동 결제/).getAllByRole('button')[0]
    expect(first.textContent).toContain('우메다 스카이빌딩 공중정원')
    expect(first.textContent).toContain('₩73,540¥8,000')
  })
})
