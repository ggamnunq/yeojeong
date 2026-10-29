import { expect, test, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import iconv from './gbk'
import { useMockScenario } from './support'

// W11 알리페이 파일 가져오기(HF-65 시트 → 66a 안내 → 67 읽는 중 → 68a 결과 → 지갑 + 토스트, 66ab · 66ac · 66d · 68b).
// 파일은 합성 데이터(실제 개인정보 없음). CSV 인코딩 감지(GBK)·파싱은 실제 브라우저에서 돈다. 목 시점 = 11.13 18:34, 오사카 11.12~11.15.

const PREAMBLE = [
  '------------------------------------------------------------------------------------',
  '导出信息：',
  '姓名：示例用户',
  '支付宝账户：example-user@example.com',
  '起始时间：[2026-11-01 00:00:00]    终止时间：[2026-11-13 23:59:59]',
  '共7笔记录',
  '特别提示：',
  '1.本回单内容可表明支付宝受理了相关支付申请，不代表实际到账；',
  '------------------------支付宝（中国）网络技术有限公司  电子客户回单------------------------',
]
const HEADER = '交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注,'
const ROWS = [
  '2026-11-13 12:30:15,餐饮美食,盒马鲜生,hema***@example.com,生鲜,支出,126.50,招商银行储蓄卡(0000),交易成功,E2E-ALI-0001\t,MO-0001\t,NOTE-A,',
  '2026-11-12 18:42:00,餐饮美食,美团外卖,meituan***@example.com,晚餐,支出,58.00,花呗,交易成功,E2E-ALI-0002\t,MO-0002\t,,',
  '2026-11-12 12:30:00,餐饮美食,西贝莜面村,xibei***@example.com,"午餐,两人",支出,312.00,花呗,交易成功,E2E-ALI-0003\t,MO-0003\t,,',
  '2026-11-12 13:00:00,退款,西贝莜面村,xibei***@example.com,退款-午餐,不计收支,45.00,花呗,退款成功,E2E-ALI-0003_R1\t,MO-0003\t,,',
  '2026-11-12 20:05:00,酒店旅游,飞猪旅行,fliggy***@example.com,酒店,支出,599.00,余额,交易关闭,E2E-ALI-0004\t,MO-0004\t,,',
  '2026-11-12 21:00:00,退款,飞猪旅行,fliggy***@example.com,退款-酒店,不计收支,599.00,余额,退款成功,E2E-ALI-0004\t,MO-0004\t,,',
  '2026-11-11 09:00:00,转账红包,张*三,zhang***@example.com,转账,支出,100.00,余额,交易成功,E2E-ALI-0005\t,\t,生日快乐,',
  '2026-11-10 09:00:00,投资理财,余额宝,yeb***@example.com,余额宝-转入,不计收支,1000.00,余额,交易成功,E2E-ALI-0006\t,\t,,',
]
/** 알리페이가 보내는 GBK CSV */
const csv = (rows: string[]) => iconv([...PREAMBLE, HEADER, ...rows].join('\r\n'))

async function toGuide(page: Page) {
  await page.goto('/wallet')
  await page.getByRole('button', { name: '불러오기', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '내역 불러오기' })
  await expect(sheet.getByRole('button', { name: '위챗페이 파일 가져오기' })).toBeVisible()
  await sheet.getByRole('button', { name: '알리페이 파일 가져오기' }).click()
  await expect(page.getByRole('heading', { name: '알리페이 파일 가져오기' })).toBeVisible()
}

const pick = (page: Page, name: string, buffer: Buffer, mimeType = 'text/csv') =>
  page.getByTestId('file-import-input').setInputFiles({ name, mimeType, buffer })

test.describe('알리페이 파일 가져오기(W11)', () => {
  test('GBK CSV → 결과(환불 · 제외 Caption · 약 ₩) → 추가 → 지갑 + 토스트, 버리는 열·원문은 서버로 가지 않는다', async ({ page }, testInfo) => {
    await useMockScenario(page, { cardImport: true, fileImport: 'WECHAT,ALIPAY' })
    const bodies: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/wallet/entries/file-import')) bodies.push(request.postData() ?? '')
    })
    await page.goto('/wallet')
    await page.getByRole('button', { name: '불러오기', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '내역 불러오기' }).getByRole('button', { name: '알리페이 파일 가져오기' })).toBeVisible()
    await testInfo.attach('HF-65', { body: await page.screenshot(), contentType: 'image/png' })
    await page.getByRole('dialog', { name: '내역 불러오기' }).getByRole('button', { name: '알리페이 파일 가져오기' }).click()
    await expect(page.getByText('(开具交易流水证明)')).toBeVisible()
    await testInfo.attach('HF-66a', { body: await page.screenshot(), contentType: 'image/png' })

    await pick(page, '支付宝交易明细(20261101-20261113).csv', csv(ROWS))
    await expect(page.getByRole('heading', { name: '알리페이 · 4건' })).toBeVisible()
    await expect(page.getByText('송금·이체 1건은 제외했어요')).toBeVisible()
    await expect(page.getByText('3건 중 3건')).toBeVisible()
    const hema = page.locator('label', { hasText: '盒马鲜生' })
    await expect(hema.getByText('CN¥126.50')).toBeVisible()
    await expect(hema.getByText(/^13:30/)).toBeVisible()
    await expect(hema.getByText(/^약 ₩/)).toBeVisible()
    await expect(page.locator('label', { hasText: '西贝莜面村' }).getByText('부분 환불 −CN¥45.00')).toBeVisible()
    await expect(page.locator('label', { hasText: '飞猪旅行' }).getByText('환불됨')).toBeVisible()
    await testInfo.attach('HF-68a', { body: await page.screenshot(), contentType: 'image/png' })

    await page.getByRole('button', { name: '3건 추가' }).click()
    await expect(page.getByText('3건을 추가했어요')).toBeVisible()
    await expect(page.getByRole('heading', { name: '내 지갑' })).toBeVisible()
    await expect(page.getByRole('button', { name: /盒马鲜生/ })).toBeVisible()

    const check = JSON.parse(bodies[0]) as { provider: string; txnDigests: string[] }
    expect(Object.keys(check).sort()).toEqual(['provider', 'txnDigests'])
    expect(check.provider).toBe('ALIPAY')
    // 결과 행 4건(환불됨 포함)만. 송금·余额宝·환불 행은 대조값도 없다
    expect(check.txnDigests).toHaveLength(4)
    const sent = bodies.join('\n')
    for (const secret of ['E2E-ALI', 'MO-000', 'example.com', '***', '招商银行', '花呗', 'NOTE-A', '生日快乐', '生鲜', '午餐', '支付宝']) expect(sent).not.toContain(secret)
    expect(sent).toContain('+08:00')
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    expect(storage).not.toContain('盒马鲜生')
  })

  test('오류(HF-66ab · 66ac · 66d) → 다른 파일 선택 · 0건(HF-68b)', async ({ page }, testInfo) => {
    await useMockScenario(page, { cardImport: true, fileImport: 'WECHAT,ALIPAY' })
    await toGuide(page)
    await pick(page, 'bank.csv', Buffer.from('date,amount\n2026-11-01,10\n'))
    await expect(page.getByText('알리페이 거래 내역 파일이 아니에요')).toBeVisible()
    await expect(page.getByText('用于个人对账로 받은 CSV 파일을 올려 주세요')).toBeVisible()
    await expect(page.getByRole('heading', { name: '알리페이', exact: true })).toBeVisible()
    await testInfo.attach('HF-66ab', { body: await page.screenshot(), contentType: 'image/png' })

    await pick(page, '支付宝交易明细.zip', Buffer.from(zipSync({ '支付宝交易明细.csv': strToU8('x') })), 'application/zip')
    await expect(page.getByText('압축을 풀고 올려 주세요')).toBeVisible()
    await expect(page.getByText('비밀번호는 알리페이 앱의 발급 기록(开具记录)에 있어요')).toBeVisible()
    await testInfo.attach('HF-66ac', { body: await page.screenshot(), contentType: 'image/png' })

    await pick(page, 'big.csv', Buffer.alloc(5 * 1024 * 1024 + 1))
    await expect(page.getByText('파일이 너무 커요')).toBeVisible()
    await expect(page.getByText('기간을 나눠서 다시 받아 주세요')).toBeVisible()
    await testInfo.attach('HF-66d', { body: await page.screenshot(), contentType: 'image/png' })

    await pick(page, 'transfers.csv', csv([ROWS[6], ROWS[7]]))
    await expect(page.getByText('가져올 결제가 없어요')).toBeVisible()
    await page.getByRole('button', { name: '직접 추가' }).click()
    await expect(page).toHaveURL(/\/wallet\/new$/)
  })

  test('알리페이가 켜지지 않으면(FILE_IMPORT_PROVIDERS) 시트에 행이 없고 주소로 와도 지갑으로', async ({ page }) => {
    await useMockScenario(page, { cardImport: true, fileImport: true })
    await page.goto('/wallet')
    await page.getByRole('button', { name: '불러오기', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: '내역 불러오기' })
    await expect(sheet.getByRole('button', { name: '위챗페이 파일 가져오기' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: '알리페이 파일 가져오기' })).toHaveCount(0)
    await page.goto('/wallet/file-import/alipay')
    await expect(page).toHaveURL(/\/wallet$/)
  })
})
