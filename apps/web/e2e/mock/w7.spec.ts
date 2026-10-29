import { expect, test, type Page } from '@playwright/test'
import { useMockScenario } from './support'

// W7 카드 내역 불러오기(WF-49 진입 → 51 동의 → 52 카드사 → 53 로그인 → 54 추가 인증 → 55 → 56 결과 → 49c) · 동의 관리(WF-58).
// 시나리오는 아이디로 고른다(features/card-import/mocks.ts). 목 db는 페이지 메모리에 있어 앱 안에서만 이동한다.

async function toLogin(page: Page) {
  await page.goto('/wallet')
  await page.getByRole('button', { name: '불러오기', exact: true }).click()
  await expect(page.getByText('카드사 로그인 정보')).toBeVisible()
  await expect(page.getByRole('button', { name: '계속' })).toBeDisabled()
  await page.getByText('[필수] 카드 내역 조회 동의').click()
  await page.getByRole('button', { name: '계속' }).click()
  await page.getByRole('button', { name: /신한카드/ }).click()
  await expect(page.getByRole('heading', { name: '신한카드' })).toBeVisible()
}

async function login(page: Page, id: string, password = 'card-pw-1234') {
  await page.getByLabel('아이디').fill(id)
  await page.locator('input[type=password]').fill(password)
  await page.getByRole('button', { name: '불러오기', exact: true }).click()
}

test.describe('카드 내역 불러오기(W7)', () => {
  test('불러오기 성공 → 결과 선택 → 추가 → 지갑 + 토스트', async ({ page }) => {
    await useMockScenario(page, { cardImport: true })
    await toLogin(page)
    const password = page.locator('input[type=password]')
    await expect(password).toHaveAttribute('autocomplete', 'off')
    await expect(page.getByText('비밀번호는 암호화되어 여정도 볼 수 없어요')).toBeVisible()
    await expect(page.getByRole('button', { name: /^기간/ })).toContainText('11.12 – 11.13')
    await login(page, 'junyong88')
    await expect(page.getByRole('heading', { name: '신한카드 · 11건' })).toBeVisible()
    await expect(page.getByText('7건 중 5건')).toBeVisible()
    await expect(page).not.toHaveURL(/junyong88|card-pw/)
    // 전체 선택 → 7건, 다시 → 0건(CTA 비활성), 하나 고르기
    await page.getByText('전체 선택').click()
    await expect(page.getByRole('button', { name: '7건 추가' })).toBeEnabled()
    await page.getByText('전체 선택').click()
    await expect(page.getByRole('button', { name: '0건 추가' })).toBeDisabled()
    await page.getByText('다카시마야 난바점').click()
    await page.getByText('551 호라이 난바본점').click()
    await page.getByRole('button', { name: '2건 추가' }).click()
    await expect(page.getByText('2건을 추가했어요')).toBeVisible()
    await expect(page.getByRole('heading', { name: '내 지갑' })).toBeVisible()
    await expect(page.getByRole('button', { name: /다카시마야 난바점/ })).toBeVisible()
    // 저장소에 아이디·비밀번호가 남지 않는다
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    expect(storage).not.toContain('junyong88')
    expect(storage).not.toContain('card-pw-1234')
  })

  test('추가 인증(문자): 틀린 번호 → 에러 · 맞는 번호 → 결과', async ({ page }) => {
    await useMockScenario(page, { cardImport: true })
    await toLogin(page)
    await login(page, 'twoway')
    await expect(page.getByRole('heading', { name: '추가 인증' })).toBeVisible()
    await expect(page.getByText(/^2:[34]\d$/)).toBeVisible()
    const code = page.getByLabel('인증번호')
    await code.fill('000000')
    await page.getByRole('button', { name: '확인' }).click()
    await expect(page.getByText('인증번호를 확인해 주세요')).toBeVisible()
    await code.fill('123456')
    await page.getByRole('button', { name: '확인' }).click()
    await expect(page.getByText('전체 선택')).toBeVisible()
  })

  test('로그인 실패 1·2·3회 → 53b · 경고 · 53c 쿨다운(불러오기 비활성)', async ({ page }) => {
    await useMockScenario(page, { cardImport: true })
    await toLogin(page)
    await login(page, 'wrong')
    await expect(page.getByText('아이디나 비밀번호가 맞지 않아요')).toBeVisible()
    await expect(page.locator('input[type=password]')).toHaveValue('')
    await login(page, 'wrong')
    await expect(page.getByText('카드사에서 로그인이 잠길 수 있어요')).toBeVisible()
    await login(page, 'wrong')
    await expect(page.getByText(/^\d{2}:\d{2} 이후 다시 시도해 주세요$/)).toBeVisible()
    await page.locator('input[type=password]').fill('again')
    await expect(page.getByRole('button', { name: '불러오기', exact: true })).toBeDisabled()
  })

  test('한도: 남은 횟수 2 캡션 · 호출 한도 57r · 오늘 한도 57d · 남은 횟수 0이면 지갑에서 바로 57d', async ({ page }) => {
    await useMockScenario(page, { cardImport: 'low' })
    await toLogin(page)
    await expect(page.getByText('오늘 2번 더 불러올 수 있어요')).toBeVisible()
    await login(page, 'limit')
    await expect(page.getByText('잠시 후 다시 불러와 주세요')).toBeVisible()
    await expect(page.getByText(/^\d{2}:\d{2}부터 다시 불러올 수 있어요$/)).toBeVisible()
    await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0)
    await page.getByRole('button', { name: '뒤로 가기' }).click()
    await login(page, 'budget')
    await expect(page.getByText('오늘은 더 불러올 수 없어요')).toBeVisible()
    await page.getByRole('button', { name: '직접 추가' }).click()
    await expect(page.getByRole('dialog', { name: '결제 추가' })).toBeVisible()
  })

  test('남은 횟수 0: 지갑 "불러오기" → 57d', async ({ page }) => {
    await useMockScenario(page, { cardImport: 'exhausted' })
    await page.goto('/wallet')
    await page.getByRole('button', { name: '불러오기', exact: true }).click()
    await expect(page.getByText('오늘은 더 불러올 수 없어요')).toBeVisible()
    await expect(page.getByRole('heading', { name: '카드 내역 불러오기' })).toBeVisible()
  })

  test('동의 철회(WF-58 · 58b) → 다음 불러오기에서 다시 동의', async ({ page }) => {
    await useMockScenario(page, { cardImport: true })
    await page.goto('/me')
    await page.getByRole('link', { name: '내 지갑' }).click()
    await page.getByRole('button', { name: '불러오기', exact: true }).click()
    await page.getByText('[필수] 카드 내역 조회 동의').click()
    await page.getByRole('button', { name: '계속' }).click()
    await expect(page.getByRole('heading', { name: '카드사 선택' })).toBeVisible()
    await page.getByRole('button', { name: '뒤로 가기' }).click()
    // 동의한 뒤에는 동의 행이 없다(사실 3줄은 매번)
    await expect(page.getByText('고른 결제만')).toBeVisible()
    await expect(page.getByText('[필수] 카드 내역 조회 동의')).toHaveCount(0)
    await page.getByRole('button', { name: '뒤로 가기' }).click()
    await expect(page.getByRole('heading', { name: '내 지갑' })).toBeVisible()
    await page.getByRole('button', { name: '뒤로 가기' }).click()
    await page.getByRole('link', { name: '동의 관리' }).click()
    await expect(page.getByText('카드 내역 조회 동의')).toBeVisible()
    await page.getByRole('button', { name: '카드 내역 조회 동의 철회' }).click()
    const dialog = page.getByRole('alertdialog', { name: '동의를 철회할까요?' })
    await dialog.getByRole('button', { name: '철회' }).click()
    await expect(page.getByText('철회했어요')).toBeVisible()
    // 유효 동의가 0건 → HF-30으로 돌아가고 "동의 관리" 행이 사라진다
    await expect(page.getByRole('heading', { name: '마이페이지' })).toBeVisible()
    await expect(page.getByRole('link', { name: '동의 관리' })).toHaveCount(0)
  })

  test('WF-51 동의 행 ›: 앱 안에서 전문을 열고 ‹로 WF-51에 돌아온다(체크 유지 · 새로고침 없음)', async ({ page }) => {
    await useMockScenario(page, { cardImport: true })
    await page.goto('/wallet')
    await page.getByRole('button', { name: '불러오기', exact: true }).click()
    await page.getByText('[필수] 카드 내역 조회 동의').click()
    const check = page.getByRole('checkbox', { name: /카드 내역 조회 동의/ })
    await expect(check).toBeChecked()
    // 전체 새로고침이면 이 표시가 사라진다
    await page.evaluate(() => Object.assign(window, { __noReload: true }))
    await page.getByRole('link', { name: '카드 내역 조회 동의 전문' }).click()
    await expect(page).toHaveURL(/\/consents\/CARD_IMPORT$/)
    await page.getByRole('button', { name: '뒤로 가기' }).click()
    await expect(page).toHaveURL(/\/wallet\/import$/)
    await expect(page.getByText('카드사 로그인 정보')).toBeVisible()
    await expect(check).toBeChecked()
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
    await page.getByRole('button', { name: '계속' }).click()
    await expect(page.getByRole('heading', { name: '카드사 선택' })).toBeVisible()
  })

  test('동의가 남은 채 WF-53 · 56에서 새로고침 · 떠났다 돌아오기 → 빈 WF-53이 아니라 WF-51부터', async ({ page }) => {
    await useMockScenario(page, { cardImport: true, cardImportConsent: true })
    const toLoginConsented = async () => {
      await page.goto('/wallet')
      await page.getByRole('button', { name: '불러오기', exact: true }).click()
      // 동의가 남아 있어 체크 행 없이 바로 계속
      await expect(page.getByText('고른 결제만')).toBeVisible()
      await expect(page.getByText('[필수] 카드 내역 조회 동의')).toHaveCount(0)
      await page.getByRole('button', { name: '계속' }).click()
      await page.getByRole('button', { name: /신한카드/ }).click()
      await expect(page.getByLabel('아이디')).toBeVisible()
    }
    const expectStart = async () => {
      await expect(page).toHaveURL(/\/wallet\/import$/)
      await expect(page.getByText('카드사 로그인 정보')).toBeVisible()
      await expect(page.getByLabel('아이디')).toHaveCount(0)
    }

    // WF-53 새로고침(목 동의 유지 — 새로고침해도 동의가 남아 체크 행이 없다)
    await toLoginConsented()
    await page.reload()
    await expectStart()
    await expect(page.getByText('[필수] 카드 내역 조회 동의')).toHaveCount(0)
    // WF-51에서 다시 이어진다
    await page.getByRole('button', { name: '계속' }).click()
    await page.getByRole('button', { name: /신한카드/ }).click()
    await expect(page.getByLabel('아이디')).toBeVisible()

    // WF-56 결과에서 새로고침
    await login(page, 'junyong88')
    await expect(page.getByText('전체 선택')).toBeVisible()
    await page.reload()
    await expectStart()
    await expect(page.getByText('다카시마야 난바점')).toHaveCount(0)

    // WF-53에서 다른 문서로 떠났다가 뒤로(bfcache든 새로 불러오든)
    await toLoginConsented()
    await page.getByLabel('아이디').fill('junyong88')
    await page.goto('/licenses')
    await page.goBack()
    await expectStart()
  })

  test('기능이 꺼져 있으면 진입점이 없다 · 동의가 없으면 "동의 관리"도 없다', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/wallet')
    await expect(page.getByText('이번 달')).toBeVisible()
    await expect(page.getByRole('button', { name: '불러오기', exact: true })).toHaveCount(0)
    await page.goto('/me')
    await expect(page.getByText('로그아웃')).toBeVisible()
    await expect(page.getByRole('link', { name: '동의 관리' })).toHaveCount(0)
  })
})
