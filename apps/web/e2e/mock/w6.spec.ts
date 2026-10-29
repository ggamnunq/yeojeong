import { expect, test } from '@playwright/test'
import { useMockScenario } from './support'

// W6 수동 결제(토스 연결 꺼짐 기본): HF-18 "결제 추가" → HF-46 → 목록 · HF-49 내 지갑 → HF-48 → 지갑 목록 · HF-20b "수정" → HF-50.
// 목 db는 페이지 메모리에 있다 — 새로 불러오지 않고 앱 안에서만 이동한다.

test.describe('수동 결제(W6)', () => {
  test('여정 결제 추가: 금액 · 내용만 넣고 추가 → 목록에 공동 결제로 → 상세 "수정" → 결제 수정', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/payments')
    await page.getByRole('button', { name: '결제 추가' }).click()
    const sheet = page.getByRole('dialog', { name: '결제 추가' })
    await sheet.getByRole('textbox', { name: '금액' }).fill('3000')
    await expect(sheet.getByText('≈ ₩27,580')).toBeVisible()
    await sheet.getByRole('textbox', { name: '내용' }).fill('타코야키')
    await sheet.getByRole('button', { name: '추가' }).click()
    await expect(page.getByText('추가했어요')).toBeVisible()
    const row = page.getByRole('button', { name: /타코야키/ })
    await expect(row).toContainText('18:34 · 내 결제')
    await row.click()
    const detail = page.getByRole('dialog', { name: '타코야키' })
    await detail.getByRole('button', { name: '수정' }).click()
    const edit = page.getByRole('dialog', { name: '결제 수정' })
    await expect(edit.getByRole('button', { name: '삭제' })).toBeVisible()
    await expect(edit.getByRole('button', { name: '저장' })).toBeDisabled()
    // 저장 → 상세 시트가 다시 열려도 "저장했어요"는 남는다(W6b · HF-50 — 시트 열림 dismiss는 사용자가 새로 열 때만)
    await edit.getByRole('textbox', { name: '내용' }).fill('타코야키 8개')
    await edit.getByRole('button', { name: '저장' }).click()
    await expect(page.getByRole('dialog', { name: '타코야키 8개' })).toBeVisible()
    await expect(page.getByText('저장했어요')).toBeVisible()
  })

  test('추가 시트는 열자마자 금액 입력에 포커스 · 12자리에서 더 치면 무시(W6b · HF-46 · 48)', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/payments')
    await page.getByRole('button', { name: '결제 추가' }).click()
    const amount = page.getByRole('dialog', { name: '결제 추가' }).getByRole('textbox', { name: '금액' })
    await expect(amount).toBeFocused()
    await expect(amount).toHaveAttribute('inputmode', 'numeric')
    await amount.pressSequentially('123456789012')
    await amount.press('Home')
    await amount.pressSequentially('9')
    await expect(amount).toHaveValue('123,456,789,012')
    expect(await amount.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0)
  })

  test('날짜 시트(DS19): 시·분을 한 자씩 쳐도 친 값 그대로 저장(W7b · HF-46d · 48 · 50)', async ({ page }) => {
    await useMockScenario(page)
    /** 날짜 단계를 열고 시 칸부터 한 자씩 친다(2자리면 분으로 넘어간다) */
    const typeTime = async (sheetName: string, keys: string, day?: RegExp) => {
      await page.getByRole('dialog', { name: sheetName }).getByRole('button', { name: /^날짜/ }).click()
      const step = page.getByRole('dialog', { name: '날짜' })
      if (day) await step.getByRole('button', { name: day }).click()
      await step.getByRole('textbox', { name: '시' }).click()
      await page.keyboard.type(keys, { delay: 120 })
      return step
    }

    // HF-48 지갑 결제 추가 · 어제
    await page.goto('/wallet/new')
    let step = await typeTime('결제 추가', '1520', /11월 12일/)
    await expect(step.getByRole('textbox', { name: '시' })).toHaveValue('15')
    await expect(step.getByRole('textbox', { name: '분' })).toHaveValue('20')
    await step.getByRole('button', { name: '확인' }).click()
    await expect(page.getByRole('dialog', { name: '결제 추가' }).getByRole('button', { name: /^날짜/ })).toContainText('11.12 15:20')

    // HF-46d 여정 결제 추가 · 오늘(목 지금 18:34 → 18:39까지): 18:40은 확인 비활성, 18:39로 고치면 저장
    await page.goto('/trips/trip-osaka/payments')
    await page.getByRole('button', { name: '결제 추가' }).click()
    step = await typeTime('결제 추가', '1840')
    await expect(step.getByRole('textbox', { name: '시' })).toHaveValue('18')
    await expect(step.getByRole('textbox', { name: '분' })).toHaveValue('40')
    await expect(step.getByRole('textbox', { name: '분' })).toHaveAttribute('aria-invalid', 'true')
    await expect(step.getByRole('button', { name: '확인' })).toBeDisabled()
    await step.getByRole('textbox', { name: '분' }).click()
    await page.keyboard.type('39', { delay: 120 })
    await expect(step.getByRole('button', { name: '확인' })).toBeEnabled()
    await step.getByRole('button', { name: '확인' }).click()
    await expect(page.getByRole('dialog', { name: '결제 추가' }).getByRole('button', { name: /^날짜/ })).toContainText('11.13 18:39')

    // HF-50 지갑 결제 수정 · 19시 · 21시도(QA: "19"→"01", "21"→"02")
    await page.goto('/wallet')
    await page.getByRole('button', { name: /다카시마야|패밀리마트|MK택시|빅카메라/ }).first().click()
    step = await typeTime('결제 수정', '1907', /11월 12일/)
    await expect(step.getByRole('textbox', { name: '시' })).toHaveValue('19')
    await step.getByRole('button', { name: '확인' }).click()
    await expect(page.getByRole('dialog', { name: '결제 수정' }).getByRole('button', { name: /^날짜/ })).toContainText('11.12 19:07')
    step = await typeTime('결제 수정', '2105')
    await expect(step.getByRole('textbox', { name: '시' })).toHaveValue('21')
    await step.getByRole('button', { name: '확인' }).click()
    await expect(page.getByRole('dialog', { name: '결제 수정' }).getByRole('button', { name: /^날짜/ })).toContainText('11.12 21:05')
  })

  test('지갑 여정 선택: 이미 고른 여정을 다시 눌러도 폼으로 돌아간다(W6b · HF-48b)', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/wallet/new')
    const sheet = page.getByRole('dialog', { name: '결제 추가' })
    const tripRow = sheet.getByRole('button', { name: /^여정/ })
    await expect(tripRow).toContainText(/오사카 3박 4일|후쿠오카/)
    const tripName = ((await tripRow.textContent()) ?? '').replace(/^여정\s*/, '').trim()
    await tripRow.click()
    await page.getByRole('dialog', { name: '여정' }).getByText(tripName, { exact: true }).click()
    await expect(page.getByRole('dialog', { name: '결제 추가' }).getByRole('button', { name: /^여정/ })).toContainText(tripName)
  })

  test('내 지갑: 이번 달 합계 · 결제 추가(진행 중 여정 자동 제안) → 지갑 목록 맨 위', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/wallet')
    await expect(page.getByRole('heading', { name: '내 지갑' })).toBeVisible()
    await expect(page.getByText('이번 달')).toBeVisible()
    await page.getByRole('button', { name: '결제 추가' }).click()
    const sheet = page.getByRole('dialog', { name: '결제 추가' })
    // 개발 목에는 진행 중 여정이 둘(오사카 · 후쿠오카, 시작일 같음) — 어느 쪽이든 기간 안 여정이 미리 정해진다
    const tripRow = sheet.getByRole('button', { name: /^여정/ })
    await expect(tripRow).toContainText(/오사카 3박 4일|후쿠오카/)
    const tripName = ((await tripRow.textContent()) ?? '').replace(/^여정\s*/, '').trim()
    await sheet.getByRole('textbox', { name: '금액' }).fill('1280')
    await sheet.getByRole('textbox', { name: '내용' }).fill('편의점')
    await sheet.getByRole('button', { name: '추가' }).click()
    await expect(page.getByText('추가했어요')).toBeVisible()
    await expect(page.getByRole('button', { name: /편의점/ })).toContainText(`18:34 · ${tripName}`)
  })
})
