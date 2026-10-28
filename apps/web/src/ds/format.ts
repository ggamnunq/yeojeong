// 금액 표기 헬퍼. 통화 기호는 숫자 앞(₩ ¥ $ €), 음수는 하이픈이 아니라 수학 기호 마이너스(U+2212)로 쓴다(Figma와 같음).
// Intl.NumberFormat은 런타임(ICU)마다 기호·부호 모양이 달라서 쓰지 않는다.

export const MINUS = '−'

const CURRENCIES = {
  KRW: { symbol: '₩', digits: 0 },
  JPY: { symbol: '¥', digits: 0 },
  USD: { symbol: '$', digits: 2 },
  EUR: { symbol: '€', digits: 2 },
} as const satisfies Record<string, { symbol: string; digits: number }>

export type CurrencyCode = keyof typeof CURRENCIES

export type MoneyFormatOptions = {
  /** auto = 음수만 −, always = 양수에 +도 붙임(0은 부호 없음), never = 절댓값만 */
  sign?: 'auto' | 'always' | 'never'
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export function formatMoney(amount: number, currency: CurrencyCode = 'KRW', { sign = 'auto' }: MoneyFormatOptions = {}) {
  const { symbol, digits } = CURRENCIES[currency]
  const fixed = Math.abs(amount).toFixed(digits)
  const [int, frac] = fixed.split('.')
  const body = `${symbol}${group(int)}${frac ? `.${frac}` : ''}`
  // 반올림해서 0이 되면 부호를 붙이지 않는다(−₩0 방지)
  if (Number(fixed) === 0 || sign === 'never') return body
  if (amount < 0) return `${MINUS}${body}`
  return sign === 'always' ? `+${body}` : body
}

/** ₩1,284,000 · −₩28,400 · (sign: 'always') +₩161,000 */
export const formatKrw = (amount: number, options?: MoneyFormatOptions) => formatMoney(amount, 'KRW', options)
