import { expect, test, type Page } from '@playwright/test'
import { useMockScenario } from './support'

// W7e 카드 불러오기 보강(실제 브라우저 · MSW 목): HF-52 로고 9행 · HF-53 로그인 안내 · 현대·하나 HF-53h 카드 확인 ·
// 잠김 방지(HF-53hb · 53hd · 57h · lockout/ack). 시나리오는 아이디로 고른다(features/card-import/mocks.ts):
// "badcard" = 카드번호 오류, "badpin" = 카드 비밀번호 오류(현대·하나는 1회 → 400, 확인 후 또 틀리면 429 잠김).
// 테스트용 카드번호(Mastercard 테스트 번호 — 실제 카드 아님)
const PAN = '5555555555554444'
const PAN_SPACED = '5555 5555 5555 4444'
const PAN_MASKED = '5555 •••• •••• 4444'
const LOCKED_TITLE = '현대카드 홈페이지에서 먼저 확인해 주세요'

async function toIssuerList(page: Page) {
  await page.goto('/wallet')
  await page.getByRole('button', { name: '불러오기', exact: true }).click()
  await page.getByText('[필수] 카드 내역 조회 동의').click()
  await page.getByRole('button', { name: '계속' }).click()
  await expect(page.getByRole('heading', { name: '카드사 선택' })).toBeVisible()
}

async function toHyundai(page: Page) {
  await toIssuerList(page)
  await page.getByRole('button', { name: '현대카드' }).click()
  await expect(page.getByRole('heading', { name: '현대카드' })).toBeVisible()
}

const cardNumber = (page: Page) => page.getByLabel('카드번호')
const cardPassword = (page: Page) => page.getByLabel('카드 비밀번호 4자리')
const password = (page: Page) => page.getByLabel('비밀번호', { exact: true })
const fetchButton = (page: Page) => page.getByRole('button', { name: '불러오기', exact: true })

/** 아이디·비밀번호·(카드번호)·카드 비밀번호. 카드번호는 비워 두면 그대로 둔다(화면에 남아 있는 값) */
async function fillHyundai(page: Page, id: string, { pan = PAN, pin = '1234' }: { pan?: string; pin?: string } = {}) {
  await page.getByLabel('아이디').fill(id)
  await password(page).fill('card-pw-1234')
  if (pan) await cardNumber(page).fill(pan)
  await cardPassword(page).fill(pin)
}

/** 잠긴 상태(HF-57h)까지: 1회 실패 → 다이얼로그 "다시 시도" → 2회 실패 */
async function lockOut(page: Page, { pan }: { pan?: string } = {}) {
  await fillHyundai(page, 'badpin', { pan })
  await fetchButton(page).click()
  await expect(page.getByRole('alert')).toHaveText('한 번 더 틀리면 카드사에서 잠길 수 있어요')
  await fillHyundai(page, 'badpin', { pan: '' })
  await fetchButton(page).click()
  const dialog = page.getByRole('alertdialog', { name: '한 번 더 틀리면 카드사에서 잠길 수 있어요' })
  await dialog.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByRole('heading', { name: LOCKED_TITLE })).toBeVisible()
}

test.describe('카드 불러오기 보강(W7e)', () => {
  test('HF-52 로고 9행(Figma 순서) · HF-53 안내 블록(고정 URL · 새 탭 · noopener noreferrer)', async ({ page }) => {
    await useMockScenario(page, { cardImport: true })
    await toIssuerList(page)
    const rows = page.getByRole('listitem')
    await expect(rows).toHaveText(['KB국민카드', '삼삼성카드', 'NH농협카드', 'BC카드', '신한카드', '우리카드', '롯롯데카드', '현현대카드', '하나카드'])
    // 로고 6곳은 실제로 그려진다(이미지가 로드됨), 3곳은 이니셜
    const logos = page.locator('[data-issuer-tile] img')
    await expect(logos).toHaveCount(6)
    for (const img of await logos.all()) {
      await expect(img).toBeVisible()
      expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
    }
    const tile = page.locator('[data-issuer-tile="0306"]')
    expect(await tile.evaluate((el) => [el.getBoundingClientRect().width, getComputedStyle(el).borderTopWidth])).toEqual([40, '1px'])
    await expect(page.locator('[data-issuer-tile="0302"]')).toHaveText('현')

    await page.getByRole('button', { name: '신한카드' }).click()
    await expect(page.getByText('신한카드 홈페이지 아이디·비밀번호예요')).toBeVisible()
    await expect(page.getByText('아이디가 없으면 홈페이지에서 만들고 로그인되는지 확인해 주세요')).toBeVisible()
    const link = page.getByRole('link', { name: '신한카드 홈페이지 ›' })
    await expect(link).toHaveAttribute('href', 'https://www.shinhancard.com/mob/MOBFM001N/MOBFM001C01.shc')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(page.getByLabel('카드번호')).toHaveCount(0)
  })

  test('현대 로그인 성공: 카드 칸 속성 · blur 가림 · 결과 · 저장소/URL에 카드번호 없음', async ({ page }) => {
    await useMockScenario(page, { cardImport: true })
    const sent: string[] = []
    page.on('request', (req) => {
      if (req.url().endsWith('/api/card-import/fetch')) sent.push(req.postData() ?? '')
    })
    await toHyundai(page)
    await expect(page.getByText('현대카드는 카드번호와 카드 비밀번호로 한 번 더 확인해요')).toBeVisible()
    await expect(page.getByRole('link', { name: '현대카드 홈페이지 ›' })).toHaveAttribute('href', 'https://www.hyundaicard.com/cpm/mb/CPMMB0101_01.hc')
    await expect(cardNumber(page)).toHaveAttribute('autocomplete', 'off')
    await expect(cardNumber(page)).toHaveAttribute('inputmode', 'numeric')
    // Chromium은 -webkit-text-security를 지원 → type=text + CSS로 가림(비밀번호 관리자 저장 제안을 피함)
    await expect(cardPassword(page)).toHaveAttribute('type', 'text')
    await expect(cardPassword(page)).toHaveAttribute('autocomplete', 'one-time-code')
    expect(await cardPassword(page).evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-text-security'))).toBe('disc')
    await expect(page.getByRole('button', { name: '비밀번호 보기' })).toHaveCount(1)

    await fillHyundai(page, 'junyong88')
    // 포커스가 떠나면 가운데 가림, 다시 포커스하면 전체
    await expect(cardNumber(page)).toHaveValue(PAN_MASKED)
    await cardNumber(page).focus()
    await expect(cardNumber(page)).toHaveValue(PAN_SPACED)
    await cardPassword(page).focus()
    await expect(cardNumber(page)).toHaveValue(PAN_MASKED)
    // 폼은 스크롤 영역 안, CTA는 밖(키보드 위 고정)
    expect(await fetchButton(page).evaluate((el) => el.closest('main') === null)).toBe(true)
    await fetchButton(page).click()
    await expect(page.getByRole('heading', { name: '현대카드 · 11건' })).toBeVisible()
    expect(sent).toHaveLength(1)
    const body = JSON.parse(sent[0]) as Record<string, unknown>
    expect(body.loginCardNo).toBe(PAN)
    expect(typeof body.encryptedCardPassword).toBe('string')
    expect(sent[0]).not.toContain('"1234"')
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage, url: location.href, state: history.state }))
    expect(storage).not.toContain(PAN)
    expect(storage).not.toContain('5555 5555')
  })

  test('카드번호 오류(CARD_NUMBER_INVALID): 카드번호 유지 + 포커스 · 비밀번호들은 비움', async ({ page }) => {
    await useMockScenario(page, { cardImport: true })
    await toHyundai(page)
    await fillHyundai(page, 'badcard')
    await fetchButton(page).click()
    await expect(page.getByRole('alert')).toHaveText('카드번호를 다시 확인해 주세요')
    await expect(cardNumber(page)).toBeFocused()
    await expect(cardNumber(page)).toHaveValue(PAN_SPACED)
    await expect(cardNumber(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(cardPassword(page)).toHaveValue('')
    await expect(password(page)).toHaveValue('')
    await expect(page.getByLabel('아이디')).toHaveValue('badcard')
  })

  test('1회 실패 → 다이얼로그(취소 유지) → 2회 차단 HF-57h → 확인했어요(이르면 토스트) → 30분 뒤 → HF-53h → 재시도 성공', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-13T12:00:00+09:00') })
    await useMockScenario(page, { cardImport: true })
    await toHyundai(page)
    await fillHyundai(page, 'badpin')
    await fetchButton(page).click()
    // HF-53hb
    await expect(page.getByRole('alert')).toHaveText('한 번 더 틀리면 카드사에서 잠길 수 있어요')
    await expect(cardPassword(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(cardPassword(page)).toHaveValue('')
    await expect(cardNumber(page)).toHaveValue(PAN_MASKED)
    // HF-53hd — 취소하면 그대로
    await fillHyundai(page, 'badpin', { pan: '' })
    await fetchButton(page).click()
    const dialog = page.getByRole('alertdialog', { name: '한 번 더 틀리면 카드사에서 잠길 수 있어요' })
    await expect(dialog.getByText('현대카드 홈페이지에서 먼저 로그인해 보세요')).toBeVisible()
    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()
    await expect(cardPassword(page)).toHaveValue('1234')
    await fetchButton(page).click()
    await dialog.getByRole('button', { name: '다시 시도' }).click()
    // HF-57h
    await expect(page.getByRole('heading', { name: LOCKED_TITLE })).toBeVisible()
    await expect(page.getByText('아이디·비밀번호·카드 비밀번호로 로그인되는지 확인해요')).toBeVisible()
    await expect(page.getByRole('link', { name: '현대카드 홈페이지 ›' })).toHaveAttribute('rel', 'noopener noreferrer')
    // 잠긴 직후: 429 TOO_EARLY → 화면 유지 + "12:30 이후 다시 눌러 주세요"(KST)
    await page.getByRole('button', { name: '확인했어요' }).click()
    await expect(page.getByText(/^12:3[01] 이후 다시 눌러 주세요$/)).toBeVisible()
    await expect(page.getByRole('heading', { name: LOCKED_TITLE })).toBeVisible()
    // 30분 지나 → 204 → HF-53h(아이디·카드번호 유지, 비밀번호들 비움)
    await page.clock.fastForward('31:00')
    await page.getByRole('button', { name: '확인했어요' }).click()
    await expect(page.getByLabel('아이디')).toHaveValue('badpin')
    await expect(cardNumber(page)).toHaveValue(PAN_MASKED)
    await expect(cardPassword(page)).toHaveValue('')
    await expect(password(page)).toHaveValue('')
    // 카운터 0 → 다이얼로그 없이 성공
    await fillHyundai(page, 'junyong88', { pan: '' })
    await fetchButton(page).click()
    await expect(page.getByRole('heading', { name: '현대카드 · 11건' })).toBeVisible()
  })

  test('확인했어요 하루 2회 초과(429 DAILY_LIMIT): 토스트 + "확인했어요" 비활성, 직접 추가 → 수동 추가 시트', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-13T09:00:00+09:00') })
    await useMockScenario(page, { cardImport: true })
    await toHyundai(page)
    await lockOut(page)
    // 하루 2회까지는 풀린다
    for (let i = 0; i < 2; i += 1) {
      await page.clock.fastForward('31:00')
      await page.getByRole('button', { name: '확인했어요' }).click()
      await expect(page.getByLabel('아이디')).toHaveValue('badpin')
      await lockOut(page, { pan: '' })
    }
    await page.clock.fastForward('31:00')
    await page.getByRole('button', { name: '확인했어요' }).click()
    await expect(page.getByText('오늘은 더 시도할 수 없어요')).toBeVisible()
    await expect(page.getByRole('button', { name: '확인했어요' })).toBeDisabled()
    await expect(page.getByRole('heading', { name: LOCKED_TITLE })).toBeVisible()
    await page.getByRole('button', { name: '직접 추가' }).click()
    await expect(page.getByRole('dialog', { name: '결제 내역 추가' })).toBeVisible()
  })
})
