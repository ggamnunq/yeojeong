// Input Type=Amount(DS18 · 화면명세 B-24) 순수 로직. 큰 금액 입력은 원값(raw, "1200" · "12.5")을 상태로 쥐고
// 화면에는 천 단위 쉼표를 넣어 보인다("1,200"). 소수 자리는 통화 규칙(KRW·JPY 0, USD 2 …)으로 자른다.

/** 정수 부분 최대 자릿수(천억 단위). 넘는 입력은 잘라 버린다 */
export const AMOUNT_MAX_INTEGER_DIGITS = 12

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * 사용자가 친 글자 → 원값. 숫자와 첫 소수점만 남기고, 소수 자리는 fractionDigits까지, 정수 앞 0은 지운다.
 * fractionDigits가 0이면 소수점부터 버린다. 빈 입력은 "".
 * 예: "1,2a00" → "1200" · "007" → "7" · ".5"(2자리) → "0.5" · "3.456"(2자리) → "3.45"
 */
export function normalizeAmountInput(text: string, fractionDigits = 0, maxIntegerDigits = AMOUNT_MAX_INTEGER_DIGITS) {
  const cleaned = text.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  const rawInt = dot === -1 ? cleaned : cleaned.slice(0, dot)
  const rawFrac = dot === -1 ? '' : cleaned.slice(dot + 1).replace(/\./g, '')
  let int = rawInt.replace(/^0+(?=\d)/, '').slice(0, maxIntegerDigits)
  if (fractionDigits <= 0 || dot === -1) return int
  if (int === '') int = '0'
  return `${int}.${rawFrac.slice(0, fractionDigits)}`
}

const splitAmount = (text: string) => {
  const cleaned = text.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  return {
    int: (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, ''),
    frac: dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, ''),
  }
}

/**
 * 이미 자리 한도(정수 maxIntegerDigits · 소수 fractionDigits)가 찬 칸에 더 친 입력인가. 그러면 무시한다(값·캐럿 그대로) —
 * 잘라 넣으면 캐럿을 앞에 두고 칠 때 끝자리가 밀려 사라진다(W6 QA). 덜 찬 칸에 한꺼번에 넣으면(붙여넣기) 지금처럼 자른다
 */
export function amountInputOverflows(
  text: string,
  previous: string,
  fractionDigits = 0,
  maxIntegerDigits = AMOUNT_MAX_INTEGER_DIGITS,
) {
  const next = splitAmount(text)
  const prev = splitAmount(previous)
  if (next.int.length > maxIntegerDigits && prev.int.length >= maxIntegerDigits) return true
  return (
    fractionDigits > 0 &&
    next.frac !== null &&
    next.frac.length > fractionDigits &&
    (prev.frac?.length ?? 0) >= fractionDigits
  )
}

/** 원값 → 보이는 글자: "1200" → "1,200" · "1234.5" → "1,234.5" · "12." → "12." · "" → "" */
export function formatAmountInput(raw: string) {
  if (raw === '') return ''
  const [int, frac] = raw.split('.')
  return frac === undefined ? group(int) : `${group(int)}.${frac}`
}

/** 원값 → 숫자(빈 값은 0). 서버로 보낼 때·버튼 조건(금액 > 0)에 쓴다 */
export const amountInputNumber = (raw: string) => (raw === '' || raw === '.' ? 0 : Number(raw))

/**
 * 쉼표를 다시 넣은 뒤 캐럿 위치: 캐럿 앞에 있던 숫자·소수점 개수(count)만큼 지나간 자리.
 * 가운데를 고쳐도 캐럿이 맨 끝으로 튀지 않게 한다.
 */
export function amountCaretPosition(formatted: string, count: number) {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i += 1) {
    if (formatted[i] !== ',') seen += 1
    if (seen === count) return i + 1
  }
  return formatted.length
}

/** 글자 text의 position 앞에 있는 숫자·소수점 개수 */
export const amountCharsBefore = (text: string, position: number) => text.slice(0, position).replace(/[^\d.]/g, '').length

/**
 * 긴 금액은 칸(통화 칩 왼쪽)을 넘치지 않게 글자를 줄인다(숫자 개수 기준, 소수 자리 포함):
 * 9개까지 Amount/XL 40 · 13개까지 Amount/L 32 · 그 위(정수 12자리 + 소수) Amount/M 20
 */
export function amountInputSize(display: string) {
  const length = display.replace(/\D/g, '').length
  if (length <= 9) return 'text-amount-xl'
  if (length <= 13) return 'text-amount-l'
  return 'text-amount-m'
}
