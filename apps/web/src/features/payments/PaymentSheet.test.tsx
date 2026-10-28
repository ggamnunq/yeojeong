import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it } from 'vitest'
import { db, TRIP, USER } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/render'
import { fail } from './mocks'

const PAYMENTS = `/trips/${TRIP.osaka}/payments`

beforeAll(async () => {
  // lazy 페이지를 미리 받아 첫 테스트가 느려지지 않게
  await Promise.all([import('./pages/PaymentsPage'), import('./pages/PaymentSheet')])
})

/** 목록에서 행을 눌러 시트를 연다 */
async function openFromList(name: RegExp, route = PAYMENTS) {
  const result = renderApp(route)
  fireEvent.click(await screen.findByRole('button', { name }))
  const sheet = await screen.findByRole('dialog')
  await waitFor(() => expect(within(sheet).queryByRole('status', { name: '불러오는 중' })).toBeNull())
  return { ...result, sheet }
}

const toggles = (sheet: HTMLElement) =>
  within(sheet)
    .getAllByRole('button', { pressed: true })
    .map((b) => b.textContent)

const segment = (sheet: HTMLElement, name: '개인' | '공동') => within(sheet).getByRole('radio', { name })
const cta = (sheet: HTMLElement, name: string) => within(sheet).getByRole('button', { name })

describe('결제 상세 · 미확정(HF-20·21)', () => {
  it('미확정은 기본 [공동]·전원(Q-01), 1인 즉시 계산, 공동으로 확정 → 목록에 스택', async () => {
    const { sheet, router } = await openFromList(/551 호라이/)
    expect(within(sheet).getByRole('heading', { name: '551 호라이 난바본점' })).toBeTruthy()
    expect(sheet.textContent).toContain('₩25,740')
    expect(sheet.textContent).toContain('¥2,800 · 11.13 18:20 · 신한카드 1102')
    expect(sheet.textContent).toContain('미확정')
    expect((segment(sheet, '공동') as HTMLInputElement).checked).toBe(true)
    expect(toggles(sheet)).toEqual(['나', '민지', '태현', '수빈'])
    expect(sheet.textContent).toContain('부담 인원 4명')
    expect(sheet.textContent).toContain('1인 ₩6,435')

    fireEvent.click(within(sheet).getByRole('button', { name: '수빈' }))
    expect(sheet.textContent).toContain('부담 인원 3명')
    expect(sheet.textContent).toContain('1인 ₩8,580')

    fireEvent.click(cta(sheet, '공동으로 확정'))
    expect(await screen.findByText('공동으로 확정했어요')).toBeTruthy()
    await waitFor(() => expect(router.state.location.pathname).toBe(PAYMENTS))
    const row = await screen.findByRole('button', { name: /551 호라이/ })
    await waitFor(() => expect(within(row).getByRole('img', { name: '부담 인원 나, 민지 외 1명' })).toBeTruthy())
    expect(row.textContent).not.toContain('미확정')
    expect(db.expenses.find((e) => e.id === 'exp-551')!.participantMembershipIds).toHaveLength(3)
  })

  it('[개인] → 개인으로 확정 → 개인 태그, 배너 n − 1', async () => {
    const { sheet } = await openFromList(/패밀리마트/)
    expect(sheet.textContent).toContain('¥1,280 · 11.13 08:50 · 토스뱅크 체크카드 1934')
    fireEvent.click(segment(sheet, '개인'))
    // 개인은 부담 인원을 숨긴다(EX-01b)
    expect(within(sheet).queryByRole('group', { name: /부담 인원/ })).toBeNull()
    fireEvent.click(cta(sheet, '개인으로 확정'))
    expect(await screen.findByText('개인으로 확정했어요')).toBeTruthy()
    expect(await screen.findByRole('button', { name: '확인 필요 1건' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /패밀리마트/ }).textContent).toContain('개인')
  })

  it('결제자 외 최소 1명(Q-08): 나만 남으면 비활성, 나를 빼고 고르는 건 된다', async () => {
    const { sheet } = await openFromList(/551 호라이/)
    for (const name of ['민지', '태현', '수빈']) fireEvent.click(within(sheet).getByRole('button', { name }))
    expect((cta(sheet, '공동으로 확정') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(sheet).getByRole('button', { name: '나' }))
    expect((cta(sheet, '공동으로 확정') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(sheet).getByRole('button', { name: '민지' }))
    expect((cta(sheet, '공동으로 확정') as HTMLButtonElement).disabled).toBe(false)
  })

  it('주소로 바로 열 수 있고, ✕로 닫으면 목록', async () => {
    const { router } = renderApp(`${PAYMENTS}/exp-famima`)
    const sheet = await screen.findByRole('dialog', { name: '패밀리마트 난바역점' })
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(PAYMENTS))
  })

  it('남의 미확정을 주소로 열면 404 → 시트를 닫고 목록', async () => {
    db.meUserId = USER.minji
    const { router } = renderApp(`${PAYMENTS}/exp-famima`)
    await waitFor(() => expect(router.state.location.pathname).toBe(PAYMENTS))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByRole('region', { name: /Day 2/ })).toBeTruthy()
  })
})

describe('결제 상세 · 409 처리(명세 v0.5)', () => {
  it('VERSION_CONFLICT → details.current로 다시 그리고 토스트', async () => {
    const { sheet } = await openFromList(/551 호라이/)
    // 다른 기기에서 개인으로 바꿨다
    const e = db.expenses.find((x) => x.id === 'exp-551')!
    e.status = 'PERSONAL'
    e.version = 9
    fireEvent.click(cta(sheet, '공동으로 확정'))
    expect(await screen.findByText('최신 내용으로 바뀌었어요')).toBeTruthy()
    await waitFor(() => expect((segment(sheet, '개인') as HTMLInputElement).checked).toBe(true))
    expect(sheet.textContent).not.toContain('미확정')
  })

  it('SHARED_IN_OTHER_TRIP → 토스트, 시트 유지, [개인]만', async () => {
    server.use(http.put('/api/trips/:tripId/expenses/:expenseId/classification', () => fail('SHARED_IN_OTHER_TRIP')))
    const { sheet } = await openFromList(/551 호라이/)
    fireEvent.click(cta(sheet, '공동으로 확정'))
    expect(await screen.findByText('다른 여정에서 이미 공동으로 확정됐어요')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBe(sheet)
    expect((segment(sheet, '개인') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(segment(sheet, '공동'))
    expect((segment(sheet, '개인') as HTMLInputElement).checked).toBe(true)
    expect(cta(sheet, '개인으로 확정')).toBeTruthy()
  })

  it('종료돼 잠기면(EXPENSE_LOCKED) 시트가 변경 불가로 다시 그려진다', async () => {
    const { sheet } = await openFromList(/551 호라이/)
    db.trips.find((t) => t.tripId === TRIP.osaka)!.status = 'ENDED'
    fireEvent.click(cta(sheet, '공동으로 확정'))
    expect(await screen.findByText('변경할 수 없는 결제예요')).toBeTruthy()
    const locked = await within(screen.getByRole('dialog')).findByRole('button', { name: '변경 불가' })
    expect((locked as HTMLButtonElement).disabled).toBe(true)
  })

  it('저장 요청은 다시 보내지 않는다(실패해도 1번)', async () => {
    let calls = 0
    server.use(
      http.put('/api/trips/:tripId/expenses/:expenseId/classification', () => {
        calls += 1
        return HttpResponse.json({ code: 'INTERNAL_ERROR', message: '일시적인 문제가 있으니 잠시 후 다시 시도해 주세요', requestId: 'r-1' }, { status: 500 })
      }),
    )
    const { sheet } = await openFromList(/551 호라이/)
    fireEvent.click(cta(sheet, '공동으로 확정'))
    expect(await screen.findByText(/일시적인 문제가 있으니/)).toBeTruthy()
    expect(calls).toBe(1)
  })
})
