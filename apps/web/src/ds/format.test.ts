import { describe, expect, it } from 'vitest'
import { formatKrw, formatMoney, MINUS } from './format'

describe('formatKrw', () => {
  it('₩를 앞에 두고 세 자리마다 쉼표를 찍는다', () => {
    expect(formatKrw(0)).toBe('₩0')
    expect(formatKrw(999)).toBe('₩999')
    expect(formatKrw(1000)).toBe('₩1,000')
    expect(formatKrw(1284000)).toBe('₩1,284,000')
    expect(formatKrw(1234567890)).toBe('₩1,234,567,890')
  })

  it('음수는 하이픈이 아니라 U+2212 마이너스를 쓴다', () => {
    expect(formatKrw(-28400)).toBe(`${MINUS}₩28,400`)
    expect(formatKrw(-28400)).toBe('−₩28,400')
    expect(formatKrw(-28400)).not.toContain('-')
  })

  it('원 단위로 반올림하고, 반올림해서 0이면 부호를 붙이지 않는다', () => {
    expect(formatKrw(9466.67)).toBe('₩9,467')
    expect(formatKrw(-0.4)).toBe('₩0')
    expect(formatKrw(-0)).toBe('₩0')
  })

  it("sign: 'always'는 양수에 +를 붙이고 0에는 붙이지 않는다", () => {
    expect(formatKrw(161000, { sign: 'always' })).toBe('+₩161,000')
    expect(formatKrw(-48250, { sign: 'always' })).toBe('−₩48,250')
    expect(formatKrw(0, { sign: 'always' })).toBe('₩0')
  })

  it("sign: 'never'는 절댓값만 쓴다", () => {
    expect(formatKrw(-48250, { sign: 'never' })).toBe('₩48,250')
  })
})

describe('formatMoney', () => {
  it('통화마다 기호와 소수 자릿수가 다르다', () => {
    expect(formatMoney(3200, 'JPY')).toBe('¥3,200')
    expect(formatMoney(-3200, 'JPY')).toBe('−¥3,200')
    expect(formatMoney(12.5, 'USD')).toBe('$12.50')
    expect(formatMoney(1234.567, 'EUR')).toBe('€1,234.57')
  })

  it('기본 통화는 KRW', () => {
    expect(formatMoney(48250)).toBe('₩48,250')
  })
})
