// 지갑·환율 표기(화면명세 0-5). 시각은 언제나 KST로 읽는다(기기 시간대와 무관).
// TODO(DS 추가 요청): 환율·동기화 시각·결제수단 개수 표기는 DS format.ts에 없어 여기 둔다. DS에 들어가면 그쪽을 쓴다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO 시각 → KST 날짜·시각 조각 */
function kst(iso: string | number) {
  const d = new Date((typeof iso === 'number' ? iso : Date.parse(iso)) + KST_OFFSET_MS)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() }
}

/** "18:00" */
export function formatKstTime(iso: string): string {
  const t = kst(iso)
  return `${pad(t.hh)}:${pad(t.mm)}`
}

/** 오늘(KST)이면 "18:32 동기화", 아니면 "10.27 18:32 동기화" */
export function formatSyncedAt(iso: string, now: number = Date.now()): string {
  const t = kst(iso)
  const today = kst(now)
  const time = `${pad(t.hh)}:${pad(t.mm)}`
  const sameDay = t.y === today.y && t.m === today.m && t.d === today.d
  return sameDay ? `${time} 동기화` : `${pad(t.m)}.${pad(t.d)} ${time} 동기화`
}

/** "1380.5" · "919.20" → "1,380.50" · "919.20"(소수 둘째 자리 고정, 천 단위 쉼표) */
export function formatFxRate(displayRate: string): string {
  const value = Number(displayRate)
  if (!Number.isFinite(value)) return displayRate
  const [int, frac] = value.toFixed(2).split('.')
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`
}

/** "100엔" · "1달러" — 고시 단위 + 통화 한글명 */
export const fxUnitLabel = (displayUnit: number, currencyNameKo: string) => `${displayUnit}${currencyNameKo}`

/** "100엔 = 919.20원" */
export const formatFxLabel = (displayUnit: number, currencyNameKo: string, displayRate: string) =>
  `${fxUnitLabel(displayUnit, currencyNameKo)} = ${formatFxRate(displayRate)}원`

/** "계좌 1 · 카드 2". 0인 쪽은 뺀다. 둘 다 0이면 빈 문자열 */
export function formatMethodCounts(accounts: number, cards: number): string {
  return [accounts > 0 && `계좌 ${accounts}`, cards > 0 && `카드 ${cards}`].filter(Boolean).join(' · ')
}

/**
 * 결제수단 번호 표시(확정 규칙): 계좌는 앞 4·끝 3자리, 카드는 끝 4자리만 보인다. 나머지 숫자는 *.
 * 서버가 이미 마스킹해 주지만(카드 앞 4자리 포함 "5365-****-****-1934") 화면에서 한 번 더 규칙대로 가린다.
 * "5365-****-****-1934" → "****-****-****-1934", "3333-01-2345821" → "3333-**-****821"
 */
export function displayMaskedNumber(type: 'ACCOUNT' | 'CARD', masked: string): string {
  const slots = [...masked].filter((ch) => /[\d*]/.test(ch)).length
  const head = type === 'ACCOUNT' ? 4 : 0
  const tail = type === 'ACCOUNT' ? 3 : 4
  let seen = 0
  return [...masked]
    .map((ch) => {
      if (!/[\d*]/.test(ch)) return ch
      seen += 1
      return seen <= head || seen > slots - tail ? ch : '*'
    })
    .join('')
}
