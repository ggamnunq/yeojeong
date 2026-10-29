import { describe, expect, it } from 'vitest'
import type { MemberSummary } from '../../api'
import {
  allowedCurrencies,
  candidateSubtitle,
  currencySymbol,
  dateValueLabel,
  entryCountLabel,
  fractionDigitsOf,
  isFuture,
  isPayerOnlyForOther,
  isPersonalSplit,
  isPositiveAmount,
  kstIso,
  monthTotalLabel,
  normalizeAmount,
  overKrwLimit,
  previewKrw,
  sanitizeMemo,
  splitSummary,
  splitValid,
  toggleCurrency,
  trimAmount,
  tripRatePerUnit,
  walletMeta,
  walletOriginal,
} from './rules'

const member = (id: string, joinOrder: number, nickname: string, isMe = false): MemberSummary =>
  ({ membershipId: id, joinOrder, nickname, isMe, isLeft: false, profileImageUrl: null, role: 'MEMBER' }) as MemberSummary

const ME = member('me', 1, '준용', true)
const MINJI = member('minji', 2, '민지')
const TAEHYUN = member('taehyun', 3, '태현')
const SUBIN = member('subin', 4, '수빈')
const ALL = [ME, MINJI, TAEHYUN, SUBIN]

describe('통화(4-11-6)', () => {
  it('KRW와 대상 통화 둘만, KRW 여정은 KRW 하나', () => {
    expect(allowedCurrencies('JPY')).toEqual(['KRW', 'JPY'])
    expect(allowedCurrencies('KRW')).toEqual(['KRW'])
    expect(allowedCurrencies(null)).toEqual(['KRW'])
  })

  it('칩을 누르면 다음 통화, 하나뿐이면 그대로', () => {
    expect(toggleCurrency('JPY', ['KRW', 'JPY'])).toBe('KRW')
    expect(toggleCurrency('KRW', ['KRW', 'JPY'])).toBe('JPY')
    expect(toggleCurrency('KRW', ['KRW'])).toBe('KRW')
  })

  it('소수 자리: KRW·JPY·VND·IDR 0, 그 밖 2(서버 fractionDigits가 있으면 그 값)', () => {
    expect(fractionDigitsOf('JPY')).toBe(0)
    expect(fractionDigitsOf('USD')).toBe(2)
    expect(fractionDigitsOf('USD', [{ code: 'USD', name: '', unitName: '', displayUnit: 1, fractionDigits: 0 } as never])).toBe(0)
  })

  it('기호', () => {
    expect(currencySymbol('JPY')).toBe('¥')
    expect(currencySymbol('KRW')).toBe('₩')
    expect(currencySymbol('MYR')).toBe('')
  })
})

describe('금액', () => {
  it('통화를 바꾸면 소수 자리만 자른다', () => {
    expect(trimAmount('12.34', 0)).toBe('12')
    expect(trimAmount('12.345', 2)).toBe('12.34')
    expect(trimAmount('1200', 0)).toBe('1200')
    expect(trimAmount('', 2)).toBe('')
  })

  it('보낼 값·양수 판정', () => {
    expect(normalizeAmount('12.')).toBe('12')
    expect(normalizeAmount('')).toBe('0')
    expect(isPositiveAmount('0')).toBe(false)
    expect(isPositiveAmount('0.01')).toBe(true)
  })

  it('원화 미리보기: KRW는 그대로, 외화는 환율이 있을 때만(10원 반올림)', () => {
    expect(previewKrw('1200', 'JPY', '9.192')).toBe(11030)
    expect(previewKrw('2860', 'JPY', '9.192')).toBe(26290)
    expect(previewKrw('5600', 'KRW', null)).toBe(5600)
    expect(previewKrw('1200', 'JPY', null)).toBeNull()
  })

  it('원화 1억 초과면 막는다', () => {
    expect(overKrwLimit(100_000_000)).toBe(false)
    expect(overKrwLimit(100_000_010)).toBe(true)
    expect(overKrwLimit(null)).toBe(false)
  })

  it('여정 환율: FIXED면 고정 환율 ÷ 고시 단위, 아니면 최신 고시', () => {
    expect(tripRatePerUnit({ policy: 'FIXED', fixedRate: '919.20', displayUnit: 100, current: null })).toBe('9.192000')
    expect(tripRatePerUnit({ policy: 'SPOT_AT_PAYMENT', fixedRate: null, displayUnit: 100, current: { rate: '9.192000' } as never })).toBe('9.192000')
    expect(tripRatePerUnit(undefined)).toBeNull()
  })
})

describe('내용', () => {
  it('줄바꿈·제어문자를 지우고 40자(이모지 1자)에서 자른다', () => {
    expect(sanitizeMemo('타코\n야키')).toBe('타코야키')
    expect(sanitizeMemo('가'.repeat(45))).toHaveLength(40)
    expect([...sanitizeMemo('🍣'.repeat(41))]).toHaveLength(40)
  })
})

describe('나누기(WF-47)', () => {
  it('나만 고르면 개인, 대신 기록하면서 결제자 혼자면 막는다(I-13)', () => {
    expect(isPersonalSplit(['me'], 'me', 'me')).toBe(true)
    expect(isPersonalSplit(['me', 'minji'], 'me', 'me')).toBe(false)
    expect(isPayerOnlyForOther(['minji'], 'minji', 'me')).toBe(true)
    expect(splitValid(['minji'], 'minji', 'me')).toBe(false)
    expect(splitValid([], 'me', 'me')).toBe(false)
    expect(splitValid(['minji', 'me'], 'minji', 'me')).toBe(true)
  })

  it('1인 금액은 내림, 나머지는 결제자 — HF-47 "3명 · 1인 ₩3,676 · 결제자 +2원"', () => {
    expect(splitSummary(11030, ALL, ['me', 'minji', 'taehyun'], 'me')).toEqual({ count: 3, perPerson: 3676, remainder: '결제자 +2원' })
    expect(splitSummary(11030, ALL, ALL.map((m) => m.membershipId), 'me')).toEqual({ count: 4, perPerson: 2757, remainder: '결제자 +2원' })
  })

  it('결제자가 빠지면 가입 순 첫 사람이 나머지를 진다', () => {
    expect(splitSummary(11030, ALL, ['taehyun', 'subin', 'minji'], 'me')?.remainder).toBe('민지 +2원')
    expect(splitSummary(1000, ALL, [], 'me')).toBeNull()
  })
})

describe('날짜', () => {
  it('고르지 않았으면 "지금", 고르면 "11.13 15:20"', () => {
    expect(dateValueLabel(null)).toBe('지금')
    expect(dateValueLabel('2026-11-13T15:20:00+09:00')).toBe('11.13 15:20')
  })

  it('KST 조립·미래 판정(지금 + 5분까지 허용)', () => {
    const now = Date.parse('2026-11-13T18:34:00+09:00')
    expect(kstIso('2026-11-13', '18:39')).toBe('2026-11-13T18:39:00+09:00')
    expect(isFuture('2026-11-13T18:39:00+09:00', now)).toBe(false)
    expect(isFuture('2026-11-13T18:40:00+09:00', now)).toBe(true)
  })
})

describe('지갑(WF-49)', () => {
  const linked = { tripId: 't', groupName: '오사카 3박 4일' } as never
  it('메타 "08:50 · 오사카 3박 4일", 연결이 없으면 시각만', () => {
    expect(walletMeta({ occurredAt: '2026-11-13T08:50:00+09:00', linkedTrip: linked })).toBe('08:50 · 오사카 3박 4일')
    expect(walletMeta({ occurredAt: '2026-11-13T08:50:00+09:00', linkedTrip: null })).toBe('08:50')
  })

  it('원통화 보조 금액은 외화만', () => {
    expect(walletOriginal({ amount: '1280', currency: 'JPY' })).toBe('¥1,280')
    expect(walletOriginal({ amount: '6800', currency: 'KRW' })).toBeNull()
  })

  it('"이번 달" 금액: 추정이 섞였으면 "약"', () => {
    expect(monthTotalLabel(412_350)).toBe('₩412,350')
    expect(monthTotalLabel(412_350, true)).toBe('약 ₩412,350')
  })

  it('여정 후보 보조 줄 · 마이페이지 건수', () => {
    expect(candidateSubtitle({ status: 'ONGOING', startDate: '2026-11-12', endDate: '2026-11-15' })).toBe('진행 중 · 11.12 – 11.15')
    expect(candidateSubtitle({ status: 'UPCOMING', startDate: '2026-12-27', endDate: '2026-12-29' })).toBe('시작 전 · 12.27 – 12.29')
    expect(entryCountLabel(12)).toBe('결제 12건')
  })
})
