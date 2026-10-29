import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import { db, MEMBER, TRIP, USER } from '../../mocks/data'
import type { PaymentDetail } from '../payments/types'
import {
  createTripExpense,
  createWalletEntry,
  deleteTripExpense,
  deleteWalletEntry,
  updateTripExpense,
  updateWalletEntry,
} from './api'
import { apiFetch } from '../../api'
import type { ManualPaymentDetail, WalletEntryListResponse, WalletTripCandidatesResponse } from './types'

// 목 계약(서버 S7 동작) — 화면 테스트가 기대는 규칙을 먼저 고정한다. 목 시점 = 11.13 18:34(오사카 진행 중)

const entries = () => apiFetch<WalletEntryListResponse>('/wallet/entries?limit=50')
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
    return null
  } catch (error) {
    return error instanceof ApiError ? error.code : String(error)
  }
}

describe('지갑 목(FR-421·422·810)', () => {
  it('목록은 최신순, 연결 여정 이름·원화가 붙는다', async () => {
    const page = await entries()
    expect(page.items.map((e) => e.merchantName).slice(0, 3)).toEqual(['551 호라이 난바본점', 'MK택시', '패밀리마트 난바역점'])
    expect(page.items[0]).toMatchObject({ krwAmount: 25_740, linkedTrip: { groupName: '오사카 3박 4일' }, editableFields: ['amount', 'currency', 'memo', 'occurredAt'] })
    expect(page.items.at(-1)).toMatchObject({ merchantName: '결제', memo: null, linkedTrip: null })
  })

  it('후보: 기간 안 → 진행 중 → 시작일 가까운 순, 추천 · 기본 통화', async () => {
    const res = await apiFetch<WalletTripCandidatesResponse>(`/wallet/trip-candidates?at=${encodeURIComponent('2026-11-13T12:00:00+09:00')}`)
    expect(res.items.map((c) => c.tripId)).toEqual([TRIP.osaka, TRIP.busan])
    expect(res.suggestedTripId).toBe(TRIP.osaka)
    expect(res.defaultCurrency).toBe('JPY')
    const none = await apiFetch<WalletTripCandidatesResponse>(`/wallet/trip-candidates?at=${encodeURIComponent('2026-11-01T12:00:00+09:00')}`)
    expect(none.suggestedTripId).toBeNull()
  })

  it('추가하면 추천 여정에 미확정으로 들어가고, 같은 clientRequestId는 하나만 만든다', async () => {
    const body = { amount: '1280', currency: 'JPY', memo: '편의점', tripId: TRIP.osaka, clientRequestId: 'req-1' }
    const first = await createWalletEntry(body)
    await createWalletEntry(body)
    expect(first.entry).toMatchObject({ merchantName: '편의점', krwAmount: 11_770, linkedTrip: { tripId: TRIP.osaka, expenseStatus: 'PENDING' } })
    expect(first.linkedExpense).toMatchObject({ status: 'PENDING', origin: 'MANUAL' })
    expect(db.walletEntries.filter((w) => w.clientRequestId === 'req-1')).toHaveLength(1)
  })

  it('"추가 안 함"(tripId null)이면 지갑에만', async () => {
    const res = await createWalletEntry({ amount: '6800', currency: 'KRW', tripId: null })
    expect(res.entry.linkedTrip).toBeNull()
    expect(res.linkedExpense).toBeNull()
  })

  it('검증: 0원 · 1억 초과 · JPY 소수점 · 미래 시각은 400', async () => {
    expect(await codeOf(createWalletEntry({ amount: '0', tripId: null }))).toBe('VALIDATION_FAILED')
    expect(await codeOf(createWalletEntry({ amount: '100000010', currency: 'KRW', tripId: null }))).toBe('VALIDATION_FAILED')
    expect(await codeOf(createWalletEntry({ amount: '12.5', currency: 'JPY', tripId: null }))).toBe('VALIDATION_FAILED')
    expect(await codeOf(createWalletEntry({ amount: '1000', currency: 'KRW', occurredAt: '2026-11-13T18:40:00+09:00', tripId: null }))).toBe('VALIDATION_FAILED')
  })

  it('진행 중 공동 결제에 연결된 항목 삭제: includeShared 없으면 409, 있으면 둘 다 지운다', async () => {
    expect(await codeOf(deleteWalletEntry('we-ichiran', false))).toBe('SHARED_DELETE_CONFIRM_REQUIRED')
    expect(db.expenses.some((e) => e.id === 'exp-ichiran')).toBe(true)
    await deleteWalletEntry('we-ichiran', true)
    expect(db.expenses.some((e) => e.id === 'exp-ichiran')).toBe(false)
    expect(db.walletEntries.some((w) => w.id === 'we-ichiran')).toBe(false)
  })

  it('미확정 연결 항목 삭제는 다이얼로그 없이 결제도 함께', async () => {
    await deleteWalletEntry('we-famima', false)
    expect(db.expenses.some((e) => e.id === 'exp-famima')).toBe(false)
  })

  it('수정: 공동 결제 금액을 바꾸면 결제에도 반영되고 "변경됨" · 확정된 결제는 여정을 못 바꾼다', async () => {
    const res = await updateWalletEntry('we-ichiran', { version: 1, amount: '4000', currency: 'JPY' })
    expect(res.entry.amount).toBe('4000')
    const e = db.expenses.find((x) => x.id === 'exp-ichiran')!
    expect(e.originalAmount).toBe('4000')
    expect(e.changed).toBe(true)
    expect(await codeOf(updateWalletEntry('we-ichiran', { version: 2, tripId: null }))).toBe('EXPENSE_LOCKED')
  })

  it('미확정이면 연결을 끊을 수 있다(결제는 지운다)', async () => {
    const res = await updateWalletEntry('we-famima', { version: 1, tripId: null })
    expect(res.entry.linkedTrip).toBeNull()
    expect(db.expenses.some((e) => e.id === 'exp-famima')).toBe(false)
  })
})

describe('여정 결제 목(FR-420·423·424·425)', () => {
  const create = (body: Parameters<typeof createTripExpense>[1]) => createTripExpense(TRIP.osaka, body) as Promise<ManualPaymentDetail>

  it('기본 = 나 결제 · 전원 공동, 나만이면 개인', async () => {
    const shared = await create({ amount: '3000', memo: '타코야키' })
    expect(shared).toMatchObject({ status: 'SHARED', merchantName: '타코야키', krwAmount: 27_580, origin: 'MANUAL' })
    expect(shared.participants).toHaveLength(4)
    expect(shared.permissions).toMatchObject({ canEdit: true, isAuthor: true })
    const personal = await create({ amount: '500', participantMembershipIds: [MEMBER.junyong] })
    expect(personal.status).toBe('PERSONAL')
  })

  it('대신 기록: 결제자 혼자 · 지갑 기록은 400, 결제자에게는 읽기 전용(NOT_AUTHOR)', async () => {
    expect(await codeOf(create({ amount: '500', payerMembershipId: MEMBER.minji, participantMembershipIds: [MEMBER.minji] }))).toBe('VALIDATION_FAILED')
    expect(await codeOf(create({ amount: '500', payerMembershipId: MEMBER.minji, addToWallet: true }))).toBe('VALIDATION_FAILED')
    const detail = await create({ amount: '500', payerMembershipId: MEMBER.minji })
    db.meUserId = USER.minji
    const seen = await apiFetch<PaymentDetail>(`/trips/${TRIP.osaka}/expenses/${detail.id}`)
    expect(seen.permissions).toMatchObject({ canEdit: false, reason: 'NOT_AUTHOR' })
    expect(await codeOf(updateTripExpense(TRIP.osaka, detail.id, { version: 1, memo: 'x' }))).toBe('NOT_AUTHOR')
  })

  it('"내 지갑에도 기록"이면 지갑 항목이 생기고 상세 walletEntryId가 채워진다', async () => {
    const detail = await create({ amount: '1200', addToWallet: true })
    expect(detail.walletEntryId).toBeTruthy()
    const page = await entries()
    expect(page.items.some((e) => e.linkedTrip?.expenseId === detail.id)).toBe(true)
  })

  it('수정: 날짜를 바꾸면 지갑 항목도 · 공동 → 개인은 확인이 필요하다', async () => {
    const detail = await create({ amount: '1200', addToWallet: true })
    await updateTripExpense(TRIP.osaka, detail.id, { version: 1, occurredAt: '2026-11-13T10:00:00+09:00' })
    expect(db.walletEntries.find((w) => w.expenseId === detail.id)?.occurredAt).toBe('2026-11-13T10:00:00+09:00')
    expect(await codeOf(updateTripExpense(TRIP.osaka, detail.id, { version: 2, participantMembershipIds: [MEMBER.junyong] }))).toBe(
      'SHARED_TO_PERSONAL_CONFIRM_REQUIRED',
    )
    expect(await codeOf(updateTripExpense(TRIP.osaka, detail.id, { version: 2, payerMembershipId: MEMBER.minji }))).toBe('VALIDATION_FAILED')
  })

  it('여정 쪽 삭제는 지갑 항목을 남기고 연결만 끊는다(Q-45)', async () => {
    const detail = await create({ amount: '1200', addToWallet: true })
    await deleteTripExpense(TRIP.osaka, detail.id, 1)
    const left = db.walletEntries.find((w) => w.amount === '1200' && w.expenseId === null)
    expect(left).toBeTruthy()
  })

  it('가져온 결제는 수동 API로 못 바꾼다 · 종료 여정에는 못 더한다', async () => {
    expect(await codeOf(updateTripExpense(TRIP.osaka, 'exp-mk', { version: 1, memo: 'x' }))).toBe('NOT_MANUAL_ENTRY')
    expect(await codeOf(createTripExpense(TRIP.jeju, { amount: '1000' }))).toBe('TRIP_PHASE_INVALID')
  })

  it('중복 의심: 같은 원화 · 30분 안이면 결제자와 상관없이 묶인다(FR-407)', async () => {
    const a = await create({ amount: '3000', occurredAt: '2026-11-13T15:00:00+09:00' })
    const b = await create({ amount: '3000', occurredAt: '2026-11-13T15:20:00+09:00', payerMembershipId: MEMBER.minji })
    expect(b.flags.duplicateSuspected).toBe(true)
    const again = await apiFetch<PaymentDetail>(`/trips/${TRIP.osaka}/expenses/${a.id}`)
    expect(again.duplicate).toMatchObject({ canDismiss: true })
  })
})
