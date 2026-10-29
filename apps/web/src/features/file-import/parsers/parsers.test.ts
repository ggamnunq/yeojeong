import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { MAX_ROW_CELLS, parseCsv, decodeText } from './csv'
import { txnDigest } from './digest'
import { parseStatementFile, readSheet } from './index'
import { MAX_FILE_BYTES, StatementFileError, type StatementItem } from './types'
import { MAX_COMPRESSED_ENTRY_BYTES, MAX_ENTRY_BYTES } from './xlsx'
import { cleanMerchant, normalizeAmount, normalizeWechatTime, parseWechatRows } from './wechat'

// 위챗 거래 내역 파서. fixture는 모두 합성 데이터(실제 개인정보 없음):
// fixtures/wechat-gbk.csv(GBK, 요약 16줄, 따옴표·쉼표 상품명, 거래 번호 끝 탭) · fixtures/wechat.xlsx(openpyxl, inlineStr)

// jsdom 환경의 import.meta.url은 파일 경로가 아니라서 apps/web 기준 경로로 읽는다
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(process.cwd(), 'src/features/file-import/parsers/fixtures', name)))

const HEADER = ['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)', '支付方式', '当前状态', '交易单号', '商户单号', '备注']
const SUMMARY = [['微信支付账单明细'], ['起始时间：[2026-09-01 00:00:00] 终止时间：[2026-09-30 23:59:59]'], ['共3笔记录'], ['----------------------微信支付账单明细列表--------------------']]

const row = (over: Partial<Record<(typeof HEADER)[number], string>> = {}) => {
  const base: Record<string, string> = {
    交易时间: '2026-09-06 12:30:15',
    交易类型: '商户消费',
    交易对方: '示例-面馆',
    商品: '牛肉面',
    '收/支': '支出',
    '金额(元)': '¥28.00',
    支付方式: '零钱',
    当前状态: '支付成功',
    交易单号: '42000000001',
    商户单号: 'M-1',
    备注: '/',
    ...over,
  }
  return HEADER.map((h) => base[h])
}

const toCsv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n')

/** 최소 xlsx(sharedStrings 사용). cells: 행 × 칸, 숫자는 number로 넣으면 <v> 숫자 칸 */
function makeXlsx(rows: (string | number)[][], options: { workbookSheet?: string } = {}) {
  const strings: string[] = []
  const sharedIndex = (s: string) => {
    const i = strings.indexOf(s)
    if (i >= 0) return i
    strings.push(s)
    return strings.length - 1
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const col = (i: number) => String.fromCharCode(65 + i)
  const sheetRows = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">${r
          .map((v, ci) =>
            typeof v === 'number' ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${sharedIndex(v)}</v></c>`,
          )
          .join('')}</row>`,
    )
    .join('')
  const sheetPath = options.workbookSheet ?? 'sheet1.xml'
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0"?><workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/${sheetPath}"/></Relationships>`,
    ),
    [`xl/worksheets/${sheetPath}`]: strToU8(`<?xml version="1.0"?><worksheet ${ns}><sheetData>${sheetRows}</sheetData></worksheet>`),
    'xl/sharedStrings.xml': strToU8(
      `<?xml version="1.0"?><sst ${ns}>${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`,
    ),
  })
}

const parseBytes = (bytes: Uint8Array) => parseStatementFile('WECHAT', new Blob([bytes as BlobPart]))
const byMerchant = (items: StatementItem[], name: string) => items.find((i) => i.merchantName === name)

async function expectKind(promise: Promise<unknown>, kind: StatementFileError['kind']) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(StatementFileError)
  expect((error as StatementFileError).kind).toBe(kind)
}

describe('fixture 파일', () => {
  it('GBK CSV: 요약 블록을 건너뛰고 가맹점 결제만, 환불·홍바오·이체·충전을 규칙대로', async () => {
    const result = await parseBytes(fixture('wechat-gbk.csv'))
    expect(result.items.map((i) => i.merchantName)).toEqual(['示例-水果摊', '示例-老王家常菜', '示例-火锅店', '示例-出行平台'])
    // 홍바오(수입) · 이체 → transfer, 충전(중성) → other
    expect(result.excluded).toEqual({ transfer: 2, other: 1 })
    const noodle = byMerchant(result.items, '示例-老王家常菜')
    expect(noodle).toMatchObject({ occurredAt: '2026-09-06T12:30:15+08:00', amount: '128.00', currency: 'CNY', refund: 'NONE' })
    // 부분 환불은 순액, 전액 환불은 표시만
    expect(byMerchant(result.items, '示例-火锅店')).toMatchObject({ amount: '256.00', originalAmount: '286.00', refund: 'PARTIAL', refundAmount: '30.00' })
    expect(byMerchant(result.items, '示例-出行平台')).toMatchObject({ refund: 'FULL' })
    // 거래 번호 원문은 남지 않는다(끝의 탭도 지우고 다이제스트)
    expect(noodle?.txnDigest).toBe(await txnDigest('WECHAT', '10001202609061230150001'))
    expect(JSON.stringify(result)).not.toContain('10001202609061230150001')
    // 支付方式 · 商户单号 · 备注 · 商品은 결과에 없다
    expect(JSON.stringify(result)).not.toMatch(/零钱|储蓄卡|880026090601|晚市套餐/)
  })

  it('xlsx(openpyxl, inlineStr): CSV와 같은 결과', async () => {
    const xlsx = await parseBytes(fixture('wechat.xlsx'))
    const csv = await parseBytes(fixture('wechat-gbk.csv'))
    expect(xlsx).toEqual(csv)
  })
})

describe('CSV', () => {
  it('UTF-8 BOM · UTF-8 · ¥/￥ · 따옴표 안 쉼표·줄바꿈·""', async () => {
    const text = toCsv([
      ...SUMMARY,
      HEADER,
      row({ 交易对方: '示例,"逗号"店\n二楼', '金额(元)': '￥1,280.50', 交易单号: '1' }),
      row({ 交易对方: '示例-茶', '金额(元)': '¥9', 交易单号: '2', 交易时间: '2026-09-05 08:00:00' }),
    ])
    for (const bytes of [new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]), new TextEncoder().encode(text)]) {
      const result = await parseBytes(bytes)
      expect(result.items.map((i) => [i.merchantName, i.amount])).toEqual([
        ['示例,"逗号"店 二楼', '1280.50'],
        ['示例-茶', '9.00'],
      ])
    }
  })

  it('요약 줄 수가 달라도(0줄 · 30줄) 헤더 행을 찾는다', async () => {
    for (const lead of [[], Array.from({ length: 30 }, (_, i) => [`说明 ${i}`])]) {
      const result = await parseBytes(new TextEncoder().encode(toCsv([...lead, HEADER, row()])))
      expect(result.items).toHaveLength(1)
    }
  })

  it('열 순서가 바뀌고 전각 괄호 헤더여도 이름으로 찾는다', async () => {
    const header = ['交易时间', '交易单号', '金额（元）', '收/支', '当前状态', '交易类型', '交易对方']
    const result = await parseBytes(new TextEncoder().encode(toCsv([header, ['2026-09-06 12:30', '77', '¥5.5', '支出', '支付成功', '商户消费', '示例-面包']])))
    expect(result.items[0]).toMatchObject({ merchantName: '示例-面包', amount: '5.50', occurredAt: '2026-09-06T12:30:00+08:00' })
  })

  it('decodeText: UTF-8이 아니면 GB18030', () => {
    const gbk = fixture('wechat-gbk.csv')
    expect(decodeText(gbk)).toContain('交易时间')
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(gbk)).toThrow()
  })

  it('parseCsv: 한 행이 칸 상한(200)을 넘으면(쉼표 수만 개 줄) format — 상한까지는 읽는다', async () => {
    expect(parseCsv(`${'a,'.repeat(MAX_ROW_CELLS - 1)}a`, 10)[0]).toHaveLength(MAX_ROW_CELLS)
    expect(() => parseCsv(','.repeat(MAX_ROW_CELLS), 10)).toThrow(StatementFileError)
    const bomb = `交易时间,交易类型\n${','.repeat(50_000)}\n`
    const error = await parseBytes(new TextEncoder().encode(bomb)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StatementFileError)
    expect((error as StatementFileError).kind).toBe('format')
  })

    it('parseCsv: 빈 줄을 뺀다', () => {
    expect(parseCsv('a,b\n\n"c\nd",e\r\n', 10)).toEqual([
      ['a', 'b'],
      ['c\nd', 'e'],
    ])
  })
})

describe('xlsx', () => {
  it('sharedStrings · 숫자 칸(금액 부동소수 · 날짜 일련번호)', async () => {
    // 2026-09-06 12:30:15 = 46271.521006944…
    const serial = (Date.UTC(2026, 8, 6, 12, 30, 15) / 86_400_000 + 25569).toFixed(10)
    const bytes = makeXlsx([...SUMMARY, HEADER, [serial as unknown as number, '商户消费', '示例-面馆', '面', '支出', 128.30000000000001, '零钱', '支付成功', '4200000000000001', '/', '/']].map((r) => r.map((v) => (v === serial ? Number(serial) : v))))
    const result = await parseBytes(bytes)
    expect(result.items[0]).toMatchObject({ occurredAt: '2026-09-06T12:30:15+08:00', amount: '128.30', merchantName: '示例-面馆' })
  })

  it('workbook rels가 가리키는 시트를 읽는다', async () => {
    const result = await parseBytes(makeXlsx([HEADER, row()], { workbookSheet: 'detail.xml' }))
    expect(result.items).toHaveLength(1)
  })

  it('압축 비율이 비정상(1MB 넘게 풀리고 100배 초과)이면 거절, 항목이 20MB 넘게 풀리면 tooLarge', async () => {
    // 같은 글자 2MB → 압축하면 수 KB(수백 배)
    const bomb = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8('<workbook/>'),
      'xl/worksheets/sheet1.xml': new Uint8Array(2 * 1024 * 1024).fill(0x20),
    })
    await expectKind(parseBytes(bomb), 'format')
    const huge = zipSync(
      {
        '[Content_Types].xml': strToU8('<Types/>'),
        'xl/workbook.xml': strToU8('<workbook/>'),
        'xl/worksheets/sheet1.xml': new Uint8Array(MAX_ENTRY_BYTES + 1),
      },
      { level: 0 },
    )
    await expectKind(parseBytes(huge), 'tooLarge')
  })

  it('압축본이 선언 크기보다 큰(조작된) 항목은 거절, 압축 크기가 2MB 넘는 항목은 풀지 않는다(CPU 상한)', async () => {
    const noise = (n: number) => {
      const out = new Uint8Array(n)
      for (let i = 0; i < n; i += 65_536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65_536)))
      return out
    }
    const files = () => ({
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8('<workbook/>'),
    })
    // 시트 항목의 중앙 디렉터리 "풀린 크기"를 10바이트로 속인다(압축본 4KB)
    const tampered = zipSync({ ...files(), 'xl/worksheets/sheet1.xml': noise(4096) }, { level: 0 })
    const view = new DataView(tampered.buffer)
    for (let i = 0; i + 46 < tampered.length; i++) {
      if (view.getUint32(i, true) !== 0x02014b50) continue
      const nameLen = view.getUint16(i + 28, true)
      const name = new TextDecoder().decode(tampered.subarray(i + 46, i + 46 + nameLen))
      if (name === 'xl/worksheets/sheet1.xml') view.setUint32(i + 24, 10, true)
    }
    await expectKind(parseBytes(tampered), 'format')
    // 압축해도 줄지 않는 2MB 넘는 시트(파일은 5MB 안)
    await expectKind(parseBytes(zipSync({ ...files(), 'xl/worksheets/sheet1.xml': noise(MAX_COMPRESSED_ENTRY_BYTES + 1024) }, { level: 0 })), 'tooLarge')
  })

  it('DOCTYPE·ENTITY가 있는 XML은 거절(엔티티 확장 방어)', async () => {
    const bytes = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8('<!DOCTYPE x [<!ENTITY a "aaaa">]><workbook/>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet/>'),
    })
    await expectKind(parseBytes(bytes), 'format')
  })
})

describe('잘못된 파일', () => {
  it('xlsx가 아닌 zip(위챗이 보내는 압축) → archive', async () => {
    await expectKind(parseBytes(zipSync({ '微信支付账单.xlsx': new Uint8Array([1, 2, 3]) })), 'archive')
  })

  it('암호 걸린 Excel·옛 xls(OLE) → archive', async () => {
    await expectKind(parseBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), 'archive')
  })

  it('다른 Office 문서(docx) · 다른 CSV · 이미지 · 빈 파일 → format', async () => {
    await expectKind(parseBytes(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<d/>') })), 'format')
    await expectKind(parseBytes(new TextEncoder().encode('date,amount\n2026-09-01,10\n')), 'format')
    await expectKind(parseBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00])), 'format')
    await expectKind(parseBytes(new Uint8Array()), 'format')
  })

  it('헤더는 있는데 필요한 열이 없으면 format', async () => {
    await expectKind(parseBytes(new TextEncoder().encode(toCsv([['交易时间', '金额(元)'], ['2026-09-06 12:00:00', '¥1']]))), 'format')
  })

  it('5MB 넘으면 tooLarge(읽기 전에)', async () => {
    const big = new Blob([new Uint8Array(MAX_FILE_BYTES + 1)])
    await expectKind(parseStatementFile('WECHAT', big), 'tooLarge')
    expect(() => readSheet(new Uint8Array(MAX_FILE_BYTES + 1))).toThrow(StatementFileError)
  })

  it('행 상한을 넘으면 tooLarge', () => {
    const many = Array.from({ length: 20_300 }, () => 'a,b').join('\n')
    expect(() => readSheet(new TextEncoder().encode(many))).toThrow(StatementFileError)
  })
})

describe('위챗 규칙', () => {
  const parse = (rows: string[][]) => parseWechatRows([HEADER, ...rows])

  it('支出 + 가맹점 유형 + 성공만. 홍바오·이체·群收款 → transfer, 충전·출금·수입·실패·모르는 유형 → other', async () => {
    const result = await parse([
      row({ 交易单号: '1' }),
      row({ 交易单号: '2', 交易类型: '扫二维码付款' }),
      row({ 交易单号: '3', 交易类型: '微信红包（单发）', '收/支': '支出' }),
      row({ 交易单号: '4', 交易类型: '转账', '收/支': '支出' }),
      row({ 交易单号: '5', 交易类型: '群收款', '收/支': '支出' }),
      row({ 交易单号: '6', 交易类型: '零钱充值', '收/支': '/' }),
      row({ 交易单号: '7', 交易类型: '零钱提现', '收/支': '/' }),
      row({ 交易单号: '8', 交易类型: '商户消费', '收/支': '收入' }),
      row({ 交易单号: '9', 当前状态: '支付失败' }),
      row({ 交易单号: '10', 交易类型: '信用卡还款' }),
      row({ 交易单号: '11', '金额(元)': '¥0.00' }),
    ])
    expect(result.items).toHaveLength(2)
    expect(result.excluded).toEqual({ transfer: 3, other: 6 })
  })

  it('부분 환불: 환불액이 있으면 순액, 없으면 원 금액 + 표시, 환불액 ≥ 금액이면 전액 환불', async () => {
    const result = await parse([
      row({ 交易单号: '1', 交易对方: 'A', '金额(元)': '¥100.00', 当前状态: '已退款(￥30.50)' }),
      row({ 交易单号: '2', 交易对方: 'B', '金额(元)': '¥100.00', 当前状态: '部分退款' }),
      row({ 交易单号: '3', 交易对方: 'C', '金额(元)': '¥100.00', 当前状态: '已退款￥100.00' }),
      row({ 交易单号: '4', 交易对方: 'D', '金额(元)': '¥100.00', 当前状态: '已全额退款' }),
    ])
    expect(result.items.map((i) => [i.merchantName, i.amount, i.refund, i.refundAmount])).toEqual([
      ['A', '69.50', 'PARTIAL', '30.50'],
      ['B', '100.00', 'PARTIAL', null],
      ['C', '100.00', 'FULL', null],
      ['D', '100.00', 'FULL', null],
    ])
  })

  it('같은 거래 번호는 한 번만, 최신순 정렬, 交易对方이 "/"면 商品', async () => {
    const result = await parse([
      row({ 交易单号: '1', 交易时间: '2026-09-01 10:00:00' }),
      row({ 交易单号: '1', 交易时间: '2026-09-01 10:00:00' }),
      row({ 交易单号: '2', 交易时间: '2026-09-03 10:00:00', 交易对方: '/', 商品: '示例-自动售货机' }),
    ])
    expect(result.items.map((i) => i.merchantName)).toEqual(['示例-自动售货机', '示例-面馆'])
  })

  it('칸: BOM·앞뒤 공백·탭 제거, 1,000자 넘는 칸은 잘라 읽는다(긴 공백 칸도 빠르게)', async () => {
    const started = performance.now()
    const result = await parse([
      row({ 交易单号: '\uFEFF 77 \t', 交易对方: `\uFEFF示例-面馆${' '.repeat(50_000)}x`, '金额(元)': `¥5.00${'\t'.repeat(10_000)}` }),
    ])
    expect(performance.now() - started).toBeLessThan(1_000)
    expect(result.items[0]).toMatchObject({ merchantName: '示例-面馆', amount: '5.00' })
    expect(result.items[0].txnDigest).toBe(await txnDigest('WECHAT', '77'))
  })

  it('가맹점: 양방향 제어·폭 없는 공백은 지우고 ZWJ 이모지는 남긴다', async () => {
    const result = await parse([row({ 交易对方: '\u202e示例\u200b面馆\u202c 👨\u200d🍳' })])
    expect(result.items[0].merchantName).toBe('示例面馆 👨\u200d🍳')
  })

  it('헤더가 없으면 format', async () => {
    await expectKind(parseWechatRows([['foo'], ['bar']]), 'format')
  })
})

describe('정규화', () => {
  it('시각: 중국 표준시 +08:00(KST는 1시간 뒤)', () => {
    const iso = normalizeWechatTime('2026-09-06 23:30:00')
    expect(iso).toBe('2026-09-06T23:30:00+08:00')
    // KST로는 다음 날 00:30
    expect(new Date(iso ?? '').toISOString()).toBe('2026-09-06T15:30:00.000Z')
    expect(normalizeWechatTime('2026/9/6 8:05')).toBe('2026-09-06T08:05:00+08:00')
    expect(normalizeWechatTime('2026-02-30 10:00:00')).toBeNull()
    expect(normalizeWechatTime('어제')).toBeNull()
  })

  it('금액', () => {
    expect(normalizeAmount('￥1,234.5')).toBe('1234.50')
    expect(normalizeAmount('¥ 0.01')).toBe('0.01')
    expect(normalizeAmount('12.345')).toBe('12.35')
    expect(normalizeAmount('-5')).toBeNull()
    expect(normalizeAmount('abc')).toBeNull()
  })

  it('가맹점: 제어문자 정리 · 40자', () => {
    expect(cleanMerchant(' a\tb\n c ')).toBe('a b c')
    expect([...cleanMerchant('店'.repeat(50))]).toHaveLength(40)
  })
})
