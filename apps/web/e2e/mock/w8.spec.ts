import { expect, test, type Page } from '@playwright/test'
import { useMockScenario } from './support'

// W8 QR 코드 초대: QR·공유 링크(/join?code=…) → 첫 화면 위 초대 응답 시트(HF-62) · 비로그인은 로그인(HF-62b) 뒤 같은 시트 ·
// 예외 토스트(HF-62c) · 초대 QR 시트(HF-61). 목 db는 페이지 메모리라 각 테스트는 처음부터 다시 연다.

/** 이 페이지가 보낸 요청 주소(코드가 주소에 실리지 않는지 본다) */
function recordRequests(page: Page) {
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))
  return urls
}

const sheetNamed = (page: Page, groupName: string) => page.getByRole('dialog', { name: `${groupName}에 참여할까요?` })

test.describe('QR 진입 — 로그인 상태(HF-62)', () => {
  test('링크로 열면 주소에서 code가 사라지고 첫 화면 위 시트 → 참여하기 → 시작 전 여정 정보', async ({ page }) => {
    const urls = recordRequests(page)
    await useMockScenario(page)
    await page.goto('/join?code=t4k-9yp')
    const sheet = sheetNamed(page, '도쿄 먹방 여행')
    await expect(sheet).toBeVisible()
    await expect(page).toHaveURL(/\/trips\/trip-osaka\/payments$/)
    await expect(sheet.getByRole('region', { name: '여정 미리보기' })).toContainText('도쿄')
    await expect(sheet.getByRole('region', { name: '여정 미리보기' })).toContainText('태현')
    await expect(sheet.getByRole('region', { name: '여정 미리보기' })).toContainText('3명')
    await expect(sheet.getByRole('button', { name: '닫기' })).toHaveCount(0)
    await sheet.getByRole('button', { name: '참여하기' }).click()
    await expect(page).toHaveURL('/trips/trip-tokyo/info')
    await expect(page.getByRole('heading', { name: '그룹원 4명' })).toBeVisible()
    // 초대코드는 API 주소(경로·쿼리)에 실리지 않는다 — 본문으로만
    expect(urls.filter((url) => url.includes('/api/') && /T4K9YP/i.test(url))).toEqual([])
    // 기록에도 코드가 남지 않는다
    expect(await page.evaluate(() => sessionStorage.getItem('yj:invite:pending'))).toBeNull()
  })

  test('취소 → 참여하지 않고 첫 화면 그대로(다시 열어도 시트는 다시 뜨지 않는다)', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/join?code=T4K9YP')
    const sheet = sheetNamed(page, '도쿄 먹방 여행')
    await sheet.getByRole('button', { name: '취소' }).click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/\/trips\/trip-osaka\/payments$/)
    await page.getByRole('button', { name: /오사카 3박 4일/ }).first().click()
    await expect(page.getByRole('menu')).not.toContainText('도쿄 먹방 여행')
  })

  test('이미 멤버면 시트 없이 그 여정 + "이미 참여한 여정이에요"', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/join?code=B8N4RT')
    await expect(page.getByText('이미 참여한 여정이에요')).toBeVisible()
    await expect(page).toHaveURL('/trips/trip-busan/info')
    await expect(page.getByRole('dialog', { name: /참여할까요/ })).toHaveCount(0)
  })

  test('없는·만료된 코드 → 시트 없이 첫 화면 + "초대코드를 다시 확인해 주세요"', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/join?code=ZZZZZZ')
    await expect(page.getByText('초대코드를 다시 확인해 주세요')).toBeVisible()
    await expect(page).toHaveURL(/\/trips\/trip-osaka\/payments$/)
    await expect(page.getByRole('dialog', { name: /참여할까요/ })).toHaveCount(0)
  })

  test('참여할 수 없는 여정(강퇴 이력) → "참여할 수 없는 여정이에요"', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/join?code=X2P8RW')
    await expect(page.getByText('참여할 수 없는 여정이에요')).toBeVisible()
    await expect(page.getByRole('dialog', { name: /참여할까요/ })).toHaveCount(0)
  })
})

test.describe('QR 진입 — 비로그인(HF-62b)', () => {
  test('기존 회원: 로그인 화면 안내 한 줄 → 카카오 로그인 → 같은 시트 → 참여하기 → 진행 중 여정 결제내역', async ({ page }) => {
    const urls = recordRequests(page)
    await useMockScenario(page, { session: 'ANONYMOUS' })
    await page.addInitScript(() => localStorage.setItem('yj:mock:kakao', 'existing'))
    await page.goto('/join?code=D7N3QA')
    // 로그인 전에는 그룹 이름을 보여 주지 않는다. returnTo에도 코드가 없다
    await expect(page).toHaveURL('/login')
    await expect(page.getByText('초대받은 여정이 있어요')).toBeVisible()
    await expect(page.getByText(/다낭/)).toHaveCount(0)
    await page.getByRole('button', { name: '카카오 로그인' }).click()
    const sheet = sheetNamed(page, '다낭 가족여행')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: '참여하기' }).click()
    await expect(page).toHaveURL('/trips/trip-danang/payments')
    // 링크를 연 첫 문서 요청 말고는 어디에도(로그인 시작 /api/auth/kakao?returnTo= 포함) 코드가 실리지 않는다
    expect(urls.filter((url) => /D7N3QA/i.test(url))).toEqual([`${new URL(page.url()).origin}/join?code=D7N3QA`])
  })

  test('신규 회원: 닉네임 → 약관 → 첫 화면(여정 없음) 위 같은 시트 → 참여하기', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS' })
    await page.goto('/join?code=T4K9YP')
    await expect(page.getByText('초대받은 여정이 있어요')).toBeVisible()
    await page.getByRole('button', { name: '카카오 로그인' }).click()
    await expect(page).toHaveURL('/signup/nickname')
    await page.getByRole('button', { name: '다음' }).click()
    await expect(page.getByRole('heading', { name: '약관에 동의해 주세요' })).toBeVisible()
    await page.getByRole('checkbox', { name: '전체 동의' }).locator('xpath=ancestor::label[1]').click()
    await page.getByRole('button', { name: '다음' }).click()
    const sheet = sheetNamed(page, '도쿄 먹방 여행')
    await expect(sheet).toBeVisible()
    await expect(page).toHaveURL('/trips')
    await sheet.getByRole('button', { name: '참여하기' }).click()
    await expect(page).toHaveURL('/trips/trip-tokyo/info')
  })

  test('30분이 지난 초대는 버린다(안내 없음)', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS' })
    await page.addInitScript(() =>
      sessionStorage.setItem('yj:invite:pending', JSON.stringify({ code: 'T4K9YP', at: Date.now() - 31 * 60_000 })),
    )
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '카카오 로그인' })).toBeVisible()
    await expect(page.getByText('초대받은 여정이 있어요')).toHaveCount(0)
  })
})

test.describe('초대 QR 시트(HF-61)', () => {
  test('HF-11 [초대 QR] → 시트(QR 200 · 코드) → 링크 복사 → "복사했어요"', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/created')
    await page.getByRole('button', { name: '초대 QR' }).click()
    const sheet = page.getByRole('dialog', { name: '초대 QR' })
    const qr = sheet.getByRole('img', { name: '오사카 3박 4일 참여 QR 코드' })
    await expect(qr).toBeVisible()
    const box = await qr.boundingBox()
    expect(box && [Math.round(box.width), Math.round(box.height)]).toEqual([200, 200])
    await expect(sheet).toContainText('K7M-2QX')
    await sheet.getByRole('button', { name: '링크 복사' }).click()
    await expect(page.getByText('복사했어요')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `오사카 3박 4일 초대코드 K7M-2QX\n${new URL(page.url()).origin}/join?code=K7M2QX`,
    )
  })

  test('HF-23 초대코드 행 [초대 QR 36][복사]', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/info')
    const qrButton = page.getByRole('button', { name: '초대 QR' })
    const copy = page.getByRole('button', { name: '초대코드 복사' })
    const [qrBox, copyBox] = await Promise.all([qrButton.boundingBox(), copy.boundingBox()])
    expect(qrBox && [Math.round(qrBox.width), Math.round(qrBox.height)]).toEqual([36, 36])
    expect(qrBox && copyBox && qrBox.x < copyBox.x && Math.round(qrBox.height) === Math.round(copyBox.height)).toBe(true)
    await qrButton.click()
    await expect(page.getByRole('dialog', { name: '초대 QR' })).toContainText('K7M-2QX')
  })
})
