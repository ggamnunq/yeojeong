import { describe, expect, it } from 'vitest'
import type { MemberSummary } from '../../api'
import {
  dayLabel,
  defaultDay,
  detailLine,
  formatDateLabel,
  formatOriginal,
  initialDraft,
  isWithdrawn,
  kst,
  refundDetailLine,
  remainderLabel,
  sheetCta,
  sheetMode,
  todayDay,
  toPerson,
} from './rules'

const member = (over: Partial<MemberSummary> = {}): MemberSummary => ({
  membershipId: 'm-1',
  nickname: '민지',
  profileImageUrl: null,
  role: 'MEMBER',
  joinOrder: 2,
  isMe: false,
  isLeft: false,
  ...over,
})

describe('표시 포맷(화면명세 0-5)', () => {
  it('KST 시각·날짜 헤더·Day', () => {
    expect(kst('2026-11-13T08:50:00+09:00')).toEqual({ date: '2026-11-13', monthDay: '11.13', time: '08:50' })
    expect(kst('2026-11-12T23:30:00Z').date).toBe('2026-11-13')
    expect(formatDateLabel('2026-11-13')).toBe('11.13 (금)')
    expect(dayLabel({ dayIndex: 2, periodSide: null })).toBe('Day 2')
    expect(dayLabel({ dayIndex: null, periodSide: 'BEFORE' })).toBe('여정 전')
    expect(dayLabel({ dayIndex: null, periodSide: 'AFTER' })).toBe('여정 후')
  })

  it('원통화: 기호 + ISO 소수 자리, KRW는 숨김, 표에 없는 통화는 코드 뒤', () => {
    expect(formatOriginal('3960', 'JPY')).toBe('¥3,960')
    expect(formatOriginal('12.5', 'USD')).toBe('$12.50')
    expect(formatOriginal('-13200', 'JPY')).toBe('¥13,200')
    expect(formatOriginal('1200', 'MYR')).toBe('1,200 MYR')
    expect(formatOriginal('486000', 'KRW')).toBeNull()
  })

  it('상세 줄: 결제자는 결제수단까지, 비결제자는 일시까지, 환불 묶음은 원통화 순액 · 날짜', () => {
    const base = { occurredAt: '2026-11-13T08:50:00+09:00', originalAmount: '1280', originalCurrency: 'JPY' }
    expect(detailLine({ ...base, paymentMethodLabel: '토스뱅크 체크카드 1934' })).toBe('¥1,280 · 11.13 08:50 · 토스뱅크 체크카드 1934')
    expect(detailLine({ ...base, paymentMethodLabel: null })).toBe('¥1,280 · 11.13 08:50')
    expect(detailLine({ ...base, originalCurrency: 'KRW', paymentMethodLabel: null })).toBe('11.13 08:50')
    expect(refundDetailLine({ localDate: '2026-11-13', netOriginalAmount: '0', originalCurrency: 'JPY' })).toBe('¥0 · 11.13 (금)')
  })
})

describe('오늘 Day(FR-502)', () => {
  const trip = { status: 'ONGOING' as const, startDate: '2026-11-12', days: 4 }
  it('진행 중 = 오늘(1 ~ days), 그 밖 = null → 기본 Day 1', () => {
    expect(todayDay(trip, Date.parse('2026-11-13T18:34:00+09:00'))).toBe(2)
    expect(todayDay(trip, Date.parse('2026-11-11T09:00:00+09:00'))).toBe(1)
    expect(todayDay(trip, Date.parse('2026-11-20T09:00:00+09:00'))).toBe(4)
    expect(todayDay({ ...trip, status: 'ENDED' }, Date.now())).toBeNull()
    expect(defaultDay({ ...trip, status: 'ENDED' }, Date.now())).toBe(1)
  })
})

describe('사람', () => {
  it('나간 멤버는 흐림(left), 탈퇴한 멤버는 회색 기본 아바타 + 이름만', () => {
    expect(toPerson(member({ isLeft: true }))).toMatchObject({ name: '민지', left: true, joinOrder: 1 })
    const withdrawn = member({ nickname: '탈퇴한 멤버', isLeft: true })
    expect(isWithdrawn(withdrawn)).toBe(true)
    expect(toPerson(withdrawn)).toEqual({ name: '탈퇴한 멤버', src: null, source: 'default', joinOrder: 1 })
  })
})

describe('결제 상세 시트(부록 A, 4-3)', () => {
  const payer = member({ membershipId: 'me', nickname: '준용', isMe: true, joinOrder: 1 })
  const perm = (canEdit: boolean, reason: 'NOT_PAYER' | 'TRIP_ENDED' | 'PAYER_LEFT' | null) => ({ canEdit, reason, isPayer: canEdit })

  it('모드는 permissions로', () => {
    expect(sheetMode({ status: 'PENDING', permissions: perm(true, null) })).toBe('EDIT_PENDING')
    expect(sheetMode({ status: 'PERSONAL', permissions: perm(true, null) })).toBe('EDIT_PERSONAL')
    expect(sheetMode({ status: 'SHARED', permissions: perm(true, null) })).toBe('EDIT_SHARED')
    expect(sheetMode({ status: 'SHARED', permissions: perm(false, 'NOT_PAYER') })).toBe('READ_ONLY')
    expect(sheetMode({ status: 'SHARED', permissions: perm(false, 'PAYER_LEFT') })).toBe('READ_ONLY')
    expect(sheetMode({ status: 'SHARED', permissions: perm(false, 'TRIP_ENDED') })).toBe('LOCKED')
  })

  it('처음 선택: 미확정 = [공동] · 기본값 전원(Q-01), 개인 = [개인], 공동 = 지금 부담 인원', () => {
    const ids = ['me', 'a', 'b']
    expect(initialDraft({ status: 'PENDING', participants: null, defaultParticipantMembershipIds: ids }, [])).toEqual({ type: 'shared', selected: ids })
    expect(initialDraft({ status: 'PERSONAL', participants: null, defaultParticipantMembershipIds: null }, ids)).toEqual({ type: 'personal', selected: ids })
    expect(initialDraft({ status: 'SHARED', participants: [payer], defaultParticipantMembershipIds: null }, ids)).toEqual({ type: 'shared', selected: ['me'] })
  })

  it('버튼: 결제자 외 최소 1명(Q-08), 저장은 바뀌었을 때만, 개인 결제의 [개인]은 버튼 없음', () => {
    const detail = { payer, participants: [payer, member({ membershipId: 'a' })] }
    expect(sheetCta('EDIT_PENDING', { type: 'personal', selected: [] }, detail)).toMatchObject({ label: '개인으로 확정', disabled: false })
    expect(sheetCta('EDIT_PENDING', { type: 'shared', selected: ['me'] }, detail)).toMatchObject({ label: '공동으로 확정', disabled: true })
    expect(sheetCta('EDIT_PENDING', { type: 'shared', selected: ['a'] }, detail)).toMatchObject({ disabled: false })
    expect(sheetCta('EDIT_PERSONAL', { type: 'personal', selected: ['me', 'a'] }, detail)).toBeNull()
    expect(sheetCta('EDIT_PERSONAL', { type: 'shared', selected: ['me', 'a'] }, detail)).toMatchObject({ label: '공동으로 변경', disabled: false })
    expect(sheetCta('EDIT_SHARED', { type: 'shared', selected: ['a', 'me'] }, detail)).toMatchObject({ label: '저장', disabled: true })
    expect(sheetCta('EDIT_SHARED', { type: 'shared', selected: ['me', 'a', 'b'] }, detail)).toMatchObject({ label: '저장', disabled: false })
    expect(sheetCta('EDIT_SHARED', { type: 'personal', selected: [] }, detail)).toMatchObject({ action: 'TO_PERSONAL', label: '개인으로 변경' })
    expect(sheetCta('READ_ONLY', { type: 'shared', selected: [] }, detail)).toBeNull()
  })

  it('나머지 표기: 결제자가 있으면 DS 기본("결제자 +N원"), 없으면 가입 순 첫 사람', () => {
    const a = member({ membershipId: 'a', nickname: '민지', joinOrder: 2 })
    const b = member({ membershipId: 'b', nickname: '태현', joinOrder: 3 })
    expect(remainderLabel(2, [payer, a], 'me')).toBeUndefined()
    expect(remainderLabel(0, [a, b], 'me')).toBeUndefined()
    expect(remainderLabel(2, [b, a], 'me')).toBe('민지 +2원')
  })
})
