import type { BudgetState } from '../../api'

// 목(MSW)이 쓰는 정산·현황 계산. 서버(S2C settlements/compute.ts · summary-math.ts)와 같은 식(기능명세 4-3·4-4·4-6·4-9).
// 화면은 서버가 준 값을 그대로 그리고 다시 계산하지 않는다. 이 파일은 mocks.ts와 테스트만 쓴다(운영 번들에 들어가지 않음).

export type LedgerMemberInput = {
  membershipId: string
  joinOrder: number
  /** 나간 멤버. 결제·부담이 하나도 없으면 결과에서 빠진다(FR-705 수락 기준 2) */
  isLeft: boolean
  personalCount?: number
}

export type LedgerExpenseInput = {
  payerMembershipId: string
  /** 순액(환불 반영, ≥ 0) */
  netKrw: number
  /** 부담 인원 몫(나머지 포함). Σ amountKrw = netKrw */
  shares: readonly { membershipId: string; amountKrw: number }[]
}

export type LedgerMember = {
  membershipId: string
  joinOrder: number
  isLeft: boolean
  paidKrw: number
  paidCount: number
  burdenKrw: number
  /** paid − burden. + 받을 돈 / − 보낼 돈 */
  netKrw: number
  personalCount: number
}

export type LedgerTransfer = { seq: number; fromMembershipId: string; toMembershipId: string; amountKrw: number }

export type LedgerResult = {
  totalSharedKrw: number
  sharedCount: number
  memberCount: number
  perCapitaKrw: number
  /** 가입 순 */
  members: LedgerMember[]
  transfers: LedgerTransfer[]
}

/** 0 이상 정수 나눗셈 반올림(half-up). round_half_up(206727.5) = 206728 */
export function divRoundHalfUp(numer: number, denom: number): number {
  return Math.floor((numer * 2 + denom) / (denom * 2))
}

/**
 * 부담 인원 균등 분할(4-3). 1인 = floor(net / n), 나머지 r = net − 1인 × n은 결제자가 진다.
 * 결제자가 부담 인원에 없으면 부담 인원 중 가입 순 첫 사람이 진다(Q-08 추천). participants는 가입 순으로 넘긴다.
 */
export function splitShares(netKrw: number, participants: readonly string[], payerMembershipId: string) {
  const n = participants.length
  if (n === 0) return []
  const perPerson = Math.floor(netKrw / n)
  const remainder = netKrw - perPerson * n
  const holder = participants.includes(payerMembershipId) ? payerMembershipId : participants[0]
  return participants.map((membershipId) => ({
    membershipId,
    amountKrw: perPerson + (membershipId === holder ? remainder : 0),
  }))
}

/** 송금 권장안(4-4 그리디). 채권자 순잔액 내림차순, 채무자 |순잔액| 내림차순, 동률은 가입 순 */
export function greedyTransfers(members: readonly Pick<LedgerMember, 'membershipId' | 'joinOrder' | 'netKrw'>[]): LedgerTransfer[] {
  const byJoin = (a: { joinOrder: number }, b: { joinOrder: number }) => a.joinOrder - b.joinOrder
  const creditors = members
    .filter((m) => m.netKrw > 0)
    .map((m) => ({ ...m, left: m.netKrw }))
    .sort((a, b) => b.left - a.left || byJoin(a, b))
  const debtors = members
    .filter((m) => m.netKrw < 0)
    .map((m) => ({ ...m, left: -m.netKrw }))
    .sort((a, b) => b.left - a.left || byJoin(a, b))
  const transfers: LedgerTransfer[] = []
  while (creditors.length > 0 && debtors.length > 0) {
    const c = creditors[0]
    const d = debtors[0]
    const amount = Math.min(c.left, d.left)
    transfers.push({ seq: transfers.length + 1, fromMembershipId: d.membershipId, toMembershipId: c.membershipId, amountKrw: amount })
    c.left -= amount
    d.left -= amount
    if (c.left === 0) creditors.shift()
    if (d.left === 0) debtors.shift()
  }
  return transfers
}

/**
 * 정산 계산(4-4). M = 활성 멤버 ∪ 결제자·부담 인원인 나간 멤버.
 * paid = Σ 결제 순액(결제자 = m), burden = Σ 부담 몫, net = paid − burden, N빵 1인 = round_half_up(total / N).
 */
export function computeLedger(members: readonly LedgerMemberInput[], expenses: readonly LedgerExpenseInput[]): LedgerResult {
  const rows = new Map(members.map((m) => [m.membershipId, { m, paidKrw: 0, paidCount: 0, burdenKrw: 0, involved: false }]))
  const row = (id: string) => {
    const found = rows.get(id)
    if (!found) throw new RangeError(`멤버 목록에 없는 멤버십: ${id}`)
    return found
  }
  let totalSharedKrw = 0
  for (const e of expenses) {
    const payer = row(e.payerMembershipId)
    payer.paidKrw += e.netKrw
    payer.paidCount += 1
    payer.involved = true
    totalSharedKrw += e.netKrw
    for (const share of e.shares) {
      const holder = row(share.membershipId)
      holder.burdenKrw += share.amountKrw
      holder.involved = true
    }
  }
  const result: LedgerMember[] = [...rows.values()]
    .filter((r) => !r.m.isLeft || r.involved)
    .sort((a, b) => a.m.joinOrder - b.m.joinOrder)
    .map((r) => ({
      membershipId: r.m.membershipId,
      joinOrder: r.m.joinOrder,
      isLeft: r.m.isLeft,
      paidKrw: r.paidKrw,
      paidCount: r.paidCount,
      burdenKrw: r.burdenKrw,
      netKrw: r.paidKrw - r.burdenKrw,
      personalCount: r.m.personalCount ?? 0,
    }))
  const imbalance = result.reduce((sum, m) => sum + m.netKrw, 0)
  if (imbalance !== 0) throw new Error(`정산 검산 실패: 순잔액 합이 ${imbalance}원`)
  return {
    totalSharedKrw,
    sharedCount: expenses.length,
    memberCount: result.length,
    perCapitaKrw: result.length > 0 ? divRoundHalfUp(totalSharedKrw, result.length) : 0,
    members: result,
    transfers: greedyTransfers(result),
  }
}

/** 예산 상태(4-6). spent / budget < 0.8 NORMAL · 0.8 ~ 1.0 CAUTION(경계 포함) · > 1.0 OVER. 정수로 비교한다 */
export function budgetState(spentKrw: number, budgetKrw: number): BudgetState {
  if (budgetKrw <= 0) return spentKrw > 0 ? 'OVER' : 'NORMAL'
  if (spentKrw * 10 < budgetKrw * 8) return 'NORMAL'
  if (spentKrw <= budgetKrw) return 'CAUTION'
  return 'OVER'
}

/** spent / budget, 소수 넷째 자리 반올림 */
export function budgetRatio(spentKrw: number, budgetKrw: number): number {
  if (budgetKrw <= 0) return 0
  return divRoundHalfUp(spentKrw * 10_000, budgetKrw) / 10_000
}

/** 내 지출 = 부담 + 개인. 공동% = round(부담 / 내 지출 × 100), 개인% = 100 − 공동%. 0이면 null */
export function spendingSplit(sharedBurdenKrw: number, personalKrw: number) {
  const totalKrw = sharedBurdenKrw + personalKrw
  if (totalKrw <= 0) return { totalKrw, sharedPct: null, personalPct: null }
  const sharedPct = divRoundHalfUp(sharedBurdenKrw * 100, totalKrw)
  return { totalKrw, sharedPct, personalPct: 100 - sharedPct }
}
