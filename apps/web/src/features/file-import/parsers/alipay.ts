import { cell, cents, cleanMerchant, fromCents, normalizeAmount, normalizeChinaTime, normHeader } from './common'
import { txnDigest } from './digest'
import { StatementFileError, type ExcludedCounts, type ParsedStatement, type SheetRows, type StatementItem, type StatementParser } from './types'

// 알리페이 "개인 대조용(用于个人对账)" 거래 내역(W11). 我的 → 账单 → ⋯ → 开具交易流水证明 → 用于个人对账 → 이메일 zip(암호) → CSV.
// 인코딩은 대개 GBK(UTF-8 BOM도 읽는다 — csv.decodeText). 위쪽 안내문(약 24줄) 줄 수는 세지 않고 交易时间 · 收/支가 있는 헤더 행을 찾는다.
// 헤더: 交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注 (값 끝에 탭이 붙을 수 있다 — cell이 지운다).
// 아래쪽 합계·안내 줄은 시각 칸이 날짜가 아니라 건너뛴다.
//
// **버리는 열**: 对方账号(상대 계정) · 收/付款方式 · 商家订单号 · 备注. CSV를 쪼개는 단계에서는 모든 칸이 파서 지역 변수(행 배열)에 잠시 올라가지만,
// 정규화(pick) 단계에서는 이 열의 위치도 찾지 않고 칸에 접근하지 않으며 저장·전송·보관하지 않는다(행 배열은 파싱이 끝나면 버린다).
// 交易对方은 가맹점 결제로 남는 행에서만 가맹점 이름이 된다(비었으면 商品说明). 거래 번호(交易订单号)는 다이제스트로 바꾸고 버린다.
//
// 가져오는 것: 收/支 = 支出 + 가맹점 결제(아래 제외 목록에 걸리지 않는 분류) + 성공 상태.
// 환불(위챗과 같은 화면 규칙): 알리페이는 환불을 **별도 행**(收/支 = 不计收支·收入, 交易状态 退款成功 · 交易分类 退款 · 商品说明 "退款-…")으로 낸다.
//   환불 행의 交易订单号가 원 결제의 交易订单号와 같거나, "{원 번호}_{환불 번호}"(또는 "*") 꼴이면 그 결제에 짝짓는다.
//   환불 합계 ≥ 원 금액 → 전액 환불("환불됨", 고를 수 없음) / 그보다 작으면 순액 + "부분 환불 −CN¥x".
//   원 결제가 交易关闭인데 짝지은 환불이 있으면 전액 환불로, 없으면(결제 전에 닫힌 주문) 뺀다.
//   원 결제 행 자체의 상태가 退款…이면(별도 환불 행이 없어도) 전액 환불로 본다(짝지은 환불이 원 금액보다 작으면 부분 환불).
//   짝을 못 찾은 환불 행(원 결제가 기간 밖)은 조용히 뺀다.
// 빼는 것: 사람 사이 송금·이체·红包(개수를 화면에 알린다 — "송금·이체 N건은 제외했어요"),
//   충전·투자(余额宝·理财)·신용 상환(花呗·信用卡 还款, 信用借还)·提现·수입·중성·실패·대기(조용히).
// 분류 목록은 공개 자료로 추정한 값이다 — 실파일로 맞출 때 아래 상수만 고친다.
//
// 시각: 알리페이 파일 시각도 중국 표준시(UTC+8) 벽시계 값으로 보고 "+08:00"을 붙인다(위챗과 같다, KST는 1시간 뒤).

/** 사람 사이 거래 분류(交易分类) — 개수를 알린다 */
export const ALIPAY_TRANSFER_CATEGORIES: readonly string[] = ['转账红包', '亲友代付']
/** 사람 사이 거래(商品说明 머리) — 분류가 다르게 붙어도 송금·홍바오로 센다. 머리만 본다("…红包抵扣" 같은 가맹점 할인 문구는 아니다) */
export const ALIPAY_TRANSFER_TEXT = /^(转账|红包|发红包|收红包|亲情卡|亲友代付)/
/** 가맹점 결제가 아닌 분류(交易分类) — 조용히 뺀다: 투자·신용 상환·충전·입출금·환불·수입 */
export const ALIPAY_NEUTRAL_CATEGORIES: readonly string[] = ['投资理财', '信用借还', '充值缴费', '账户存取', '退款', '收入', '理财', '还款']
/** 가맹점 결제가 아닌 상대(交易对方) — 余额宝·花呗·借呗·펀드 등 */
export const ALIPAY_NEUTRAL_PARTY = /余额宝|余利宝|花呗|借呗|蚂蚁财富|蚂蚁消费金融|网商银行|基金/
/** 가맹점 결제가 아닌 거래(商品说明) — 提现·충전·상환·이체 입출금·펀드 */
export const ALIPAY_NEUTRAL_TEXT = /提现|充值|还款|余额宝|余利宝|理财|基金|转入|转出/
/** 결제가 끝난 상태(交易状态) */
export const ALIPAY_SUCCESS_STATUS: readonly string[] = ['交易成功', '支付成功', '付款成功', '已支付', '交易完成', '已完成']
/** 닫힌 주문(환불로 닫혔거나 결제 전 취소) */
const CLOSED_STATUS = /交易关闭|已关闭/
const REFUND_STATUS = /退款/
/** 환불 행의 交易订单号 → 원 결제 번호(구분자 앞) */
const REFUND_SEPARATOR = /[_*]/

type Columns = { time: number; category: number; party: number; desc: number; direction: number; amount: number; status: number; txnNo: number }

/** 헤더 행: 交易时间과 收/支가 함께 있는 첫 행. 열은 이름으로 찾는다(순서가 바뀌어도 된다). 对方账号 등 버리는 열은 찾지도 않는다 */
function findHeader(rows: SheetRows): { index: number; columns: Columns } {
  const index = rows.findIndex((row) => {
    const names = row.slice(0, 50).map(normHeader)
    return names.includes('交易时间') && names.includes('收/支')
  })
  if (index < 0) throw new StatementFileError('format')
  const header = rows[index].slice(0, 200).map(normHeader)
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h))
  const columns: Columns = {
    time: col('交易时间'),
    category: col('交易分类'),
    party: col('交易对方'),
    desc: col('商品说明', '商品名称'),
    direction: col('收/支'),
    amount: header.findIndex((h) => h.startsWith('金额')),
    status: col('交易状态'),
    txnNo: col('交易订单号', '交易号'),
  }
  // 交易分类·商品说明은 없어도 읽는다(없으면 상대·상태 규칙만)
  const required: (keyof Columns)[] = ['time', 'party', 'direction', 'amount', 'status', 'txnNo']
  if (required.some((key) => columns[key] < 0)) throw new StatementFileError('format')
  return { index, columns }
}

/** 한 행에서 쓰는 칸만 골라 읽는다(그 밖의 칸 — 상대 계정·결제 수단·가맹점 주문 번호·비고 — 은 건드리지 않는다) */
type Picked = { time: string; category: string; party: string; desc: string; direction: string; amount: string; status: string; txnNo: string }

function pick(row: readonly string[], c: Columns): Picked {
  const opt = (index: number) => (index >= 0 ? cell(row, index) : '')
  return {
    time: cell(row, c.time),
    category: opt(c.category),
    party: cell(row, c.party),
    desc: opt(c.desc),
    direction: cell(row, c.direction),
    amount: cell(row, c.amount),
    status: cell(row, c.status),
    txnNo: cell(row, c.txnNo).replace(/\s+/g, ''),
  }
}

type Candidate = { txnNo: string; status: 'ok' | 'closed' | 'refunded'; occurredAt: string; amount: string; merchantName: string }
type Refund = { keys: string[]; cents: number }

type Classified = { kind: 'payment'; candidate: Candidate } | { kind: 'refund'; refund: Refund } | { kind: 'transfer' } | { kind: 'other' }

const isRefundRow = (p: Picked) => p.direction !== '支出' && (REFUND_STATUS.test(p.status) || p.category === '退款' || p.desc.startsWith('退款'))

function classify(p: Picked): Classified {
  if (isRefundRow(p)) {
    const amount = normalizeAmount(p.amount)
    if (!amount || !p.txnNo) return { kind: 'other' }
    const keys = [...new Set([p.txnNo, p.txnNo.split(REFUND_SEPARATOR)[0]])].filter((k) => k !== '')
    return { kind: 'refund', refund: { keys, cents: cents(amount) } }
  }
  if (ALIPAY_TRANSFER_CATEGORIES.includes(p.category) || ALIPAY_TRANSFER_TEXT.test(p.desc)) return { kind: 'transfer' }
  if (p.direction !== '支出') return { kind: 'other' }
  if (ALIPAY_NEUTRAL_CATEGORIES.includes(p.category) || ALIPAY_NEUTRAL_PARTY.test(p.party) || ALIPAY_NEUTRAL_TEXT.test(p.desc)) {
    return { kind: 'other' }
  }

  const occurredAt = normalizeChinaTime(p.time)
  const amount = normalizeAmount(p.amount)
  if (!occurredAt || !amount || cents(amount) <= 0 || !p.txnNo) return { kind: 'other' }
  const status = ALIPAY_SUCCESS_STATUS.includes(p.status)
    ? 'ok'
    : CLOSED_STATUS.test(p.status)
      ? 'closed'
      : REFUND_STATUS.test(p.status)
        ? 'refunded'
        : null
  if (status === null) return { kind: 'other' }
  const merchantName = cleanMerchant(p.party || p.desc || '알리페이 결제')
  return { kind: 'payment', candidate: { txnNo: p.txnNo, status, occurredAt, amount, merchantName } }
}

/** 원 결제 + 짝지은 환불 합계 → 화면 항목(거래 번호 제외). 뺄 것이면 null */
function settle(c: Candidate, refundCents: number): Omit<StatementItem, 'txnDigest'> | null {
  const base = { occurredAt: c.occurredAt, originalAmount: c.amount, currency: 'CNY', merchantName: c.merchantName }
  const full = { ...base, amount: c.amount, refund: 'FULL' as const, refundAmount: null }
  const total = cents(c.amount)
  if (c.status === 'closed') return refundCents > 0 ? full : null
  if (refundCents <= 0) return c.status === 'refunded' ? full : { ...base, amount: c.amount, refund: 'NONE', refundAmount: null }
  if (refundCents >= total) return full
  return { ...base, amount: fromCents(total - refundCents), refund: 'PARTIAL', refundAmount: fromCents(refundCents) }
}

/** 시각 칸이 날짜로 시작하지 않는 줄(아래 합계·안내·구분선)은 거래가 아니다 — 세지도 않는다 */
const looksLikeDate = (value: string) => /^\d{4}[-/.]\d{1,2}|^\d{5}(\.\d+)?$/.test(value)

/** 알리페이 표 → 가져올 후보(최신순) + 뺀 개수. 같은 거래 번호의 결제가 두 번 있으면 처음 것만 */
export async function parseAlipayRows(rows: SheetRows): Promise<ParsedStatement> {
  const { index, columns } = findHeader(rows)
  const excluded: ExcludedCounts = { transfer: 0, other: 0 }
  const payments: Candidate[] = []
  const refunds: Refund[] = []
  for (let r = index + 1; r < rows.length; r++) {
    const picked = pick(rows[r], columns)
    if (!looksLikeDate(picked.time)) continue
    const result = classify(picked)
    if (result.kind === 'payment') payments.push(result.candidate)
    else if (result.kind === 'refund') refunds.push(result.refund)
    else excluded[result.kind] += 1
  }

  // 환불 짝짓기: 환불 행의 번호(그대로 · 구분자 앞)가 원 결제 번호와 같으면 그 결제에 더한다. 한 환불은 한 번만 쓴다
  const byKey = new Map<string, number[]>()
  refunds.forEach((refund, i) => {
    for (const key of refund.keys) byKey.set(key, [...(byKey.get(key) ?? []), i])
  })
  const used = new Set<number>()
  const seen = new Set<string>()
  const items: StatementItem[] = []
  for (const payment of payments) {
    if (seen.has(payment.txnNo)) continue
    seen.add(payment.txnNo)
    let refundCents = 0
    for (const i of byKey.get(payment.txnNo) ?? []) {
      if (used.has(i)) continue
      used.add(i)
      refundCents += refunds[i].cents
    }
    const item = settle(payment, refundCents)
    if (!item) {
      excluded.other += 1
      continue
    }
    // 거래 번호 원문은 여기서 다이제스트로 바꾸고 버린다
    items.push({ txnDigest: await txnDigest('ALIPAY', payment.txnNo), ...item })
  }
  excluded.other += refunds.length - used.size
  items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  return { provider: 'ALIPAY', items, excluded }
}

export const alipayParser: StatementParser = { provider: 'ALIPAY', parseRows: parseAlipayRows }
