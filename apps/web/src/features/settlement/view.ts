import type { MemberSummary } from '../../api'
import {
  formatKrw,
  formatMoney,
  formatSettlement,
  orderMembers,
  payerLabel,
  type AvatarPerson,
  type CurrencyCode,
  type SettlementRowNet,
} from '../../ds'
import type { SettlementDirection } from './types'

// 현황·정산 화면의 표시 규칙(화면명세 0-5). 서버 값을 글자로만 바꾸고 다시 계산하지 않는다.

/** 서버 MemberSummary → DS AvatarPerson(프사·나·나간 멤버) */
export function toPerson(member: MemberSummary, left = member.isLeft): AvatarPerson {
  return { name: member.nickname, src: member.profileImageUrl, joinOrder: member.joinOrder, me: member.isMe, left }
}

/** 사람 행 목록 순서(C-05): 나 먼저 → 가입 순. 서버 정렬을 믿되 화면에서도 한 번 더 맞춘다 */
export function orderByMember<T extends { member: MemberSummary }>(items: readonly T[]): T[] {
  return orderMembers(items.map((item) => ({ item, me: item.member.isMe, joinOrder: item.member.joinOrder }))).map(
    ({ item }) => item,
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const KST_OFFSET_MS = 9 * 3_600_000
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** ISO 시각 → KST "MM.DD HH:mm" */
export function kstDateTime(iso: string) {
  const d = new Date(Date.parse(iso) + KST_OFFSET_MS)
  return `${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** 멤버별 내역 행 메타: "11.12 11:20 · 민지" / "11.12 11:20 · 내 결제" (HF #50, 결제자 표기 규칙에 날짜를 붙임) */
export function paymentDateMeta(occurredAt: string, payer: Pick<AvatarPerson, 'name' | 'me'>) {
  return `${kstDateTime(occurredAt)} · ${payerLabel(payer)}`
}

/** "2026-11-12" → "11.12 (목)" (경로 라벨) */
export function routeDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${pad(m)}.${pad(d)} (${weekday})`
}

const NET: Record<SettlementDirection, SettlementRowNet> = { RECEIVE: 'receive', SEND: 'send', EVEN: 'even' }

export const settlementNetOf = (direction: SettlementDirection) => NET[direction]

/** 정산 ±: "+₩103,090" 받을 돈 · "−₩26,340" 보낼 돈 · "₩0" 정산 끝. 부호와 라벨을 항상 같이 쓴다 */
export function settlementText(direction: SettlementDirection, netKrw: number) {
  return formatSettlement(netKrw, NET[direction])
}

type SettlementLike = {
  member: MemberSummary
  paidKrw: number
  burdenKrw: number
  netKrw: number
  direction: SettlementDirection
}

/** 정산 행 접근성 이름: "민지, 결제 ₩186,960, 부담 ₩213,300, 보낼 돈 ₩26,340" — 부호 대신 받을 돈·보낼 돈으로 읽힌다 */
export function settlementRowLabel(row: SettlementLike, left: boolean) {
  const s = settlementText(row.direction, row.netKrw)
  const who = [row.member.nickname, row.member.isMe && '(나)', left && '(나간 멤버)'].filter(Boolean).join(' ')
  return `${who}, 결제 ${formatKrw(row.paidKrw)}, 부담 ${formatKrw(row.burdenKrw)}, ${s.label} ${formatKrw(Math.abs(row.netKrw))}`
}

const SYMBOL_CURRENCIES: readonly string[] = ['JPY', 'USD', 'EUR']
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 결제 행 오른쪽 아래 원통화("¥5,960"). KRW 결제면 없음(0-7). 기호 없는 통화는 "1,200 MYR" */
export function originalAmountText(amount: string, currency: string): string | undefined {
  if (currency === 'KRW') return undefined
  if (SYMBOL_CURRENCIES.includes(currency)) return formatMoney(Number(amount), currency as CurrencyCode)
  const [int, frac] = amount.split('.')
  return `${group(int)}${frac ? `.${frac}` : ''} ${currency}`
}
