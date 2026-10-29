import { splitEvenly, toKrw, type SupportedCurrency } from '@yeojeong/shared'
import type { MemberSummary } from '../../api'
import { formatKrw, normalizeAmountInput, walletMeta as dsWalletMeta } from '../../ds'
import { formatOriginal, kst } from '../payments/rules'
import type { TripFxView } from '../wallet/types'
import {
  MANUAL_KRW_AMOUNT_MAX,
  MANUAL_MEMO_MAX_LENGTH,
  type WalletEntry,
  type WalletTripCandidate,
} from './types'

// 수동 결제 입력·표시 규칙(화면명세 K절 · 0-5, 기능명세 4-11). 화면 없이 테스트한다.

// ── 통화 ─────────────────────────────────────────────────────────

/** 소수 자리(서버 규칙: KRW·JPY·VND·IDR 0, 그 밖 2). GET /api/currencies의 fractionDigits가 오면 그 값 */
const ZERO_DIGIT = new Set(['KRW', 'JPY', 'VND', 'IDR'])

export function fractionDigitsOf(code: string, currencies?: readonly SupportedCurrency[]): number {
  const known = currencies?.find((c) => c.code === code)
  if (typeof known?.fractionDigits === 'number') return known.fractionDigits
  return ZERO_DIGIT.has(code) ? 0 : 2
}

const SYMBOLS: Record<string, string> = {
  KRW: '₩',
  JPY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: 'CN¥',
  THB: '฿',
  VND: '₫',
  TWD: 'NT$',
  HKD: 'HK$',
  SGD: 'S$',
  AUD: 'A$',
  PHP: '₱',
}

/** 큰 금액 앞 기호. 표에 없으면 빈 문자열(칩의 코드로 알 수 있다) */
export const currencySymbol = (code: string) => SYMBOLS[code] ?? ''

/** 고를 수 있는 통화: KRW와 대상(여정·기본) 통화 둘뿐(v0.6.1) */
export function allowedCurrencies(other: string | null | undefined): string[] {
  return other && other !== 'KRW' ? ['KRW', other] : ['KRW']
}

/** 칩을 누르면 다음 통화. 하나뿐이면 그대로 */
export function toggleCurrency(current: string, allowed: readonly string[]): string {
  if (allowed.length < 2) return allowed[0] ?? current
  return allowed[(allowed.indexOf(current) + 1) % allowed.length]
}

// ── 금액 입력 ─────────────────────────────────────────────────────
// 입력 정규화·쉼표 표시는 DS InputAmount(normalizeAmountInput · formatAmountInput)가 한다. 자리 초과는 잘려 입력되지 않는다.

/** 통화를 바꾸면 소수 자리만 새 규칙으로 자른다(입력값 유지) */
export const trimAmount = (raw: string, digits: number) => (raw === '' ? '' : normalizeAmountInput(raw, digits))

/** 서버로 보낼 decimal("12." → "12", "" → "0") */
export const normalizeAmount = (raw: string) => (raw.endsWith('.') ? raw.slice(0, -1) : raw) || '0'

export const isPositiveAmount = (raw: string) => Number(normalizeAmount(raw)) > 0

// ── 원화 미리보기 ──────────────────────────────────────────────────

/** 여정 환율 정책의 1단위당 원(FIXED면 고정 환율 ÷ 고시 단위). 고시가 없으면 null */
export function tripRatePerUnit(fx: Pick<TripFxView, 'policy' | 'fixedRate' | 'displayUnit' | 'current'> | null | undefined): string | null {
  if (!fx) return null
  if (fx.policy === 'FIXED' && fx.fixedRate) return (Number(fx.fixedRate) / fx.displayUnit).toFixed(6)
  return fx.current?.rate ?? null
}

/** "≈ ₩" 값. KRW면 금액 그대로, 외화는 환율이 있을 때만(toKrw — 서버와 같은 10원 반올림) */
export function previewKrw(raw: string, currency: string, rate: string | null): number | null {
  if (!isPositiveAmount(raw)) return currency === 'KRW' ? 0 : null
  const amount = normalizeAmount(raw)
  if (currency === 'KRW') return Math.round(Number(amount))
  if (!rate) return null
  try {
    return toKrw(amount, Number(rate).toFixed(6))
  } catch {
    return null
  }
}

/** 원화 환산 상한(₩100,000,000) 초과 */
export const overKrwLimit = (krw: number | null) => krw !== null && krw > MANUAL_KRW_AMOUNT_MAX

// ── 내용 ─────────────────────────────────────────────────────────

/** 줄바꿈·제어문자를 지우고 40자(grapheme)에서 자른다 */
export function sanitizeMemo(input: string): string {
  // oxlint-disable-next-line no-control-regex -- 제어문자를 지운다
  const clean = input.replace(/[\u0000-\u001f\u007f]/g, '')
  const segments = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(clean)].map((s) => s.segment)
  return segments.slice(0, MANUAL_MEMO_MAX_LENGTH).join('')
}

// ── 사람·나누기 ────────────────────────────────────────────────────

/** 나만 고른 개인 결제인가(결제자 = 나 + 나누기 = 결제자 혼자) */
export function isPersonalSplit(selected: readonly string[], payerId: string, meId: string) {
  return selected.length === 1 && selected[0] === payerId && payerId === meId
}

/** 대신 기록하면서 결제자 혼자만 나누는 경우(I-13) — 막는다 */
export function isPayerOnlyForOther(selected: readonly string[], payerId: string, meId: string) {
  return payerId !== meId && selected.length === 1 && selected[0] === payerId
}

/** 나누기가 유효한가(1명 이상, I-13) */
export const splitValid = (selected: readonly string[], payerId: string, meId: string) =>
  selected.length > 0 && !isPayerOnlyForOther(selected, payerId, meId)

/**
 * 나누기 요약(HF-47): 1인 금액은 원 단위 내림, 나머지는 결제자(없으면 가입 순 첫 사람)가 진다(shared splitEvenly).
 * 나머지 표기: 결제자가 부담 인원에 있으면 "결제자 +2원", 없으면 "민지 +2원"
 */
export function splitSummary(krw: number, members: readonly MemberSummary[], selected: readonly string[], payerId: string) {
  const people = members.filter((m) => selected.includes(m.membershipId))
  if (people.length === 0) return null
  const result = splitEvenly(Math.max(0, Math.round(krw)), people, payerId)
  let remainder: string | undefined
  if (result.remainderKrw > 0) {
    const holder = people.find((m) => m.membershipId === result.remainderHolderMembershipId)
    remainder =
      result.remainderHolderMembershipId === payerId
        ? `결제자 +${result.remainderKrw}원`
        : `${holder?.isMe ? '나' : holder?.nickname} +${result.remainderKrw}원`
  }
  return { count: people.length, perPerson: result.perPersonKrw, remainder }
}

// ── 날짜 ─────────────────────────────────────────────────────────

/** 날짜 행 값: 고르지 않았으면 "지금", 고르면 "11.13 15:20" */
export function dateValueLabel(occurredAt: string | null) {
  if (!occurredAt) return '지금'
  const at = kst(occurredAt)
  return `${at.monthDay} ${at.time}`
}

/** KST 날짜·시각 → ISO "2026-11-13T15:20:00+09:00" */
export const kstIso = (date: string, time: string) => `${date}T${time}:00+09:00`

/** 고른 시각이 미래(지금 + 5분 초과)인가 */
export const isFuture = (iso: string, now: number) => Date.parse(iso) > now + 5 * 60_000

// ── 지갑 ─────────────────────────────────────────────────────────

/** 지갑 행 메타(0-5): "08:50 · 오사카 3박 4일", 연결이 없으면 "08:50" */
export const walletMeta = (entry: Pick<WalletEntry, 'occurredAt' | 'linkedTrip'>) =>
  dsWalletMeta(kst(entry.occurredAt).time, entry.linkedTrip?.groupName)

/** 지갑 행 원통화 보조 금액(외화만) */
export const walletOriginal = (entry: Pick<WalletEntry, 'amount' | 'currency'>) => formatOriginal(entry.amount, entry.currency)

/** 영웅 "이번 달" 금액(서버 monthTotalKrw). 추정치가 섞였으면 "약 ₩…" */
export const monthTotalLabel = (krw: number, estimated?: boolean) => `${estimated ? '약 ' : ''}${formatKrw(krw)}`

/** 마이페이지 지갑 요약(HF-30): "결제 12건"(서버 Me.walletEntryCount) */
export const entryCountLabel = (count: number) => `결제 ${count}건`

/** 여정 후보 보조 줄(HF-48b): "진행 중 · 11.12 – 11.15" / "시작 전 · 12.27 – 12.29" */
export function candidateSubtitle(c: Pick<WalletTripCandidate, 'status' | 'startDate' | 'endDate'>) {
  const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`
  return `${c.status === 'ONGOING' ? '진행 중' : '시작 전'} · ${md(c.startDate)} – ${md(c.endDate)}`
}

/** 화면에서 만드는 멱등 키(시트를 열 때 하나) */
export const newClientRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
