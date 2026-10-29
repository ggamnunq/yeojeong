import { describe, expect, it } from 'vitest'
import { buildRows, chunk, groupRows, kstDateRange, spotRateAt, suggestTripId, inAcceptedRange, initialSelection, rowAmounts, rowChip, selectAllState, toggleAll, toImportItems, type ResultRow } from './rules'

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
  estimatedKrw: 24330,
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

  it('금액: 원통화(CN¥) 주 금액 + "약 ₩"(결제 시각 기준) / 부분 환불 줄', () => {
    expect(rowAmounts(row())).toEqual({ amount: 'CN¥128.00', subAmount: '약 ₩24,330' })
    expect(rowAmounts(row({ estimatedKrw: null }))).toEqual({ amount: 'CN¥128.00', subAmount: undefined })
    expect(rowAmounts(rows[4])).toEqual({ amount: 'CN¥98.00', subAmount: '부분 환불 −CN¥30.00' })
    expect(rowAmounts(row({ refund: 'PARTIAL', refundAmount: null }))).toEqual({ amount: 'CN¥128.00', subAmount: '부분 환불' })
    expect(rowAmounts(row({ amount: '1234567.50' })).amount).toBe('CN¥1,234,567.50')
  })

  it('자동 연결 여정은 내 여정 목록으로(서버 규칙과 같다): 기간 안 → 진행 중 먼저 → 시작이 가까운 순', () => {
    const trips = [
      { tripId: 'b-upcoming', status: 'UPCOMING' as const, startDate: '2026-11-12', endDate: '2026-11-20' },
      { tripId: 'a-ongoing', status: 'ONGOING' as const, startDate: '2026-11-01', endDate: '2026-11-15' },
      { tripId: 'c-ended', status: 'ENDED' as const, startDate: '2026-11-01', endDate: '2026-11-30' },
    ]
    expect(suggestTripId(trips, '2026-11-13T12:00:00+08:00')).toBe('a-ongoing')
    expect(suggestTripId(trips, '2026-11-18T12:00:00+08:00')).toBe('b-upcoming')
    // 종료일 23:59(KST)까지 안, 다음 날 00:00(KST) = 전날 23:00(CST)부터 밖
    expect(suggestTripId(trips.slice(1, 2), '2026-11-15T22:59:59+08:00')).toBe('a-ongoing')
    expect(suggestTripId(trips.slice(1, 2), '2026-11-15T23:00:00+08:00')).toBeNull()
    expect(suggestTripId(trips, '2026-10-01T12:00:00+08:00')).toBeNull()
  })

  it('"약 ₩"은 결제 시각 이전 가장 최근 고시로, 이전 고시가 없으면 없다', () => {
    const rates = [
      { rate: '190.000000', effectiveAt: '2026-11-12T09:00:00+09:00' },
      { rate: '200.000000', effectiveAt: '2026-11-13T09:00:00+09:00' },
    ]
    expect(spotRateAt(rates, '2026-11-13T07:59:59+08:00')).toBe('190.000000')
    expect(spotRateAt(rates, '2026-11-13T08:00:00+08:00')).toBe('200.000000')
    expect(spotRateAt(rates, '2026-11-12T07:00:00+08:00')).toBeNull()
    const built = buildRows(
      [row({ txnDigest: 'x', occurredAt: '2026-11-13T12:00:00+08:00', amount: '10.00' }), row({ txnDigest: 'y', occurredAt: '2026-11-01T12:00:00+08:00' })],
      [true],
      [],
      rates,
    )
    expect(built.map((r) => [r.imported, r.inTripId, r.estimatedKrw])).toEqual([
      [true, null, 2000],
      [false, null, null],
    ])
    expect(kstDateRange(built)).toEqual({ from: '2026-11-01', to: '2026-11-13' })
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
