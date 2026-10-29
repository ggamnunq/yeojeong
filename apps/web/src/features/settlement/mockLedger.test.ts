import { describe, expect, it } from 'vitest'
import { db, EDGE_EXPENSE_IDS, MEMBER, TRIP } from '../../mocks/data'
import { JEJU, seedJejuSettlement } from '../../mocks/seeds'
import { ledgerOf } from './mockData'
import { budgetRatio, budgetState, computeLedger, divRoundHalfUp, spendingSplit, splitShares } from './mockLedger'

// 목 장부가 서버(S2C)와 같은 식을 쓰는지(기능명세 4-3·4-4·4-6·4-9 샘플 수치)

const nets = (tripId: string, ended = false) =>
  Object.fromEntries(ledgerOf(tripId, { ended }).members.map((m) => [m.membershipId, [m.paidKrw, m.burdenKrw, m.netKrw]]))

describe('분담(4-3)', () => {
  it('1인 = floor, 나머지는 결제자', () => {
    expect(splitShares(26_290, ['a', 'b', 'c', 'd'], 'a')).toEqual([
      { membershipId: 'a', amountKrw: 6_574 },
      { membershipId: 'b', amountKrw: 6_572 },
      { membershipId: 'c', amountKrw: 6_572 },
      { membershipId: 'd', amountKrw: 6_572 },
    ])
  })

  it('결제자가 부담 인원에 없으면 가입 순 첫 사람이 나머지', () => {
    expect(splitShares(10, ['b', 'c', 'd'], 'a').map((s) => s.amountKrw)).toEqual([4, 3, 3])
  })
})

describe('정산(4-4)', () => {
  it('제주 종료 샘플 = 명세 종료 수치(공동 11건 ₩826,910)', () => {
    seedJejuSettlement()
    const ledger = ledgerOf(TRIP.jeju, { ended: true })
    expect(ledger.totalSharedKrw).toBe(826_910)
    expect(ledger.sharedCount).toBe(11)
    expect(ledger.memberCount).toBe(4)
    expect(ledger.perCapitaKrw).toBe(206_728) // round_half_up(206,727.5)
    expect(nets(TRIP.jeju, true)).toEqual({
      [JEJU.junyong]: [316_390, 213_300, 103_090],
      [JEJU.taehyeon]: [191_200, 200_155, -8_955],
      [JEJU.minji]: [186_960, 213_300, -26_340],
      [JEJU.subin]: [132_360, 200_155, -67_795],
    })
    expect(ledger.transfers.map((t) => [t.fromMembershipId, t.toMembershipId, t.amountKrw])).toEqual([
      [JEJU.subin, JEJU.junyong, 67_795],
      [JEJU.minji, JEJU.junyong, 26_340],
      [JEJU.taehyeon, JEJU.junyong, 8_955],
    ])
    expect(ledger.members.find((m) => m.membershipId === JEJU.subin)?.isLeft).toBe(true)
    expect(ledger.members.map((m) => m.personalCount)).toEqual([2, 0, 3, 1])
  })

  it('결제·부담이 없는 나간 멤버는 목록과 N에서 빠진다(FR-705)', () => {
    const result = computeLedger(
      [
        { membershipId: 'a', joinOrder: 1, isLeft: false },
        { membershipId: 'b', joinOrder: 2, isLeft: true },
        { membershipId: 'c', joinOrder: 3, isLeft: true },
      ],
      [{ payerMembershipId: 'a', netKrw: 101, shares: splitShares(101, ['a', 'b'], 'a') }],
    )
    expect(result.members.map((m) => m.membershipId)).toEqual(['a', 'b'])
    expect(result.perCapitaKrw).toBe(51)
  })

  it('공동 0건이면 모두 ₩0, 송금 권장안 없음', () => {
    const result = computeLedger([{ membershipId: 'a', joinOrder: 1, isLeft: false }], [])
    expect(result).toMatchObject({ totalSharedKrw: 0, perCapitaKrw: 0, transfers: [] })
  })

  it('검산 합이 0이 아니면 실패', () => {
    expect(() =>
      computeLedger([{ membershipId: 'a', joinOrder: 1, isLeft: false }], [{ payerMembershipId: 'a', netKrw: 10, shares: [] }]),
    ).toThrow()
  })

  it('반올림은 half-up', () => {
    expect(divRoundHalfUp(826_910, 4)).toBe(206_728)
    expect(divRoundHalfUp(5, 2)).toBe(3)
  })
})

describe('현황 지표(4-6·4-9)', () => {
  it('오사카 11.13 18:34 샘플: 미확정 빼고 멤버별 부담', () => {
    db.expenses = db.expenses.filter((e) => !(EDGE_EXPENSE_IDS as readonly string[]).includes(e.id))
    const ledger = ledgerOf(TRIP.osaka)
    expect(ledger.totalSharedKrw).toBe(352_790)
    expect(nets(TRIP.osaka)).toEqual({
      [MEMBER.junyong]: [62_690, 94_770, -32_080],
      [MEMBER.minji]: [128_320, 94_770, 33_550],
      [MEMBER.taehyeon]: [117_660, 81_625, 36_035],
      [MEMBER.subin]: [44_120, 81_625, -37_505],
    })
  })

  it('예산 상태 경계: 80% 미만 정상 · 80~100% 주의(경계 포함) · 100% 초과', () => {
    expect(budgetState(79_999, 100_000)).toBe('NORMAL')
    expect(budgetState(80_000, 100_000)).toBe('CAUTION')
    expect(budgetState(100_000, 100_000)).toBe('CAUTION')
    expect(budgetState(100_001, 100_000)).toBe('OVER')
    expect(budgetState(0, 0)).toBe('NORMAL')
    expect(budgetState(1, 0)).toBe('OVER')
    expect(budgetRatio(352_790, 1_200_000)).toBe(0.294)
  })

  it('내 지출 비율: 54% / 46%, 0이면 null', () => {
    expect(spendingSplit(94_770, 79_420)).toEqual({ totalKrw: 174_190, sharedPct: 54, personalPct: 46 })
    expect(spendingSplit(0, 0)).toEqual({ totalKrw: 0, sharedPct: null, personalPct: null })
  })
})
