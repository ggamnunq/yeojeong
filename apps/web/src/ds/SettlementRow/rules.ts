import { formatKrw } from '../format'

export type SettlementRowNet = 'receive' | 'send' | 'even'

/** 순잔액(결제합 − 부담액) 부호 → 받을 돈 / 보낼 돈 / 정산 끝. 원 단위 반올림해서 0이면 even */
export function settlementNet(netAmount: number): SettlementRowNet {
  const won = Math.round(netAmount)
  if (won > 0) return 'receive'
  if (won < 0) return 'send'
  return 'even'
}

export const SETTLEMENT_LABEL = {
  receive: '받을 돈',
  send: '보낼 돈',
  even: '정산 끝',
} as const satisfies Record<SettlementRowNet, string>

/**
 * 순잔액 표기. 색만으로 구분하지 않도록 부호와 라벨을 항상 같이 쓴다(spec 1장 ±금액).
 * +₩161,000 받을 돈 · −₩48,250 보낼 돈 · ₩0 정산 끝
 */
export function formatSettlement(netAmount: number, net: SettlementRowNet = settlementNet(netAmount)) {
  const amount =
    net === 'even' ? formatKrw(0) : formatKrw(net === 'receive' ? Math.abs(netAmount) : -Math.abs(netAmount), { sign: 'always' })
  return { net, amount, label: SETTLEMENT_LABEL[net] }
}
