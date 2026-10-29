import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/render'
import { txnDigest } from './parsers/digest'

// W10 위챗페이 파일 가져오기 화면(HF-65~68) · 보안(원문은 서버로 가지 않는다). 목 시점 = 11.13 18:34 KST, 오사카(11.12~11.15) 진행 중.
// 테스트 파일은 합성 데이터(실제 개인정보 없음).

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(async () => {
  await Promise.all([import('../manual/WalletListPage'), import('./pages/FilePage'), import('./parsers')])
})

beforeEach(() => {
  db.fileImport = true
  db.cardImport = false
})
afterEach(() => server.events.removeAllListeners('request:start'))

const HEADER = '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注'
const SUMMARY = ['微信支付账单明细', '起始时间：[2026-11-01 00:00:00] 终止时间：[2026-11-13 23:59:59]', '共8笔记录', '----------------------微信支付账单明细列表--------------------']
const ROWS = [
  // 오사카 기간 안(11.13 12:30 CST = 13:30 KST)
  '2026-11-13 12:30:15,商户消费,滴滴出行,快车,支出,¥128.00,零钱,支付成功,TXN-0001,M-1,/',
  '2026-11-13 10:15:00,商户消费,瑞幸咖啡,拿铁,支出,¥19.90,零钱,支付成功,TXN-0002,M-2,/',
  '2026-11-12 12:30:00,商户消费,海底捞火锅,"晚餐,四人",支出,¥468.00,示例银行卡(0000),已退款(￥30.00),TXN-0003,M-3,/',
  '2026-11-12 20:05:00,商户消费,上海迪士尼度假区,门票,支出,¥475.00,零钱,已全额退款,TXN-0004,M-4,/',
  // 기간 밖(11.01) → 기본 해제
  '2026-11-01 19:30:00,扫二维码付款,小杨生煎,生煎,支出,¥42.00,零钱,支付成功,TXN-0005,/,/',
  // 제외: 홍바오 · 이체(알림) · 충전(조용히)
  '2026-11-11 09:00:00,微信红包,示例-张三,/,收入,¥66.00,/,已存入零钱,TXN-0006,/,/',
  '2026-11-10 09:00:00,转账,示例-李四,/,支出,¥60.00,零钱,对方已收钱,TXN-0007,/,/',
  '2026-11-09 09:00:00,零钱充值,示例银行(0000),/,/,¥500.00,示例银行卡(0000),充值完成,TXN-0008,/,/',
]
const csvFile = (rows = ROWS, name = '微信支付账单(20261101-20261113).csv') =>
  new File([[...SUMMARY, HEADER, ...rows].join('\n')], name, { type: 'text/csv' })

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const fileInput = () => screen.getByTestId('file-import-input') as HTMLInputElement
const upload = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } })
const storageDump = () => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })

async function toGuide() {
  const app = renderApp('/wallet')
  fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
  expect(await screen.findByRole('heading', { name: '위챗페이 파일 가져오기' })).toBeTruthy()
  return app
}

/** 보낸 요청 본문(파일 가져오기 API만) */
function captureBodies() {
  const sent: { url: string; body: string }[] = []
  server.events.on('request:start', ({ request }) => {
    if (request.url.includes('/api/wallet/entries/file-import')) void request.clone().text().then((body) => sent.push({ url: request.url, body }))
  })
  return sent
}

describe('진입점(HF-49 · 49b · 65)', () => {
  it('both flags on: header "불러오기" opens the HF-65 sheet (card + wechat rows)', async () => {
    db.cardImport = true
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '불러오기' }))
    const sheet = await screen.findByRole('dialog', { name: '내역 불러오기' })
    expect(within(sheet).getByRole('button', { name: '카드 내역 불러오기' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: '위챗페이 파일 가져오기' }))
    expect(await screen.findByRole('heading', { name: '위챗페이 파일 가져오기' })).toBeTruthy()
  })

  it('only the file flag on: goes straight to HF-66 (no sheet), and the empty wallet link reads "내역 불러오기"', async () => {
    db.walletEntries = []
    renderApp('/wallet')
    expect(await screen.findByText('결제 기록이 없어요')).toBeTruthy()
    fireEvent.click(button('내역 불러오기'))
    expect(await screen.findByRole('heading', { name: '위챗페이 파일 가져오기' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('flag off or unknown provider → wallet, and no entry point', async () => {
    db.fileImport = false
    const { router } = renderApp('/wallet/file-import/wechat')
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
    await screen.findByText('이번 달')
    expect(screen.queryByRole('button', { name: '불러오기' })).toBeNull()
    db.fileImport = true
    await router.navigate('/wallet/file-import/alipay')
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
  })
})

describe('HF-66 내보내는 방법', () => {
  it('numbered steps with Chinese menu names (lang zh-CN), the fact line and the xlsx/csv picker', async () => {
    await toGuide()
    expect(screen.getByText('(我)').getAttribute('lang')).toBe('zh-CN')
    expect(screen.getByText('(用于个人对账)')).toBeTruthy()
    expect(screen.getByText('이메일은 압축 비밀번호가 위챗페이(微信支付) 공식 계정으로 와요')).toBeTruthy()
    expect(screen.getByText('이 기기에서만 읽고')).toBeTruthy()
    expect(fileInput().accept).toBe('.xlsx,.csv')
    expect(button('파일 선택')).toBeTruthy()
  })
})

describe('HF-68 결과', () => {
  it('lists merchant payments, excludes transfers with a caption, shows chips/refund/estimate, selects in-trip rows, and saves', async () => {
    db.fileImportedDigests = [await txnDigest('WECHAT', 'TXN-0002')]
    const sent = captureBodies()
    const { router, queryClient } = await toGuide()
    upload(csvFile())
    // 5행(가져올 수 있는 3 + 추가됨 1 + 환불됨 1)
    expect(await screen.findByRole('heading', { name: '위챗페이 · 5건' })).toBeTruthy()
    expect(screen.getByText('송금·홍바오 2건은 제외했어요')).toBeTruthy()
    // 기본 선택: 기간 안(滴滴出行 · 海底捞火锅), 기간 밖(小杨生煎)은 해제
    expect(screen.getByText('3건 중 2건')).toBeTruthy()
    const row = (name: string) => screen.getByText(name).closest('label') as HTMLElement
    expect(within(row('滴滴出行')).getByText('CN¥128.00')).toBeTruthy()
    expect(await within(row('滴滴出行')).findByText('약 ₩24,330')).toBeTruthy()
    expect(within(row('滴滴出行')).getByText(/^\d{2}:\d{2} · /)).toBeTruthy()
    expect(within(row('海底捞火锅')).getByText('CN¥438.00')).toBeTruthy()
    expect(within(row('海底捞火锅')).getByText('부분 환불 −CN¥30.00')).toBeTruthy()
    expect(within(row('瑞幸咖啡')).getByText('추가됨')).toBeTruthy()
    expect((within(row('瑞幸咖啡')).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    expect(within(row('上海迪士尼度假区')).getByText('환불됨')).toBeTruthy()
    expect((within(row('上海迪士尼度假区')).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    // 가맹점 이름은 중국어 원문(lang zh-CN — 시스템 간체 서체)
    expect(screen.getByText('滴滴出行').closest('[lang]')?.getAttribute('lang')).toBe('zh-CN')
    // 시각은 KST(12:30 CST → 13:30)
    expect(within(row('滴滴出行')).getByText(/^13:30/)).toBeTruthy()

    fireEvent.click(row('小杨生煎'))
    expect(screen.getByText('3건 중 3건')).toBeTruthy()
    const before = db.walletEntries.length
    fireEvent.click(button('3건 추가'))
    expect(await screen.findByText('3건을 추가했어요')).toBeTruthy()
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
    expect(db.walletEntries.length).toBe(before + 3)

    // 보안: 서버에는 다이제스트·시각·순액·통화·가맹점만. 거래 번호 원문·支付方式·商户单号·备注·商品·파일 내용은 없다
    await waitFor(() => expect(sent.some((s) => s.url.endsWith('/file-import'))).toBe(true))
    const all = sent.map((s) => s.body).join('\n')
    for (const secret of ['TXN-000', 'M-1', '零钱', '示例银行卡', '快车', '晚餐', '微信支付账单明细', '示例-张三']) expect(all).not.toContain(secret)
    const check = JSON.parse(sent.find((s) => s.url.endsWith('/check'))?.body ?? '{}') as { items: Record<string, unknown>[] }
    expect(Object.keys(check.items[0]).sort()).toEqual(['occurredAt', 'txnDigest'])
    const saved = JSON.parse(sent.find((s) => s.url.endsWith('/file-import'))?.body ?? '{}') as { provider: string; items: Record<string, unknown>[] }
    expect(saved.provider).toBe('WECHAT')
    expect(Object.keys(saved.items[0]).sort()).toEqual(['amount', 'currency', 'merchantName', 'occurredAt', 'txnDigest'])
    expect(saved.items.find((i) => i.merchantName === '海底捞火锅')).toMatchObject({ amount: '438.00', currency: 'CNY', occurredAt: '2026-11-12T12:30:00+08:00' })
    expect(saved.items[0].txnDigest).toMatch(/^[0-9a-f]{64}$/)
    // 결과는 저장소·캐시에 남지 않는다
    expect(storageDump()).not.toContain('滴滴出行')
    await waitFor(() => expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state))).not.toContain('滴滴出行'))
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain('TXN-0001')
  })

  it('"전체 선택" toggles only selectable rows; 0 selected disables the CTA', async () => {
    await toGuide()
    upload(csvFile())
    await screen.findByText('4건 중 3건')
    fireEvent.click(screen.getByText('전체 선택'))
    expect(button('4건 추가')).toBeTruthy()
    fireEvent.click(screen.getByText('전체 선택'))
    expect(button('0건 추가').hasAttribute('disabled') || button('0건 추가').getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('re-sending already saved payments toasts "이미 추가한 결제예요"', async () => {
    await toGuide()
    upload(csvFile())
    await screen.findByText('4건 중 3건')
    // 확인 뒤 다른 기기에서 저장된 상황
    db.fileImportedDigests.push(...(await Promise.all(['TXN-0001', 'TXN-0002', 'TXN-0003'].map((n) => txnDigest('WECHAT', n)))))
    fireEvent.click(button('3건 추가'))
    expect(await screen.findByText('이미 추가한 결제예요')).toBeTruthy()
  })

  it('wipes the result on pagehide (back to HF-66)', async () => {
    await toGuide()
    upload(csvFile())
    await screen.findByText('滴滴出行')
    window.dispatchEvent(new Event('pagehide'))
    expect(await screen.findByRole('heading', { name: '위챗페이 파일 가져오기' })).toBeTruthy()
    expect(screen.queryByText('滴滴出行')).toBeNull()
  })

  it('‹ on the result discards it and returns to HF-66', async () => {
    await toGuide()
    upload(csvFile())
    await screen.findByText('滴滴出行')
    fireEvent.click(screen.getByRole('button', { name: '뒤로 가기' }))
    expect(await screen.findByRole('heading', { name: '위챗페이 파일 가져오기' })).toBeTruthy()
  })
})

describe('HF-68b · 66b · 66c', () => {
  it('no importable payment → "가져올 결제가 없어요" with 직접 추가 · 다른 파일 선택', async () => {
    const { router } = await toGuide()
    upload(csvFile([ROWS[5], ROWS[6], ROWS[7]]))
    expect(await screen.findByText('가져올 결제가 없어요')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '위챗페이' })).toBeTruthy()
    expect(button('다른 파일 선택')).toBeTruthy()
    fireEvent.click(button('직접 추가'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet/new'))
  })

  it('another CSV → HF-66b; picking another file recovers', async () => {
    await toGuide()
    upload(new File(['date,amount\n2026-11-01,10\n'], 'bank.csv'))
    expect(await screen.findByText('위챗페이 거래 내역 파일이 아니에요')).toBeTruthy()
    expect(screen.getByText('用于个人对账로 받은 xlsx 파일을 올려 주세요')).toBeTruthy()
    expect(button('다른 파일 선택')).toBeTruthy()
    upload(csvFile())
    expect(await screen.findByText('滴滴出行')).toBeTruthy()
  })

  it('a zip (password archive from WeChat) → HF-66c', async () => {
    await toGuide()
    upload(new File([zipSync({ '微信支付账单.xlsx': strToU8('x') }) as BlobPart], '微信支付账单.zip'))
    expect(await screen.findByText('압축을 풀고 올려 주세요')).toBeTruthy()
    expect(screen.getByText('비밀번호는 위챗페이(微信支付) 공식 계정 메시지에 있어요')).toBeTruthy()
  })

  it('too large → "파일이 너무 커요" without reading it', async () => {
    await toGuide()
    upload(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.xlsx'))
    expect(await screen.findByText('파일이 너무 커요')).toBeTruthy()
  })
})
