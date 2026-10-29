import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseAlipayRows } from './alipay'
import { decodeText, parseCsv } from './csv'
import { txnDigest } from './digest'
import { parseStatementFile } from './index'
import { MAX_FILE_BYTES, StatementFileError, type ParsedStatement, type SheetRows, type StatementItem } from './types'

// 알리페이 거래 내역 파서(W11). fixture는 모두 합성 데이터(실제 개인정보 없음):
// fixtures/alipay-gbk.csv — GBK, 안내문 23줄 + 구분선, 값 끝 탭, 줄 끝 쉼표, 따옴표 안 쉼표, 환불 별도 행(같은 번호 · "_" · "*"), 아래 구분선.

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(process.cwd(), 'src/features/file-import/parsers/fixtures', name)))

const HEADER = ['交易时间', '交易分类', '交易对方', '对方账号', '商品说明', '收/支', '金额', '收/付款方式', '交易状态', '交易订单号', '商家订单号', '备注']
/** 버리는 열(정규화 단계가 접근하지 않아야 하는 칸) */
const DROPPED = ['对方账号', '收/付款方式', '商家订单号', '备注'] as const
const PREAMBLE = ['导出信息：', '姓名：示例用户', '起始时间：[2026-09-01 00:00:00]    终止时间：[2026-09-30 23:59:59]', '共3笔记录', '特别提示：', '1.示例；']

type Field = (typeof HEADER)[number]
const row = (over: Partial<Record<Field, string>> = {}) => {
  const base: Record<string, string> = {
    交易时间: '2026-09-06 12:30:15',
    交易分类: '餐饮美食',
    交易对方: '示例-面馆',
    对方账号: 'noodle***@example.com',
    商品说明: '牛肉面',
    '收/支': '支出',
    金额: '28.00',
    '收/付款方式': '招商银行储蓄卡(0000)',
    交易状态: '交易成功',
    交易订单号: 'ALI-0001\t',
    商家订单号: 'MERCHANT-ORDER-1\t',
    备注: 'SECRET-NOTE',
    ...over,
  }
  return HEADER.map((h) => base[h])
}

const quote = (c: string) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
/** 알리페이 CSV처럼 줄 끝에 쉼표를 붙인다 */
const toCsv = (rows: string[][], eol = '\r\n') => rows.map((r) => `${r.map(quote).join(',')},`).join(eol)
const fileOf = (preamble: string[], rows: string[][], eol = '\r\n') => toCsv([...preamble.map((l) => [l]), HEADER, ...rows], eol)
const utf8Bom = (text: string) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])
const parseBytes = (bytes: Uint8Array) => parseStatementFile('ALIPAY', new Blob([bytes as BlobPart]))
const parseText = (text: string) => parseBytes(utf8Bom(text))
const byMerchant = (items: StatementItem[], name: string) => items.find((i) => i.merchantName === name)

describe('fixture 파일(GBK)', () => {
  it('안내문을 건너뛰고 헤더를 찾아 가맹점 결제만 · 환불 짝짓기 · 송금·이체 개수 · 중성 거래는 조용히', async () => {
    const result = await parseBytes(fixture('alipay-gbk.csv'))
    expect(result.provider).toBe('ALIPAY')
    expect(result.items.map((i) => i.merchantName)).toEqual(['全家便利店', '示例酒店', '滴滴出行', '示例-面馆'])
    // 송금(张*三) · 받은 红包(李*四)
    expect(result.excluded.transfer).toBe(2)
    // 余额宝 · 花呗 상환 · 话费充值 · 等待付款 · 결제 전 닫힘 · 짝 없는 환불
    expect(result.excluded.other).toBe(6)

    expect(byMerchant(result.items, '示例-面馆')).toEqual({
      txnDigest: await txnDigest('ALIPAY', '2026090622001400000000000001'),
      occurredAt: '2026-09-06T12:30:15+08:00',
      amount: '28.00',
      originalAmount: '28.00',
      currency: 'CNY',
      merchantName: '示例-面馆',
      refund: 'NONE',
      refundAmount: null,
    })
    // 부분 환불("{원 번호}_R001") → 순액
    expect(byMerchant(result.items, '滴滴出行')).toMatchObject({ amount: '35.50', originalAmount: '45.50', refund: 'PARTIAL', refundAmount: '10.00' })
    // 交易关闭 + 같은 번호 환불 → 전액 환불
    expect(byMerchant(result.items, '示例酒店')).toMatchObject({ amount: '500.00', refund: 'FULL', refundAmount: null })
    // 交易成功 + "*" 환불 전액 → 전액 환불
    expect(byMerchant(result.items, '全家便利店')).toMatchObject({ refund: 'FULL' })
  })

  it('UTF-8 BOM으로 같은 내용을 받아도 결과가 같다', async () => {
    const gbk = fixture('alipay-gbk.csv')
    const text = decodeText(gbk)
    expect(text).toContain('支付宝')
    expect(await parseText(text)).toEqual(await parseBytes(gbk))
  })
})

describe('버리는 열(对方账号 · 收/付款方式 · 商家订单号 · 备注)', () => {
  /** 칸을 읽을 때마다 위치를 적는 행(헤더 아래 데이터 행에만 씌운다) */
  function tracked(rows: SheetRows, headerIndex: number) {
    const touched = new Set<number>()
    const wrapped = rows.map((r, i) =>
      i <= headerIndex
        ? r
        : new Proxy(r, {
            get(target, key, receiver) {
              if (typeof key === 'string' && /^\d+$/.test(key)) touched.add(Number(key))
              return Reflect.get(target, key, receiver) as unknown
            },
          }),
    )
    return { wrapped, touched }
  }

  it('정규화 단계는 버리는 열의 칸에 한 번도 접근하지 않는다(행 배열을 통째로 훑거나 보관하지 않는다)', async () => {
    const rows = parseCsv(decodeText(fixture('alipay-gbk.csv')), 1000)
    const headerIndex = rows.findIndex((r) => r[0] === '交易时间')
    const { wrapped, touched } = tracked(rows, headerIndex)
    const result = await parseAlipayRows(wrapped)
    expect(result.items).toHaveLength(4)
    const header = rows[headerIndex]
    for (const name of DROPPED) expect(touched.has(header.indexOf(name))).toBe(false)
    expect(touched.size).toBeGreaterThan(0)
  })

  it('결과 객체에는 버리는 열 값·거래 번호 원문이 없고, 항목 필드는 정해진 것뿐이다', async () => {
    const result = await parseBytes(fixture('alipay-gbk.csv'))
    const text = JSON.stringify(result)
    for (const secret of ['example.com', '***', '招商银行', '花呗', 'M2026', 'SECRET-NOTE', '生日快乐', '2026090622001400000000000001', '牛肉面']) {
      expect(text).not.toContain(secret)
    }
    expect(Object.keys(result).sort()).toEqual(['excluded', 'items', 'provider'])
    for (const item of result.items) {
      expect(Object.keys(item).sort()).toEqual(['amount', 'currency', 'merchantName', 'occurredAt', 'originalAmount', 'refund', 'refundAmount', 'txnDigest'])
    }
  })
})

describe('CSV 견고성', () => {
  it('따옴표 안 쉼표·줄바꿈·"" · CRLF/LF 섞임 · 줄 끝 쉼표 · 값 끝 탭', async () => {
    const text = fileOf(PREAMBLE, [
      row({ 交易对方: '示例,"老王"\n饭店', 交易订单号: 'Q-1\t' }),
      row({ 交易对方: '示例书店', 金额: '\t¥1,234.5\t', 交易订单号: '\tQ-2\t', 交易时间: '\t2026-09-07 08:00:00\t' }),
    ]).replace(/\r\n示例书店/, '\n示例书店')
    const result = await parseText(text)
    expect(result.items.map((i) => i.merchantName)).toEqual(['示例书店', '示例,"老王" 饭店'])
    expect(result.items[0]).toMatchObject({ amount: '1234.50', occurredAt: '2026-09-07T08:00:00+08:00' })
    expect(result.items[1].txnDigest).toBe(await txnDigest('ALIPAY', 'Q-1'))
  })

  it('안내문 줄 수가 달라도(0줄 · 5줄 · 60줄) 헤더 행을 찾는다', async () => {
    for (const preamble of [[], PREAMBLE.slice(0, 5), Array.from({ length: 60 }, (_, i) => `${i + 1}.示例说明，含逗号`)]) {
      const result = await parseText(fileOf(preamble, [row()]))
      expect(result.items).toHaveLength(1)
    }
  })

  it('헤더 칸에 탭·공백이 붙고 열 순서가 바뀌어도 이름으로 찾는다', async () => {
    const order = [...HEADER].reverse()
    const values = row()
    const reordered = [values].map((r) => order.map((h) => r[HEADER.indexOf(h)]))
    const text = toCsv([...PREAMBLE.map((l) => [l]), order.map((h) => `${h}\t `), ...reordered])
    const result = await parseText(text)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].merchantName).toBe('示例-面馆')
  })

  it('아래쪽 합계·안내·구분선 줄은 거래로 세지 않는다', async () => {
    const text = `${fileOf(PREAMBLE, [row()])}\r\n------------------------------------\r\n共1笔记录,,,\r\n导出时间：2026-10-01`
    const result = await parseText(text)
    expect(result.items).toHaveLength(1)
    expect(result.excluded).toEqual({ transfer: 0, other: 0 })
  })

  it('닫히지 않은 따옴표가 있어도 멈추지 않고 그 앞 행은 읽는다', async () => {
    const text = `${fileOf(PREAMBLE, [row()])}\r\n2026-09-07 08:00:00,餐饮美食,"示例店,,,,,,,,,`
    const result = await parseText(text)
    expect(result.items.map((i) => i.merchantName)).toContain('示例-面馆')
  })
})

describe('알리페이 규칙', () => {
  const parse = (rows: string[][]) => parseText(fileOf(PREAMBLE, rows))

  it('支出 + 가맹점 분류 + 성공만. 송금·红包 → transfer, 투자·상환·충전·提现·수입·실패·대기 → other', async () => {
    const result = await parse([
      row({ 交易对方: 'A', 交易订单号: '1' }),
      row({ 交易分类: '其他', 交易对方: 'B', 交易订单号: '2', 交易状态: '支付成功' }),
      // 소상인 收钱码 결제·가맹점 할인 문구는 가맹점 결제다
      row({ 交易分类: '日用百货', 交易对方: '*明', 商品说明: '收钱码收款', 交易订单号: '3' }),
      row({ 交易对方: 'C', 商品说明: '午餐 红包抵扣2元', 交易订单号: '4' }),
      // transfer
      row({ 交易分类: '转账红包', 交易对方: '张*三', 交易订单号: '5' }),
      row({ 交易分类: '转账红包', 交易对方: '李*四', '收/支': '收入', 交易订单号: '6' }),
      row({ 交易分类: '其他', 交易对方: '王*五', 商品说明: '转账', 交易订单号: '7' }),
      row({ 交易分类: '亲友代付', 交易对方: '赵*六', 交易订单号: '8' }),
      // other
      row({ 交易分类: '投资理财', 交易对方: '余额宝', '收/支': '不计收支', 交易订单号: '9' }),
      row({ 交易分类: '信用借还', 交易对方: '花呗', 交易订单号: '10', 交易状态: '还款成功' }),
      row({ 交易分类: '其他', 交易对方: '示例银行信用卡', 商品说明: '信用卡还款', 交易订单号: '11' }),
      row({ 交易分类: '充值缴费', 交易对方: '中国移动', 交易订单号: '12' }),
      row({ 交易分类: '账户存取', 交易对方: '示例银行', 商品说明: '余额提现', 交易订单号: '13' }),
      row({ 交易分类: '其他', 交易对方: '蚂蚁财富', 交易订单号: '14' }),
      row({ 交易对方: 'D', '收/支': '收入', 交易订单号: '15' }),
      row({ 交易对方: 'E', 交易状态: '等待付款', 交易订单号: '16' }),
      row({ 交易对方: 'F', 交易状态: '交易失败', 交易订单号: '17' }),
      row({ 交易对方: 'G', 金额: '0.00', 交易订单号: '18' }),
      row({ 交易对方: 'H', 交易时间: '2026-02-30 10:00:00', 交易订单号: '19' }),
    ])
    expect(result.items.map((i) => i.merchantName).sort()).toEqual(['*明', 'A', 'B', 'C'])
    expect(result.excluded).toEqual({ transfer: 4, other: 11 })
  })

  it('환불: 같은 번호 · "{번호}_…" · "{번호}*…"로 짝짓고 여러 건이면 합친다. 합계 ≥ 원 금액이면 전액', async () => {
    const result = await parse([
      row({ 交易对方: 'P', 金额: '100.00', 交易订单号: 'P1' }),
      row({ 交易分类: '退款', 交易对方: 'P', 商品说明: '退款-商品', '收/支': '不计收支', 金额: '20.00', 交易状态: '退款成功', 交易订单号: 'P1_a' }),
      row({ 交易分类: '退款', 交易对方: 'P', '收/支': '不计收支', 金额: '30.00', 交易状态: '退款成功', 交易订单号: 'P1*b' }),
      row({ 交易对方: 'Q', 金额: '50.00', 交易订单号: 'Q1' }),
      row({ 交易分类: '其他', 交易对方: 'Q', 商品说明: '退款-商品', '收/支': '收入', 金额: '60.00', 交易状态: '退款成功', 交易订单号: 'Q1' }),
      // 원 결제 행 상태가 退款…인데 별도 환불 행이 없으면 전액 환불로
      row({ 交易对方: 'R', 金额: '10.00', 交易状态: '退款成功', 交易订单号: 'R1' }),
      // 원 결제 행 상태가 退款…이고 부분 환불 행이 있으면 순액
      row({ 交易对方: 'S', 金额: '10.00', 交易状态: '退款成功', 交易订单号: 'S1' }),
      row({ 交易分类: '退款', 交易对方: 'S', '收/支': '不计收支', 金额: '4.00', 交易状态: '退款成功', 交易订单号: 'S1_x' }),
      // 결제 전에 닫힌 주문(환불 없음) → 뺀다
      row({ 交易对方: 'T', 交易状态: '交易关闭', 交易订单号: 'T1' }),
      // 원 결제가 파일에 없는 환불 → 뺀다
      row({ 交易分类: '退款', 交易对方: 'U', '收/支': '不计收支', 金额: '5.00', 交易状态: '退款成功', 交易订单号: 'NOPE_1' }),
    ])
    const of = (name: string) => byMerchant(result.items, name)
    expect(of('P')).toMatchObject({ amount: '50.00', originalAmount: '100.00', refund: 'PARTIAL', refundAmount: '50.00' })
    expect(of('Q')).toMatchObject({ amount: '50.00', refund: 'FULL', refundAmount: null })
    expect(of('R')).toMatchObject({ refund: 'FULL' })
    expect(of('S')).toMatchObject({ amount: '6.00', refund: 'PARTIAL', refundAmount: '4.00' })
    expect(of('T')).toBeUndefined()
    expect(result.items).toHaveLength(4)
    expect(result.excluded).toEqual({ transfer: 0, other: 2 })
  })

  it('같은 거래 번호의 결제는 한 번만, 최신순, 交易对方이 비면 商品说明, 둘 다 비면 "알리페이 결제"', async () => {
    const result = await parse([
      row({ 交易时间: '2026-09-01 09:00:00', 交易对方: '', 商品说明: '示例商品', 交易订单号: 'X1' }),
      row({ 交易时间: '2026-09-03 09:00:00', 交易对方: '/', 商品说明: '', 交易订单号: 'X2' }),
      row({ 交易时间: '2026-09-02 09:00:00', 交易对方: '重复', 交易订单号: 'X1' }),
    ])
    expect(result.items.map((i) => i.merchantName)).toEqual(['알리페이 결제', '示例商品'])
  })

  it('시각: 중국 표준시 +08:00(23:30 결제는 KST 다음 날 00:30) · 초 없음 · "/" 구분', async () => {
    const result = await parse([
      row({ 交易时间: '2026-09-06 23:30:00', 交易对方: 'late', 交易订单号: 'T-1' }),
      row({ 交易时间: '2026/9/7 8:05', 交易对方: 'short', 交易订单号: 'T-2' }),
    ])
    const late = byMerchant(result.items, 'late') as StatementItem
    expect(late.occurredAt).toBe('2026-09-06T23:30:00+08:00')
    expect(new Date(late.occurredAt).toISOString()).toBe('2026-09-06T15:30:00.000Z')
    expect(byMerchant(result.items, 'short')?.occurredAt).toBe('2026-09-07T08:05:00+08:00')
  })

  it('가맹점 이름: 양방향 제어·폭 없는 공백을 지우고 40자', async () => {
    const result = await parse([row({ 交易对方: `示例‮店​${'长'.repeat(60)}` })])
    expect(result.items[0].merchantName).toBe(`示例店${'长'.repeat(37)}`)
  })

  it('交易分类·商品说明 열이 없는 형식도 상대·상태 규칙으로 읽는다', async () => {
    const header = ['交易时间', '交易对方', '收/支', '金额（元）', '交易状态', '交易号']
    const text = toCsv([header, ['2026-09-06 12:30:15', '示例-面馆', '支出', '28.00', '交易成功', 'OLD-1'], ['2026-09-06 13:00:00', '余额宝', '支出', '28.00', '交易成功', 'OLD-2']])
    const result = await parseText(text)
    expect(result.items.map((i) => i.merchantName)).toEqual(['示例-面馆'])
  })
})

describe('잘못된 파일', () => {
  const expectKind = async (promise: Promise<ParsedStatement>, kind: string) => {
    const error = await promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StatementFileError)
    expect((error as StatementFileError).kind).toBe(kind)
  }

  it('위챗 파일 · 다른 CSV · 필요한 열이 없는 헤더 → format', async () => {
    const wechat = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/features/file-import/parsers/fixtures', 'wechat-gbk.csv')))
    await expectKind(parseBytes(wechat), 'format')
    await expectKind(parseText('date,amount\n2026-09-01,10\n'), 'format')
    await expectKind(parseText('交易时间,收/支,金额\n2026-09-01 10:00:00,支出,10\n'), 'format')
  })

  it('알리페이 파일을 위챗 화면에 올리면 format', async () => {
    await expectKind(parseStatementFile('WECHAT', new Blob([fixture('alipay-gbk.csv') as BlobPart])), 'format')
  })

  it('이메일로 온 압축(zip, 암호 포함) → archive', async () => {
    await expectKind(parseBytes(zipSync({ '支付宝交易明细(20260901-20260930).csv': strToU8('x') })), 'archive')
  })

  it('5MB 넘으면 tooLarge', async () => {
    await expectKind(parseStatementFile('ALIPAY', new Blob([new Uint8Array(MAX_FILE_BYTES + 1) as BlobPart])), 'tooLarge')
  })
})
