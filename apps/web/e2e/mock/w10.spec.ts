import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { useMockScenario } from './support'

// W10 위챗페이 파일 가져오기(HF-65 시트 → 66 안내 → 67 읽는 중 → 68 결과 → 지갑 + 토스트, 68b · 66b · 66c).
// 파일은 합성 데이터(실제 개인정보 없음). 파일 읽기(xlsx 압축 해제·CSV 인코딩)는 실제 브라우저에서 돈다. 목 시점 = 11.13 18:34, 오사카 11.12~11.15.

const HEADER = '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注'
const SUMMARY = ['微信支付账单明细', '起始时间：[2026-11-01 00:00:00] 终止时间：[2026-11-13 23:59:59]', '共6笔记录', '----------------------微信支付账单明细列表--------------------']
const ROWS = [
  '2026-11-13 12:30:15,商户消费,滴滴出行,快车,支出,¥128.00,零钱,支付成功,E2E-TXN-0001,M-1,/',
  '2026-11-13 10:15:00,商户消费,瑞幸咖啡,拿铁,支出,¥19.90,零钱,支付成功,E2E-TXN-0002,M-2,/',
  '2026-11-12 12:30:00,商户消费,海底捞火锅,"晚餐,四人",支出,¥468.00,零钱,已退款(￥30.00),E2E-TXN-0003,M-3,/',
  '2026-11-12 20:05:00,商户消费,上海迪士尼度假区,门票,支出,¥475.00,零钱,已全额退款,E2E-TXN-0004,M-4,/',
  '2026-11-11 09:00:00,微信红包,示例-张三,/,收入,¥66.00,/,已存入零钱,E2E-TXN-0005,/,/',
  '2026-11-10 09:00:00,零钱充值,示例银行(0000),/,/,¥500.00,示例银行卡(0000),充值完成,E2E-TXN-0006,/,/',
]
const csv = (rows: string[]) => Buffer.from(`﻿${[...SUMMARY, HEADER, ...rows].join('\r\n')}`, 'utf8')

async function toGuide(page: Page) {
  await page.goto('/wallet')
  await page.getByRole('button', { name: '불러오기', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '내역 불러오기' })
  await expect(sheet.getByRole('button', { name: '카드 내역 불러오기' })).toBeVisible()
  await sheet.getByRole('button', { name: '위챗페이 파일 가져오기' }).click()
  await expect(page.getByRole('heading', { name: '위챗페이 파일 가져오기' })).toBeVisible()
}

const pick = (page: Page, name: string, buffer: Buffer, mimeType = 'text/csv') =>
  page.getByTestId('file-import-input').setInputFiles({ name, mimeType, buffer })

test.describe('위챗페이 파일 가져오기(W10)', () => {
  test('CSV → 결과(추가됨 없음 · 환불 · 제외 Caption · 약 ₩) → 2건 추가 → 지갑 + 토스트, 원문은 서버로 가지 않는다', async ({ page }, testInfo) => {
    await useMockScenario(page, { cardImport: true, fileImport: true })
    const bodies: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/wallet/entries/file-import')) bodies.push(request.postData() ?? '')
    })
    await toGuide(page)
    await expect(page.getByText('(用于个人对账)')).toBeVisible()
    await testInfo.attach('HF-66', { body: await page.screenshot(), contentType: 'image/png' })

    await pick(page, '微信支付账单(20261101-20261113).csv', csv(ROWS))
    await expect(page.getByRole('heading', { name: '위챗페이 · 4건' })).toBeVisible()
    await expect(page.getByText('송금·홍바오 1건은 제외했어요')).toBeVisible()
    await expect(page.getByText('3건 중 3건')).toBeVisible()
    const didi = page.locator('label', { hasText: '滴滴出行' })
    await expect(didi.getByText('CN¥128.00')).toBeVisible()
    await expect(didi.getByText('약 ₩24,330')).toBeVisible()
    await expect(page.locator('label', { hasText: '海底捞火锅' }).getByText('부분 환불 −CN¥30.00')).toBeVisible()
    await expect(page.locator('label', { hasText: '上海迪士尼度假区' }).getByText('환불됨')).toBeVisible()
    // 간체 가맹점 이름은 시스템 중국어 서체로(Noto Sans KR에 없는 글자가 빈칸이 되지 않게)
    const font = await page.getByText('瑞幸咖啡').evaluate((el) => getComputedStyle(el).fontFamily)
    expect(font).toContain('PingFang SC')
    await testInfo.attach('HF-68', { body: await page.screenshot(), contentType: 'image/png' })

    await page.locator('label', { hasText: '瑞幸咖啡' }).click()
    await page.getByRole('button', { name: '2건 추가' }).click()
    await expect(page.getByText('2건을 추가했어요')).toBeVisible()
    await expect(page.getByRole('heading', { name: '내 지갑' })).toBeVisible()
    await expect(page.getByRole('button', { name: /滴滴出行/ })).toBeVisible()

    const sent = bodies.join('\n')
    expect(sent).toContain('txnDigest')
    for (const secret of ['E2E-TXN', 'M-1', '零钱', '快车', '晚餐', '微信支付账单明细']) expect(sent).not.toContain(secret)
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    expect(storage).not.toContain('滴滴出行')

    // 같은 파일을 다시 올리면 "추가됨"
    await page.getByRole('button', { name: '불러오기', exact: true }).click()
    await page.getByRole('dialog', { name: '내역 불러오기' }).getByRole('button', { name: '위챗페이 파일 가져오기' }).click()
    await pick(page, 'again.csv', csv(ROWS))
    await expect(page.locator('label', { hasText: '滴滴出行' }).getByText('추가됨')).toBeVisible()
    await expect(page.getByText('1건 중 1건')).toBeVisible()
  })

  test('xlsx(합성 fixture)도 브라우저에서 읽는다', async ({ page }) => {
    await useMockScenario(page, { fileImport: true })
    await page.goto('/wallet')
    // 카드가 꺼져 있으면 시트 없이 바로 HF-66
    await page.getByRole('button', { name: '불러오기', exact: true }).click()
    await expect(page.getByRole('heading', { name: '위챗페이 파일 가져오기' })).toBeVisible()
    const xlsx = readFileSync(resolve(process.cwd(), 'src/features/file-import/parsers/fixtures/wechat.xlsx'))
    await pick(page, 'wechat.xlsx', xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    await expect(page.getByRole('heading', { name: '위챗페이 · 4건' })).toBeVisible()
    await expect(page.getByText('示例-老王家常菜')).toBeVisible()
    // 9월 결제는 여정 기간 밖이라 기본 해제
    await expect(page.getByText('3건 중 0건')).toBeVisible()
  })

  test('오류(HF-66b · 66c) → 다른 파일 선택 · 0건(HF-68b) → 직접 추가', async ({ page }, testInfo) => {
    await useMockScenario(page, { cardImport: true, fileImport: true })
    await toGuide(page)
    await pick(page, 'bank.csv', Buffer.from('date,amount\n2026-11-01,10\n'))
    await expect(page.getByText('위챗페이 거래 내역 파일이 아니에요')).toBeVisible()
    await expect(page.getByRole('heading', { name: '위챗페이', exact: true })).toBeVisible()
    await testInfo.attach('HF-66b', { body: await page.screenshot(), contentType: 'image/png' })

    // 위챗이 이메일로 보내는 압축(xlsx를 담은 zip)
    const zip = Buffer.from(zipSync({ '微信支付账单.xlsx': strToU8('x') }))
    await pick(page, '微信支付账单.zip', zip, 'application/zip')
    await expect(page.getByText('압축을 풀고 올려 주세요')).toBeVisible()
    await expect(page.getByText('비밀번호는 위챗페이(微信支付) 공식 계정 메시지에 있어요')).toBeVisible()

    await pick(page, 'transfers.csv', csv([ROWS[4], ROWS[5]]))
    await expect(page.getByText('가져올 결제가 없어요')).toBeVisible()
    await page.getByRole('button', { name: '직접 추가' }).click()
    await expect(page).toHaveURL(/\/wallet\/new$/)
  })
})
