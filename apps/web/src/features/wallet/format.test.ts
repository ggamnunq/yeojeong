import { describe, expect, it } from 'vitest'
import { displayMaskedNumber, formatFxLabel, formatFxRate, formatMethodCounts, formatSyncedAt } from './format'

describe('지갑 표기', () => {
  it('동기화 시각: 오늘(KST)이면 HH:mm, 아니면 MM.DD HH:mm', () => {
    const now = Date.parse('2026-11-13T20:00:00+09:00')
    expect(formatSyncedAt('2026-11-13T18:32:00+09:00', now)).toBe('18:32 동기화')
    expect(formatSyncedAt('2026-10-27T09:12:00+09:00', now)).toBe('10.27 09:12 동기화')
    // UTC로 오면 KST로 바꿔 읽는다
    expect(formatSyncedAt('2026-11-13T00:05:00Z', now)).toBe('09:05 동기화')
  })

  it('환율: 고시 단위 + 소수 둘째 자리 + 천 단위 쉼표', () => {
    expect(formatFxRate('919.2')).toBe('919.20')
    expect(formatFxRate('1380.5')).toBe('1,380.50')
    expect(formatFxLabel(100, '엔', '919.20')).toBe('100엔 = 919.20원')
    expect(formatFxLabel(1, '달러', '1380.50')).toBe('1달러 = 1,380.50원')
  })

  it('결제수단 개수: 0인 쪽은 뺀다', () => {
    expect(formatMethodCounts(1, 2)).toBe('계좌 1 · 카드 2')
    expect(formatMethodCounts(0, 2)).toBe('카드 2')
    expect(formatMethodCounts(0, 0)).toBe('')
  })

  it('번호 표시: 계좌 앞 4·끝 3, 카드 끝 4자리만', () => {
    expect(displayMaskedNumber('CARD', '**** **** **** 1934')).toBe('**** **** **** 1934')
    expect(displayMaskedNumber('ACCOUNT', '3333-**-****821')).toBe('3333-****-***-821')
    expect(displayMaskedNumber('ACCOUNT', '1000*****321')).toBe('1000-****-***-321')
  })
})
