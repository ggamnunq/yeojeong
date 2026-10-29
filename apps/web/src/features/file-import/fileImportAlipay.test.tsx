import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/render'
import { txnDigest } from './parsers/digest'

// W11 알리페이 파일 가져오기 화면(HF-65 · 66a · 66ab · 66ac · 66d · 68a) · 보안(처리방침 전제):
// (a) 对方账号 등 버리는 열은 서버로 가지 않는다 (b) check에는 결과 행(가맹점 결제)의 대조값만 (c) 시각은 UTC+8로 읽어 +08:00으로 보내고 KST로 보인다.
// 목 시점 = 11.13 18:34 KST, 오사카(11.12~11.15) 진행 중. 테스트 파일은 합성 데이터(실제 개인정보 없음).

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(async () => {
  await Promise.all([import('../manual/WalletListPage'), import('./pages/FilePage'), import('./parsers')])
})

beforeEach(() => {
  db.fileImport = true
  db.fileImportProviders = ['WECHAT', 'ALIPAY']
  db.cardImport = false
})
afterEach(() => server.events.removeAllListeners('request:start'))

const PREAMBLE = [
  '------------------------------------------------------------------------------------',
  '导出信息：',
  '姓名：示例用户',
  '支付宝账户：example-user@example.com',
  '起始时间：[2026-11-01 00:00:00]    终止时间：[2026-11-13 23:59:59]',
  '共9笔记录',
  '特别提示：',
  '1.本回单内容可表明支付宝受理了相关支付申请，不代表实际到账；',
  '------------------------支付宝（中国）网络技术有限公司  电子客户回单------------------------',
]
const HEADER = '交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注,'
const ROWS = [
  // 오사카 기간 안(11.13 12:30 CST = 13:30 KST)
  '2026-11-13 12:30:15,餐饮美食,盒马鲜生,hema***@example.com,生鲜,支出,126.50,招商银行储蓄卡(0000),交易成功,ALI-0001\t,MO-0001\t,NOTE-A,',
  '2026-11-12 12:30:00,餐饮美食,西贝莜面村,xibei***@example.com,"午餐,两人",支出,312.00,花呗,交易成功,ALI-0002\t,MO-0002\t,,',
  '2026-11-12 18:00:00,退款,西贝莜面村,xibei***@example.com,退款-午餐,不计收支,45.00,花呗,退款成功,ALI-0002_R1\t,MO-0002\t,,',
  // 중국 11.12 23:30 = KST 11.13 00:30(날짜 묶음이 바뀐다)
  '2026-11-12 23:30:00,交通出行,滴滴出行,didi***@example.com,快车,支出,58.00,余额,交易成功,ALI-0003\t,MO-0003\t,,',
  // 제외: 송금 · 받은 红包(알림) · 余额宝 · 花呗 상환 · 충전(조용히)
  '2026-11-11 09:00:00,转账红包,张*三,zhang***@example.com,转账,支出,100.00,余额,交易成功,ALI-0004\t,\t,生日快乐,',
  '2026-11-11 10:00:00,转账红包,李*四,li***@example.com,收到红包,收入,66.00,余额,交易成功,ALI-0005\t,\t,,',
  '2026-11-10 09:00:00,投资理财,余额宝,yeb***@example.com,余额宝-转入,不计收支,1000.00,余额,交易成功,ALI-0006\t,\t,,',
  '2026-11-10 10:00:00,信用借还,花呗,huabei***@example.com,花呗主动还款,支出,300.00,招商银行储蓄卡(0000),还款成功,ALI-0007\t,\t,,',
  '2026-11-10 11:00:00,充值缴费,中国移动,cmcc***@example.com,话费充值,支出,50.00,余额,交易成功,ALI-0008\t,\t,,',
]
const csvFile = (rows = ROWS, name = '支付宝交易明细(20261101-20261113).csv') =>
  new File([[...PREAMBLE, HEADER, ...rows].join('\r\n')], name, { type: 'text/csv' })

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const fileInput = () => screen.getByTestId('file-import-input') as HTMLInputElement
const upload = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } })

function captureBodies() {
  const sent: { url: string; body: string }[] = []
  server.events.on('request:start', ({ request }) => {
    if (request.url.includes('/api/wallet/entries/file-import')) void request.clone().text().then((body) => sent.push({ url: request.url, body }))
  })
  return sent
}

async function toGuide() {
  const app = renderApp('/wallet')
  fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
  const sheet = await screen.findByRole('dialog', { name: '내역 불러오기' })
  fireEvent.click(within(sheet).getByRole('button', { name: '알리페이 파일 가져오기' }))
  expect(await screen.findByRole('heading', { name: '알리페이 파일 가져오기' })).toBeTruthy()
  return app
}

describe('진입점(HF-65)', () => {
  it('card + both providers: sheet rows in order card · wechat · alipay', async () => {
    db.cardImport = true
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    const sheet = await screen.findByRole('dialog', { name: '내역 불러오기' })
    expect(within(sheet).getAllByRole('button', { name: /가져오기|불러오기/ }).map((b) => b.textContent)).toEqual([
      '카드 내역 불러오기',
      '위챗페이 파일 가져오기',
      '알리페이 파일 가져오기',
    ])
  })

  it('alipay only: goes straight to HF-66a; alipay not listed → no row and its page redirects to the wallet', async () => {
    db.fileImportProviders = ['ALIPAY']
    const { router } = renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    expect(await screen.findByRole('heading', { name: '알리페이 파일 가져오기' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    db.fileImportProviders = ['WECHAT']
    await router.navigate('/wallet')
    // 세션은 처음 받은 값을 쓴다 — 새로 그린다
    const again = renderApp('/wallet/file-import/alipay')
    await waitFor(() => expect(again.router.state.location.pathname).toBe('/wallet'))
  })
})

describe('HF-66a 알리페이 안내', () => {
  it('steps with Chinese menu names (lang zh-CN), the email note and the csv/zip picker', async () => {
    await toGuide()
    expect(screen.getByText('(我的)').getAttribute('lang')).toBe('zh-CN')
    expect(screen.getByText('(开具交易流水证明)')).toBeTruthy()
    expect(screen.getByText('(用于个人对账)')).toBeTruthy()
    expect(screen.getByText('이메일로 받기')).toBeTruthy()
    expect(screen.getByText('압축 비밀번호는 앱의 발급 기록(开具记录)에서 확인해요')).toBeTruthy()
    expect(screen.getByText('받은 CSV 파일(압축은 풀어서)을 여기에 올려요')).toBeTruthy()
    expect(fileInput().accept).toBe('.csv,.zip,.xlsx')
  })
})

describe('HF-68a 결과 · 보안', () => {
  it('lists merchant payments with refunds, counts transfers, sends only result-row digests, and +08:00 times shown in KST', async () => {
    db.fileImportedDigests = []
    const sent = captureBodies()
    const { router } = await toGuide()
    upload(csvFile())
    expect(await screen.findByRole('heading', { name: '알리페이 · 3건' })).toBeTruthy()
    expect(screen.getByText('송금·이체 2건은 제외했어요')).toBeTruthy()
    const row = (name: string) => screen.getByText(name).closest('label') as HTMLElement
    expect(within(row('盒马鲜生')).getByText('CN¥126.50')).toBeTruthy()
    expect(await within(row('盒马鲜生')).findByText(/^약 ₩/)).toBeTruthy()
    expect(within(row('西贝莜面村')).getByText('CN¥267.00')).toBeTruthy()
    expect(within(row('西贝莜面村')).getByText('부분 환불 −CN¥45.00')).toBeTruthy()
    // (c) 중국 시각 → KST: 12:30 → 13:30, 11.12 23:30 → 11.13 00:30(11.13 묶음)
    expect(within(row('盒马鲜生')).getByText(/^13:30/)).toBeTruthy()
    expect(within(row('滴滴出行')).getByText(/^00:30/)).toBeTruthy()
    expect(row('滴滴出行').closest('section')?.getAttribute('aria-label')).toMatch(/11\.13/)

    fireEvent.click(button('3건 추가'))
    expect(await screen.findByText('3건을 추가했어요')).toBeTruthy()
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))

    await waitFor(() => expect(sent.some((s) => s.url.endsWith('/file-import'))).toBe(true))
    // (a) 버리는 열(对方账号 · 收/付款方式 · 商家订单号 · 备注) · 거래 번호 원문 · 商品说明 · 안내문은 보내지 않는다
    const all = sent.map((s) => s.body).join('\n')
    for (const secret of ['example.com', '***', '招商银行', '花呗', 'MO-000', 'NOTE-A', '生日快乐', 'ALI-000', '生鲜', '午餐', '支付宝', '张*三']) {
      expect(all).not.toContain(secret)
    }
    // (b) check = 공급자 + 결과 행 3건의 대조값뿐. 송금·红包·余额宝·상환·충전·환불 행 대조값은 만들지도 보내지도 않는다
    const check = JSON.parse(sent.find((s) => s.url.endsWith('/check'))?.body ?? '{}') as { provider: string; txnDigests: string[] }
    expect(Object.keys(check).sort()).toEqual(['provider', 'txnDigests'])
    expect(check.provider).toBe('ALIPAY')
    const shown = await Promise.all(['ALI-0001', 'ALI-0002', 'ALI-0003'].map((n) => txnDigest('ALIPAY', n)))
    expect([...check.txnDigests].sort()).toEqual([...shown].sort())
    for (const n of ['ALI-0002_R1', 'ALI-0004', 'ALI-0005', 'ALI-0006', 'ALI-0007', 'ALI-0008']) {
      expect(check.txnDigests).not.toContain(await txnDigest('ALIPAY', n))
    }
    // (c) 저장 본문의 시각은 +08:00
    const saved = JSON.parse(sent.find((s) => s.url.endsWith('/file-import'))?.body ?? '{}') as { provider: string; items: Record<string, string>[] }
    expect(saved.provider).toBe('ALIPAY')
    expect(saved.items.every((i) => i.occurredAt.endsWith('+08:00') && i.currency === 'CNY')).toBe(true)
    expect(saved.items.find((i) => i.merchantName === '滴滴出行')).toMatchObject({ occurredAt: '2026-11-12T23:30:00+08:00', amount: '58.00' })
    expect(saved.items.find((i) => i.merchantName === '西贝莜面村')).toMatchObject({ amount: '267.00' })
  })
})

describe('HF-66ab · 66ac · 66d · 68b', () => {
  it('another CSV (or a WeChat file) → "알리페이 거래 내역 파일이 아니에요"', async () => {
    await toGuide()
    upload(new File(['交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号\n'], 'wechat.csv'))
    expect(await screen.findByText('알리페이 거래 내역 파일이 아니에요')).toBeTruthy()
    expect(screen.getByText('用于个人对账로 받은 CSV 파일을 올려 주세요')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '알리페이' })).toBeTruthy()
    expect(button('다른 파일 선택')).toBeTruthy()
  })

  it('the emailed zip → "압축을 풀고 올려 주세요" with the alipay password hint', async () => {
    await toGuide()
    upload(new File([zipSync({ '支付宝交易明细.csv': strToU8('x') }) as BlobPart], '支付宝交易明细.zip'))
    expect(await screen.findByText('압축을 풀고 올려 주세요')).toBeTruthy()
    expect(screen.getByText('비밀번호는 알리페이 앱의 발급 기록(开具记录)에 있어요')).toBeTruthy()
  })

  it('too large → shared HF-66d with the alipay header', async () => {
    await toGuide()
    upload(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.csv'))
    expect(await screen.findByText('파일이 너무 커요')).toBeTruthy()
    expect(screen.getByText('기간을 나눠서 다시 받아 주세요')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '알리페이' })).toBeTruthy()
  })

  it('only transfers/neutral rows → HF-68b "가져올 결제가 없어요"', async () => {
    await toGuide()
    upload(csvFile(ROWS.slice(4)))
    expect(await screen.findByText('가져올 결제가 없어요')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '알리페이' })).toBeTruthy()
  })
})
