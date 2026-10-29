import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { db, MEMBER, TRIP } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/render'
import { createTripExpense } from './api'

// 수동 결제 화면 흐름(WF-46~50 · HF-18 진입점 · HF-20b "수정"). 목 시점 = 11.13 18:34, 오사카(JPY, 100엔 = 919.20원) 진행 중.

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const PAYMENTS = `/trips/${TRIP.osaka}/payments`

beforeAll(async () => {
  await Promise.all([import('../payments/pages/PaymentsPage'), import('./TripExpenseSheet'), import('./WalletEntrySheet'), import('./WalletListPage')])
})

const sheet = (name: string) => screen.findByRole('dialog', { name })
const typeAmount = (scope: HTMLElement, value: string) => fireEvent.change(within(scope).getByRole('textbox', { name: '금액' }), { target: { value } })
const button = (scope: HTMLElement, name: string | RegExp) => within(scope).getByRole('button', { name })
const manualExpenses = () => db.expenses.filter((e) => e.origin === 'MANUAL')

describe('여정 결제 추가(WF-46 · 47)', () => {
  it('리스트 맨 위 "결제 추가" → 금액만 넣고 추가하면 전원 공동으로 바로 확정된다', async () => {
    renderApp(PAYMENTS)
    fireEvent.click(await screen.findByRole('button', { name: '결제 추가' }))
    const form = await sheet('결제 추가')
    const add = button(form, '추가')
    expect(add.hasAttribute('disabled') || add.getAttribute('aria-disabled') === 'true').toBe(true)
    typeAmount(form, '1200')
    expect(await within(form).findByText('≈ ₩11,030')).toBeTruthy()
    expect(within(form).getByRole('switch', { name: '내 지갑에도 기록' })).toBeTruthy()
    fireEvent.click(button(form, '추가'))
    expect(await screen.findByText('추가했어요')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [created] = manualExpenses()
    expect(created).toMatchObject({ status: 'SHARED', originalAmount: '1200', merchantName: '결제', payerMembershipId: MEMBER.junyong })
    expect(created.participantMembershipIds).toHaveLength(4)
    expect(created.clientRequestId).toBeTruthy()
  })

  it('나누기에서 나만 남기면 🔒 개인 — 요약 "1인 ₩3,676 · 결제자 +2원"', async () => {
    renderApp(`${PAYMENTS}/new`)
    const form = await sheet('결제 추가')
    typeAmount(form, '1200')
    fireEvent.click(button(form, /^나누기/))
    const split = await sheet('나누기')
    fireEvent.click(button(split, /수빈/))
    expect(within(split).getByText('1인 ₩3,676')).toBeTruthy()
    expect(within(split).getByText('결제자 +2원')).toBeTruthy()
    fireEvent.click(button(split, /민지/))
    fireEvent.click(button(split, /태현/))
    expect(within(split).getByText('개인')).toBeTruthy()
    fireEvent.click(button(split, '완료'))
    const back = await sheet('결제 추가')
    expect(within(back).getByText('개인')).toBeTruthy()
    fireEvent.click(button(back, '추가'))
    await waitFor(() => expect(manualExpenses()[0]?.status).toBe('PERSONAL'))
  })

  it('결제자를 민지로 바꾸면 지갑 토글이 사라지고, 나누기를 민지 혼자로 두면 "완료"가 막힌다', async () => {
    renderApp(`${PAYMENTS}/new`)
    const form = await sheet('결제 추가')
    fireEvent.click(button(form, /^결제자/))
    const payer = await sheet('결제자')
    fireEvent.click(within(payer).getByRole('radio', { name: /민지/ }))
    const back = await sheet('결제 추가')
    expect(within(back).queryByRole('switch', { name: '내 지갑에도 기록' })).toBeNull()
    expect(button(back, /^결제자/).textContent).toContain('민지')
    fireEvent.click(button(back, /^나누기/))
    const split = await sheet('나누기')
    for (const name of [/^나/, /태현/, /수빈/]) fireEvent.click(button(split, name))
    const done = button(split, '완료')
    expect(done.hasAttribute('disabled') || done.getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('통화 칩: JPY ↔ KRW만, JPY는 소수점이 입력되지 않는다 · 원화 1억 초과면 막고 한 줄 안내', async () => {
    renderApp(`${PAYMENTS}/new`)
    const form = await sheet('결제 추가')
    typeAmount(form, '12.5')
    // 소수점부터는 입력되지 않는다(DS InputAmount 규칙)
    expect((within(form).getByRole('textbox', { name: '금액' }) as HTMLInputElement).value).toBe('12')
    fireEvent.click(button(form, /통화 바꾸기, 지금 JPY/))
    expect(button(form, /통화 바꾸기, 지금 KRW/)).toBeTruthy()
    fireEvent.click(button(form, /통화 바꾸기, 지금 KRW/))
    typeAmount(form, '20000000')
    expect(await within(form).findByText('1억 원 이하로 입력해 주세요')).toBeTruthy()
    const add = button(form, '추가')
    expect(add.hasAttribute('disabled') || add.getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('종료된 여정에는 "결제 추가" 행이 없다', async () => {
    renderApp(`/trips/${TRIP.jeju}/payments`)
    await screen.findAllByRole('region')
    expect(screen.queryByRole('button', { name: '결제 추가' })).toBeNull()
  })
})

describe('수동 결제 상세 · 수정 · 삭제(HF-20b · WF-50 · 50b)', () => {
  // 목 API로 공동 수동 결제 하나(작성자 = 나)
  const seedManual = async () => {
    const detail = await createTripExpense(TRIP.osaka, { amount: '3000', memo: '타코야키' })
    return detail
  }

  it('작성자 상세 헤더 "수정" → 내용을 고쳐 저장', async () => {
    const created = await seedManual()
    renderApp(`${PAYMENTS}/${created.id}`)
    const detail = await sheet('타코야키')
    fireEvent.click(await within(detail).findByRole('button', { name: '수정' }))
    const edit = await sheet('결제 수정')
    const save = await within(edit).findByRole('button', { name: '저장' })
    expect(save.hasAttribute('disabled') || save.getAttribute('aria-disabled') === 'true').toBe(true)
    fireEvent.change(within(edit).getByRole('textbox', { name: '내용' }), { target: { value: '타코야키 8개' } })
    fireEvent.click(button(edit, '저장'))
    expect(await screen.findByText('저장했어요')).toBeTruthy()
    expect(manualExpenses()[0].merchantName).toBe('타코야키 8개')
  })

  it('공동 결제 삭제 → "공동 결제를 삭제할까요?" → 삭제', async () => {
    const created = await seedManual()
    renderApp(`${PAYMENTS}/${created.id}/edit`)
    // 상세를 받기 전 스켈레톤 시트가 폼 시트로 바뀐다 — 버튼이 보인 뒤 시트를 다시 찾는다
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }))
    const dialog = await screen.findByRole('alertdialog', { name: '공동 결제를 삭제할까요?' })
    expect(dialog.textContent).toContain('다른 멤버의 내역과 정산에서 빠져요')
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText('삭제했어요')).toBeTruthy()
    expect(manualExpenses()).toHaveLength(0)
  })

  it('가져온 결제 상세에는 "수정"이 없다', async () => {
    renderApp(`${PAYMENTS}/exp-mk`)
    const detail = await sheet('MK택시')
    await within(detail).findByText(/¥2,860/)
    expect(within(detail).queryByRole('button', { name: '수정' })).toBeNull()
  })
})

describe('내 지갑(WF-49 · 48 · 50)', () => {
  it('"이번 달" 합계 · 날짜별 행(메타 "HH:mm · 여정", 원통화)', async () => {
    renderApp('/wallet')
    expect(await screen.findByRole('heading', { name: '내 지갑' })).toBeTruthy()
    const day = await screen.findByRole('region', { name: '11.13 (금)' })
    expect(within(day).getByText('18:20 · 오사카 3박 4일')).toBeTruthy()
    expect(within(day).getByText('¥2,800')).toBeTruthy()
    // 11월 항목 합(10.30 항목은 빠진다)
    expect(screen.getByText('₩186,420')).toBeTruthy()
  })

  it('서버가 "이번 달" 합계를 주지 않으면 영웅 숫자를 숨긴다(목록을 더하지 않는다)', async () => {
    const item = {
      id: 'we-x', source: 'MANUAL', kind: 'APPROVAL', occurredAt: '2026-11-13T08:50:00+09:00', localDate: '2026-11-13',
      merchantName: '결제', memo: null, amount: '5000', currency: 'KRW', krwAmount: 5000, paymentMethodLabel: null,
      linkedTrip: null, editableFields: ['amount', 'currency', 'memo', 'occurredAt'], canChangeTrip: true, canDelete: true, version: 1,
    }
    server.use(http.get('/api/wallet/entries', () => HttpResponse.json({ items: [item], nextCursor: null })))
    renderApp('/wallet')
    expect(await screen.findByText('08:50')).toBeTruthy()
    expect(screen.queryByText('이번 달')).toBeNull()
    expect(screen.queryByText('₩5,000', { selector: '.text-amount-xl' })).toBeNull()
  })

  it('빈 상태: "결제 기록이 없어요" + 하단 "결제 추가"', async () => {
    db.walletEntries = []
    renderApp('/wallet')
    expect(await screen.findByText('결제 기록이 없어요')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '결제 추가' }))
    expect(await sheet('결제 추가')).toBeTruthy()
  })

  it('추가: 여정 행이 추천 여정(오사카), 칩 JPY · 부산을 고르면 KRW 고정 · "추가 안 함"이면 JPY로 돌아온다', async () => {
    renderApp('/wallet/new')
    const form = await sheet('결제 추가')
    await waitFor(() => expect(button(form, /^여정/).textContent).toContain('오사카 3박 4일'))
    expect(button(form, /통화 바꾸기, 지금 JPY/)).toBeTruthy()
    typeAmount(form, '1280')
    fireEvent.click(button(form, /^여정/))
    const pick = await sheet('여정')
    expect(within(pick).getByText('진행 중 · 11.12 – 11.15')).toBeTruthy()
    fireEvent.click(within(pick).getByRole('radio', { name: /부산 연말 모임/ }))
    const back = await sheet('결제 추가')
    expect(within(back).getByText('KRW')).toBeTruthy()
    expect(within(back).queryByRole('button', { name: /통화 바꾸기/ })).toBeNull()
    fireEvent.click(button(back, /^여정/))
    fireEvent.click(within(await sheet('여정')).getByRole('radio', { name: '추가 안 함' }))
    const again = await sheet('결제 추가')
    expect(button(again, /^여정/).textContent).toContain('추가 안 함')
    expect(button(again, /통화 바꾸기, 지금 JPY/)).toBeTruthy()
  })

  it('추가하면 오사카에 미확정으로 들어간다', async () => {
    renderApp('/wallet/new')
    const form = await sheet('결제 추가')
    await waitFor(() => expect(button(form, /^여정/).textContent).toContain('오사카 3박 4일'))
    typeAmount(form, '1280')
    fireEvent.click(button(form, '추가'))
    expect(await screen.findByText('추가했어요')).toBeTruthy()
    expect(manualExpenses()[0]).toMatchObject({ status: 'PENDING', tripId: TRIP.osaka, krwAmount: 11_770 })
  })

  it('공동 결제에 연결된 항목 삭제 → "공동 결제도 삭제할까요?" → 둘 다 지운다', async () => {
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: /이치란 라멘/ }))
    await screen.findByRole('button', { name: '삭제' })
    const edit = await sheet('결제 수정')
    // 공동으로 확정된 결제라 여정 행은 바꿀 수 없다(Q-46)
    expect(button(edit, /^여정/).hasAttribute('disabled')).toBe(true)
    fireEvent.click(button(edit, '삭제'))
    const dialog = await screen.findByRole('alertdialog', { name: '공동 결제도 삭제할까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText('삭제했어요')).toBeTruthy()
    expect(db.expenses.some((e) => e.id === 'exp-ichiran')).toBe(false)
  })
})
