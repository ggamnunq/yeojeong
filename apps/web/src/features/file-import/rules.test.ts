import { describe, expect, it } from 'vitest'
import { chunk, formatYuan, groupRows, inAcceptedRange, initialSelection, rowAmounts, rowChip, selectAllState, toggleAll, toImportItems, type ResultRow } from './rules'

const row = (over: Partial<ResultRow> = {}): ResultRow => ({
  txnDigest: 'd1',
  occurredAt: '2026-11-13T12:30:00+08:00',
  amount: '128.00',
  originalAmount: '128.00',
  currency: 'CNY',
  merchantName: '滴滴出行',
  refund: 'NONE',
  refundAmount: null,
  imported: false,
  inTripId: 'trip-1',
  ...over,
})

describe('결과 규칙(HF-68)', () => {
  const rows = [
    row({ txnDigest: 'a' }),
    row({ txnDigest: 'b', inTripId: null }),
    row({ txnDigest: 'c', imported: true }),
    row({ txnDigest: 'd', refund: 'FULL' }),
    row({ txnDigest: 'e', refund: 'PARTIAL', amount: '98.00', refundAmount: '30.00' }),
  ]

  it('기본 선택 = 고를 수 있고 여정 기간 안. 추가됨·전액 환불은 못 고른다', () => {
    expect([...initialSelection(rows)]).toEqual(['a', 'e'])
    expect(selectAllState(rows, initialSelection(rows))).toEqual({ total: 3, count: 2, checked: false, indeterminate: true })
    expect([...toggleAll(rows, new Set(['a']))].sort()).toEqual(['a', 'b', 'e'])
    expect(toggleAll(rows, new Set(['a', 'b', 'e'])).size).toBe(0)
  })

  it('칩', () => {
    expect(rows.map(rowChip)).toEqual([undefined, undefined, '추가됨', '환불됨', undefined])
  })

  it('금액: ¥ 주 금액 + "약 ₩" / 부분 환불 줄', () => {
    expect(rowAmounts(row(), '190.080000')).toEqual({ amount: '¥128.00', subAmount: '약 ₩24,330' })
    expect(rowAmounts(row(), null)).toEqual({ amount: '¥128.00', subAmount: undefined })
    expect(rowAmounts(rows[4], '190.08')).toEqual({ amount: '¥98.00', subAmount: '부분 환불 −¥30.00' })
    expect(rowAmounts(row({ refund: 'PARTIAL', refundAmount: null }), '190.08')).toEqual({ amount: '¥128.00', subAmount: '부분 환불' })
    expect(formatYuan('1234567.5')).toBe('¥1,234,567.50')
  })

  it('KST 날짜로 묶는다(23:30 CST = 다음 날 00:30 KST)', () => {
    const groups = groupRows([row({ txnDigest: 'x', occurredAt: '2026-11-12T23:30:00+08:00' }), row({ txnDigest: 'y', occurredAt: '2026-11-12T22:00:00+08:00' })])
    expect(groups.map((g) => [g.localDate, g.items.map((i) => i.txnDigest)])).toEqual([
      ['2026-11-13', ['x']],
      ['2026-11-12', ['y']],
    ])
  })

  it('저장 요청은 고른 것의 계약 필드만', () => {
    const items = toImportItems(rows, new Set(['a', 'c', 'd']))
    expect(items).toEqual([{ txnDigest: 'a', occurredAt: '2026-11-13T12:30:00+08:00', amount: '128.00', currency: 'CNY', merchantName: '滴滴出行' }])
  })

  it('서버가 받는 시각 범위(365일 · 미래 5분)', () => {
    const now = Date.parse('2026-11-13T18:34:00+09:00')
    expect(inAcceptedRange('2026-11-13T17:38:00+08:00', now)).toBe(true)
    expect(inAcceptedRange('2026-11-13T17:40:00+08:00', now)).toBe(false)
    expect(inAcceptedRange('2025-11-14T12:00:00+08:00', now)).toBe(true)
    expect(inAcceptedRange('2025-11-12T12:00:00+08:00', now)).toBe(false)
  })

  it('chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
