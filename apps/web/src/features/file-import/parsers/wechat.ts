import { txnDigest } from './digest'
import { StatementFileError, type ExcludedCounts, type ParsedStatement, type SheetRows, type StatementItem, type StatementParser } from './types'

// 위챗페이 "개인 대사용(用于个人对账)" 거래 내역(xlsx · 예전 CSV).
// 위쪽 요약 블록(微信支付账单明细 · 起始时间 · 共 N 笔记录 · 收入/支出/中性交易 …) 줄 수는 버전마다 달라서 세지 않고,
// 첫 칸이 "交易时间"인 헤더 행을 찾아 그 아래만 읽는다. 열은 헤더 이름으로 찾는다(순서가 바뀌어도 된다).
//
// 가져오는 것: 收/支 = 支出 + 가맹점 결제 유형(商户消费 · 扫二维码付款 …) + 성공(支付成功 등) 또는 환불 상태.
//   - 전액 환불(已全额退款): 목록에 "환불됨"으로 보이고 고를 수 없다
//   - 부분 환불(已退款(￥x) · 部分退款): 순액(금액 − x). 환불액을 못 읽으면 원 금액 그대로 + "부분 환불" 표시
// 빼는 것: 微信红包 · 转账 · 群收款 등 사람 사이 거래(개수를 화면에 알린다), 충전 · 출금 · 중성(/) · 그 밖의 수입 · 실패 · 모르는 유형(조용히).
// 읽지 않는 열: 支付方式 · 商户单号 · 备注. 商品은 交易对方이 비었을 때 가맹점 이름 대신으로만 쓴다.
//
// 시각: 위챗 파일 시각은 중국 표준시(Asia/Shanghai, UTC+8, 서머타임 없음) 벽시계 값으로 보고 "+08:00"을 붙인다.
// 한국 시각(KST, UTC+9)으로는 1시간 뒤다(예: 12:30 → 13:30 KST). 화면·서버는 이 순간을 KST로 보여 준다.

export const WECHAT_OFFSET = '+08:00'

const HEADER_FIRST = '交易时间'
/** 헤더 이름 정규화: 공백 제거, 전각 괄호 → 반각 */
const normHeader = (s: string) => s.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/^﻿/, '')

/** 가맹점 결제 유형(交易类型) */
const MERCHANT_TYPES = ['商户消费', '扫二维码付款', '二维码付款', '付款码支付']
/** 사람 사이 거래 유형(개수를 알린다) */
const TRANSFER_TYPE = /红包|转账|群收款|赞赏|面对面|二维码收款|亲属卡/
/** 결제가 끝난 상태 */
const SUCCESS_STATUS = ['支付成功', '已支付', '交易成功', '已完成']
const FULL_REFUND_STATUS = /全额退款/
const PARTIAL_REFUND_STATUS = /已退款|部分退款/
/** "￥30.00" · "¥30" · "30.00元" 안의 금액 */
const MONEY_IN_TEXT = /[¥￥]\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*元/

type Columns = { time: number; type: number; party: number; product: number; direction: number; amount: number; status: number; txnNo: number }

function findHeader(rows: SheetRows): { index: number; columns: Columns } {
  const index = rows.findIndex((row) => normHeader(row[0] ?? '') === HEADER_FIRST)
  if (index < 0) throw new StatementFileError('format')
  const header = rows[index].map(normHeader)
  const col = (match: (h: string) => boolean) => header.findIndex(match)
  const columns: Columns = {
    time: col((h) => h === '交易时间'),
    type: col((h) => h === '交易类型'),
    party: col((h) => h === '交易对方'),
    product: col((h) => h === '商品'),
    direction: col((h) => h === '收/支'),
    amount: col((h) => h.startsWith('金额')),
    status: col((h) => h === '当前状态'),
    txnNo: col((h) => h === '交易单号'),
  }
  const required: (keyof Columns)[] = ['time', 'type', 'party', 'direction', 'amount', 'status', 'txnNo']
  if (required.some((key) => columns[key] < 0)) throw new StatementFileError('format')
  return { index, columns }
}

/** 칸 하나에서 읽는 최대 글자 수. 더 긴 칸은 잘라 읽는다(정규식·메모리 방어 — 정상 칸은 수십 자) */
export const MAX_CELL_CHARS = 1_000

/** 칸 값: 1,000자까지, 앞뒤 공백·탭(위챗 CSV는 숫자를 글자로 두려고 끝에 탭을 붙인다)·BOM 제거, "/"는 빈 값 */
const cell = (row: readonly string[], index: number) => {
  const value = (row[index] ?? '').slice(0, MAX_CELL_CHARS).replace(/\uFEFF/g, '').trim()
  return value === '/' ? '' : value
}

/** 금액 → "123.45"(소수 2자리 고정). 기호·쉼표·공백을 지운다. 못 읽으면 null */
export function normalizeAmount(raw: string): string | null {
  const text = raw.replace(/[¥￥,\s元]/g, '')
  if (/^\d{1,12}(\.\d{1,2})?$/.test(text)) {
    const [int, frac = ''] = text.split('.')
    return `${String(Number(int))}.${frac.padEnd(2, '0')}`
  }
  // xlsx 숫자 칸의 부동소수(128.30000000000001)
  if (/^\d{1,12}\.\d+$/.test(text)) {
    const n = Number(text)
    return Number.isFinite(n) ? n.toFixed(2) : null
  }
  return null
}

/** 소수 2자리 decimal 문자열 → 1/100 단위 정수 */
const cents = (amount: string) => {
  const [int, frac = ''] = amount.split('.')
  return Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2))
}
const fromCents = (n: number) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/**
 * 시각 칸 → "YYYY-MM-DDTHH:mm:ss+08:00". 글자("2026-09-06 12:30:15" · "2026/9/6 12:30" · 초 없음) 또는
 * xlsx 날짜 일련번호(1900 체계, 1899-12-30 = 0)를 받는다. 못 읽으면 null
 */
export function normalizeWechatTime(raw: string): string | null {
  const text = raw.trim()
  const m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  let parts: [number, number, number, number, number, number]
  if (m) {
    parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? '0')]
  } else if (/^\d{5}(\.\d+)?$/.test(text)) {
    // 일련번호 → 벽시계(UTC 메서드로 읽어 시간대가 끼어들지 않게)
    const ms = Math.round((Number(text) - 25569) * 86_400) * 1000
    const d = new Date(ms)
    parts = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
  } else return null
  const [y, mo, d, h, mi, s] = parts
  // 날짜가 실제로 있는지(2월 30일 등) 확인
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}${WECHAT_OFFSET}`
}

const graphemes = new Intl.Segmenter('zh', { granularity: 'grapheme' })

/** 가맹점 이름: 제어문자·연속 공백 정리, 40자(보이는 글자 기준)까지 */
export function cleanMerchant(raw: string, max = 40): string {
  // 보이지 않는 서식 문자(양방향 제어·폭 없는 공백 등 \p{Cf})는 지운다. ZWJ(U+200D)는 이모지 묶음용이라 남긴다(서버 cleanMemo와 같다)
  const text = raw
    .replace(/(?!\u200d)\p{Cf}/gu, '')
    .replace(/[\p{Cc}\u2028\u2029]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = Array.from(graphemes.segment(text), (s) => s.segment)
  return chars.length > max ? chars.slice(0, max).join('').trim() : text
}

type Classified =
  | { kind: 'include'; item: Omit<StatementItem, 'txnDigest'>; txnNo: string }
  | { kind: 'transfer' }
  | { kind: 'other' }

function classify(row: readonly string[], c: Columns): Classified {
  const type = cell(row, c.type)
  const direction = cell(row, c.direction)
  const status = cell(row, c.status)
  if (TRANSFER_TYPE.test(type)) return { kind: 'transfer' }
  if (direction !== '支出' || !MERCHANT_TYPES.some((t) => type.startsWith(t))) return { kind: 'other' }

  const occurredAt = normalizeWechatTime(cell(row, c.time))
  const amount = normalizeAmount(cell(row, c.amount))
  const txnNo = cell(row, c.txnNo).replace(/\s+/g, '')
  if (!occurredAt || !amount || cents(amount) <= 0 || !txnNo) return { kind: 'other' }

  const merchantName = cleanMerchant(cell(row, c.party) || (c.product >= 0 ? cell(row, c.product) : '') || '위챗페이 결제')
  const base = { occurredAt, originalAmount: amount, currency: 'CNY', merchantName }

  if (FULL_REFUND_STATUS.test(status)) {
    return { kind: 'include', txnNo, item: { ...base, amount, refund: 'FULL', refundAmount: null } }
  }
  if (PARTIAL_REFUND_STATUS.test(status)) {
    const money = status.match(MONEY_IN_TEXT)
    const refund = money ? normalizeAmount(money[1] ?? money[2] ?? '') : null
    if (refund === null) return { kind: 'include', txnNo, item: { ...base, amount, refund: 'PARTIAL', refundAmount: null } }
    const net = cents(amount) - cents(refund)
    if (net <= 0) return { kind: 'include', txnNo, item: { ...base, amount, refund: 'FULL', refundAmount: null } }
    return { kind: 'include', txnNo, item: { ...base, amount: fromCents(net), refund: 'PARTIAL', refundAmount: refund } }
  }
  if (!SUCCESS_STATUS.includes(status)) return { kind: 'other' }
  return { kind: 'include', txnNo, item: { ...base, amount, refund: 'NONE', refundAmount: null } }
}

/** 위챗 표 → 가져올 후보(최신순) + 뺀 개수. 같은 거래 번호가 두 번 있으면 처음 것만 */
export async function parseWechatRows(rows: SheetRows): Promise<ParsedStatement> {
  const { index, columns } = findHeader(rows)
  const excluded: ExcludedCounts = { transfer: 0, other: 0 }
  const items: StatementItem[] = []
  const seen = new Set<string>()
  for (const row of rows.slice(index + 1)) {
    if (row.every((v) => v.trim() === '')) continue
    // 표 아래 꼬리말(설명 줄)처럼 시각이 없는 줄은 세지 않는다
    if (!cell(row, columns.time)) continue
    const result = classify(row, columns)
    if (result.kind !== 'include') {
      excluded[result.kind] += 1
      continue
    }
    // 거래 번호 원문은 여기서 다이제스트로 바꾸고 버린다
    const digest = await txnDigest('WECHAT', result.txnNo)
    if (seen.has(digest)) continue
    seen.add(digest)
    items.push({ txnDigest: digest, ...result.item })
  }
  items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  return { provider: 'WECHAT', items, excluded }
}

export const wechatParser: StatementParser = { provider: 'WECHAT', parseRows: parseWechatRows }
