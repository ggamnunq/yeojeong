import { expect, test, type Page } from '@playwright/test'
import { useMockScenario } from './support'

// W5C(웹 통합 3차): 여행 장소 자유 입력 · 현지 통화 · returnTo(신규 회원) · HF-08 뒤로 · HF-26 시트 · HF-25 딥링크 · 토스트 자리 · 목 시점 전환.

const JOIN = '/join#code=T4K9YP'

/**
 * 비로그인으로 공유 링크를 열고 카카오(목: 신규 회원) → 닉네임 → 약관 → 토스 연결 안내까지. 시나리오는 ANONYMOUS로 먼저 건다.
 * W8부터 링크의 코드는 앱 시작 때 이 탭에 보관되고 주소(로그인 returnTo 포함)에서 빠진다 — 가입을 마치면 첫 화면 위 초대 시트(HF-62)
 */
async function signupFromInviteLink(page: Page) {
  await page.goto(JOIN)
  await expect(page).toHaveURL('/login')
  await page.getByRole('button', { name: '카카오 로그인' }).click()
  await expect(page).toHaveURL('/signup/nickname')
  await page.getByRole('button', { name: '다음' }).click()
  await expect(page.getByRole('heading', { name: '약관에 동의해 주세요' })).toBeVisible()
  await page.getByRole('checkbox', { name: '전체 동의' }).locator('xpath=ancestor::label[1]').click()
  await page.getByRole('button', { name: '다음' }).click()
  await expect(page.getByRole('heading', { name: '토스 지갑을 연결해 주세요' })).toBeVisible()
}

test.describe('신규 회원도 가입 단계를 마치면 초대 응답 시트(QA ③ HF-12 → W8 HF-62, 토스 연결 켬)', () => {
  test('닉네임 → 약관 → 토스 안내 「나중에」 → 첫 화면 위 「도쿄 먹방 여행에 참여할까요?」', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS', accountLink: true })
    await signupFromInviteLink(page)
    await page.getByRole('button', { name: '나중에' }).click()
    await expect(page).toHaveURL('/trips')
    const sheet = page.getByRole('dialog', { name: '도쿄 먹방 여행에 참여할까요?' })
    await expect(sheet.getByRole('region', { name: '여정 미리보기' })).toContainText('도쿄')
    await expect(sheet.getByRole('button', { name: '참여하기' })).toBeEnabled()
  })

  test('토스 연결 → WF-08에서 브라우저 뒤로 가기 = 「여정으로 가기」(토스 안내로 돌아가지 않음, HF-08)', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS', accountLink: true })
    await signupFromInviteLink(page)
    // 인증 창(목: about:blank)은 새 창으로 열리고 이 탭은 대기 화면 → 목이 다음 폴링에서 인증 완료로 바꾼다
    await page.getByRole('button', { name: '토스로 연결' }).click()
    const sheet = page.getByRole('dialog', { name: '금융정보 연동 동의' })
    await sheet.getByRole('checkbox', { name: '전체 동의' }).locator('xpath=ancestor::label[1]').click()
    await sheet.getByRole('button', { name: '동의하고 연결' }).click()
    await expect(page.getByRole('heading', { name: '불러올 계좌·카드' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /개 연결$/ }).click()
    await expect(page.getByRole('heading', { name: '연결 완료' })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL('/trips')
    await expect(page.getByRole('dialog', { name: '도쿄 먹방 여행에 참여할까요?' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '토스 지갑을 연결해 주세요' })).toHaveCount(0)
  })
})

test.describe('여정 만들기(HF-10 · 10b · 11)', () => {
  test('여행 장소 자유 입력 · 현지 통화(기본값 없음, 고르면 닫힘) · 달력 기간 → 만들기 → 생성 완료(✕ 헤더)', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/new')
    const submit = page.getByRole('button', { name: '여정 만들기' })
    await page.getByLabel('그룹명').fill('오사카 3박 4일')
    await page.getByLabel('여행 장소').fill('오사카')
    const currency = page.getByRole('button', { name: /^현지 통화/ })
    await expect(currency).toContainText('선택')
    await expect(submit).toBeDisabled()

    await currency.click()
    const currencySheet = page.getByRole('dialog', { name: '현지 통화' })
    await expect(currencySheet.getByRole('button').nth(1)).toHaveText('KRW · 대한민국 원')
    await currencySheet.getByRole('button', { name: 'JPY · 일본 엔' }).click()
    await expect(currencySheet).toBeHidden()
    await expect(currency).toContainText('JPY · 일본 엔')

    await page.getByRole('button', { name: /^기간/ }).click()
    const period = page.getByRole('dialog', { name: '기간' })
    // 달력은 오늘(개발 서버 기기 시계)의 달에서 연다 → 2027년 1월까지 넘긴다
    const january = period.getByRole('button', { name: /^2027년 1월 7일/ })
    for (let i = 0; i < 24 && !(await january.isVisible()); i++) await period.getByRole('button', { name: '다음 달' }).click()
    await january.click()
    await period.getByRole('button', { name: /^2027년 1월 10일/ }).click()
    await period.getByRole('button', { name: '확인' }).click()
    await expect(page.getByRole('button', { name: /^기간/ })).toContainText('2027.01.07 (목) – 2027.01.10 (일)')

    await page.getByLabel('예산').fill('1200000')
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByRole('heading', { name: '여정을 만들었어요' })).toBeVisible()
    await page.getByRole('button', { name: '닫기' }).click()
    await expect(page).toHaveURL(/\/trips\/trip-[\w-]+\/info$/)
    await expect(page.locator('main')).toContainText('오사카 · 3박 4일 · 예산 ₩1,200,000')
  })
})

test.describe('정산(HF-25 · 26 · 44)', () => {
  test('진행 중 여정의 /settlement 딥링크 → 현황 탭', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/settlement')
    await expect(page).toHaveURL('/trips/trip-osaka/stats')
  })

  test('멤버별 내역의 공동 결제 행 → HF-26 위 잠금 시트(정산 하위 주소) → 닫으면 HF-26 그대로', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-jeju/settlement')
    await page.getByRole('button', { name: /민지/ }).click()
    await expect(page).toHaveURL('/trips/trip-jeju/settlement/mem-jeju-minji')
    await page.getByRole('button', { name: /제주 렌터카 공항점/ }).click()
    await expect(page).toHaveURL('/trips/trip-jeju/settlement/mem-jeju-minji/payments/jeju-rentcar')
    const sheet = page.getByRole('dialog', { name: '제주 렌터카 공항점' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: '닫기' }).click()
    await expect(page).toHaveURL('/trips/trip-jeju/settlement/mem-jeju-minji')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('민지')
    // 남의 「비공개」 줄은 버튼이 아니다
    await expect(page.getByText('비공개')).toBeVisible()
    await expect(page.getByRole('button', { name: /비공개/ })).toHaveCount(0)
  })

  test('탈퇴한 멤버 상세 주소로 바로 오면 서버 404 → 정산 요약', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-jeju/settlement/mem-jeju-withdrawn')
    await expect(page).toHaveURL('/trips/trip-jeju/settlement')
  })
})

test.describe('토스트 자리 · 수명(화면명세 0-4 v0.5.8)', () => {
  test('하단 내비가 없으면 하단 CTA 위 16(HF-11 복사), 시트가 열리면 바로 닫힌다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/created')
    await page.getByRole('button', { name: '복사' }).click()
    const toast = page.getByRole('status').filter({ hasText: '복사했어요' })
    await expect(toast).toBeVisible()
    const cta = await page.getByRole('button', { name: '여정으로 가기' }).boundingBox()
    const box = await toast.boundingBox()
    expect(cta && box && Math.round(cta.y - (box.y + box.height))).toBeGreaterThanOrEqual(16)
  })

  test('결제내역에서 토스트가 떠 있을 때 결제 상세 시트를 열면 토스트가 바로 닫힌다', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/info')
    await page.getByRole('button', { name: '초대코드 복사' }).click()
    await expect(page.getByText('복사했어요')).toBeVisible()
    await page.getByRole('button', { name: '여정 종료하기' }).click()
    await expect(page.getByRole('alertdialog', { name: '여정을 종료할까요?' })).toBeVisible()
    await expect(page.getByText('복사했어요')).toHaveCount(0)
  })
})

test.describe('목 시점 전환 · 5명 넘는 여정(QA 도구)', () => {
  test('?mockAs=member: 오사카를 멤버(민지)로 — 종료·연필 없음', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/info?mockAs=member')
    await expect(page.getByText('여행 중')).toBeVisible()
    await expect(page.getByRole('button', { name: '여정 종료하기' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '여정 정보 수정' })).toHaveCount(0)
  })

  test('후쿠오카 6인 여행: 그룹원 6명 · 긴 장소는 한 줄 말줄임(뒤의 예산은 남는다)', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-fukuoka/info')
    await expect(page.getByRole('heading', { name: '그룹원 6명' })).toBeVisible()
    const meta = page.locator('main p').filter({ hasText: '예산 ₩3,000,000' })
    await expect(meta).toBeVisible()
    // 장소 부분만 말줄임(넘친 폭이 있고), 메타 줄은 한 줄
    const place = meta.getByText(/^후쿠오카/)
    expect(await place.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await expect(meta).toContainText('· 예산 ₩3,000,000')
    const [placeBox, metaBox] = await Promise.all([place.boundingBox(), meta.boundingBox()])
    expect(placeBox && metaBox && placeBox.y + placeBox.height <= metaBox.y + metaBox.height).toBe(true)
    expect((await page.getByText('· 예산 ₩3,000,000').boundingBox())?.y).toBe(placeBox?.y)
  })
})
