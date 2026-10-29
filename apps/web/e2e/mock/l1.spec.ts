import { expect, test } from '@playwright/test'
import { LEGAL_DOCUMENT_VERSIONS, LEGAL_RELEASES } from '@yeojeong/shared'
import { useMockScenario } from './support'

// L-1 정식 약관 게시 · 공지 배너(Q-57, HF-60·60b) · 앱 안 탈퇴(HF-59) · 재동의 화면의 탈퇴.
// L-1b 0.x 재번호(게시 당시 1.0 = 0.1) · 0.2 판(문서별 시행일: 개인정보 문서 = 게시일, 이용약관 = 게시일 + 7일) · ?v= 이전·예정 판.
// 판은 시각으로 바뀌므로 시계를 고정한다. 0.2 게시일(머지하는 날)은 legal-manifest에서 읽는다(실제 날짜와 무관).

const MANIFEST = LEGAL_DOCUMENT_VERSIONS
const PUBLISHED_02 = LEGAL_RELEASES.find((r) => r.dir === 'v0.2')!.published
const TERMS_01 = MANIFEST['terms.md'][0]
const TERMS_02 = MANIFEST['terms.md'].find((v) => v.version === '0.2')!
const kst = (date: string, time = '12:00:00') => new Date(`${date}T${time}+09:00`)
/** 모든 판이 시행된 뒤 */
const ALL_IN_FORCE = new Date(kst(Object.values(MANIFEST).flat().map((v) => v.effectiveDate).sort().at(-1)!).getTime() + 86_400_000)
const latest = (file: string) => MANIFEST[file].at(-1)!
const meta = (v: { version: string; effectiveDate: string }) => `버전 ${v.version} · 시행일 ${v.effectiveDate}`
const NOTICE = `이용약관이 바뀌어요 · ${TERMS_02.effectiveDate.slice(5).replace('-', '.')}부터`
const NEXT_NOTICE = '개인정보처리방침을 바로잡고 카드 불러오기 안내를 더했어요'

test.describe('공개 약관 페이지(0.x)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(ALL_IN_FORCE)
  })

  test('로그인 없이 /terms · /privacy · /privacy/processors · /consents/PRIVACY · /consents/CARD_IMPORT · /oss가 현행 판으로 열린다', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS' })
    for (const [url, title, file, text] of [
      ['/terms', '서비스 이용약관', 'terms.md', '제29조(회원의 탈퇴)'],
      ['/privacy', '개인정보처리방침', 'privacy.md', '개인정보 처리방침'],
      ['/privacy/processors', '개인정보 처리위탁', 'processors.md', '위탁 현황'],
      ['/consents/PRIVACY', '개인정보 수집·이용', 'consent-collection.md', '개인정보'],
      ['/consents/CARD_IMPORT', '카드 승인내역 불러오기', 'consent-card-import.md', '카드'],
      ['/oss', '오픈소스 라이선스', 'licenses.md', 'lucide-react'],
    ] as const) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByText(meta(latest(file)))).toBeVisible()
      await expect(page.getByText(text).first()).toBeVisible()
      await expect(page.locator('body')).not.toContainText('{{')
      await expect(page.locator('body')).not.toContainText('본문 준비 중')
    }
  })

  test('예전 주소 /licenses → /oss, 처리방침 안 처리위탁 고지 링크는 앱 안에서 연다', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS' })
    await page.goto('/licenses')
    await expect(page).toHaveURL(/\/oss$/)
    await page.goto('/privacy')
    await page.getByRole('link', { name: 'https://jinyeojeong.com/privacy/processors' }).click()
    await expect(page).toHaveURL(/\/privacy\/processors$/)
    await expect(page.getByRole('heading', { level: 1, name: '개인정보 처리위탁' })).toBeVisible()
  })

  test('처리방침 맨 아래 "이전 버전 · 0.1(…) ›" → ?v=0.1(안내) · 옛 표기 ?v=1.0도 0.1', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS' })
    for (const url of ['/privacy', '/privacy/processors', '/consents/PRIVACY']) {
      await page.goto(url)
      await page.getByRole('link', { name: /^이전 버전 · 0\.1\(2026-10-30 ~ / }).click()
      await expect(page).toHaveURL(new RegExp(`${url.replaceAll('/', '\\/')}\\?v=0\\.1$`))
      await expect(page.getByText(meta(MANIFEST['privacy.md'][0]))).toBeVisible()
      await expect(page.getByText(/^이전 버전 0\.1이에요\. 2026-10-30 ~ /)).toBeVisible()
    }
    await page.goto('/privacy?v=1.0')
    await expect(page.getByText(meta(MANIFEST['privacy.md'][0]))).toBeVisible()
    await page.goto('/oss?v=0.2')
    await expect(page.getByText(meta(latest('licenses.md')))).toBeVisible()
    await expect(page.getByRole('navigation', { name: '다른 버전' })).toBeHidden()
  })
})

test.describe('이용약관 0.2 시행 전(게시일)', () => {
  test('/terms는 0.1 + "예정 버전 · 0.2(MM-DD부터)" → 예정본(안내 · 함께 바뀐 문서) → 현행으로', async ({ page }) => {
    await page.clock.setFixedTime(kst(PUBLISHED_02))
    await useMockScenario(page, { session: 'ANONYMOUS' })
    await page.goto('/terms')
    await expect(page.getByText(meta(TERMS_01))).toBeVisible()
    await page.getByRole('link', { name: `예정 버전 · 0.2(${TERMS_02.effectiveDate.slice(5)}부터)` }).click()
    await expect(page).toHaveURL(/\/terms\?v=0\.2$/)
    await expect(page.getByText(meta(TERMS_02))).toBeVisible()
    await expect(page.getByText(`예정 버전 0.2이에요. ${TERMS_02.effectiveDate}부터 적용돼요`)).toBeVisible()
    const companions = page.getByRole('region', { name: '함께 바뀐 문서' })
    await expect(companions.getByText(NEXT_NOTICE)).toBeVisible()
    await companions.getByRole('link', { name: `개인정보처리방침 0.2(${PUBLISHED_02}부터)` }).click()
    await expect(page).toHaveURL(/\/privacy\?v=0\.2$/)
    await expect(page.getByRole('heading', { level: 1, name: '개인정보처리방침' })).toBeVisible()
    await page.goto('/terms?v=0.2')
    await page.getByRole('link', { name: /^현행 버전 · 0\.1\(2026-10-30 ~ / }).click()
    await expect(page).toHaveURL(/\/terms$/)
    await expect(page.getByText(meta(TERMS_01))).toBeVisible()
  })
})

test.describe('공지 배너(HF-60·60b)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(kst(PUBLISHED_02))
  })

  test('결제내역 헤더 아래 → ✕ 닫기 → 다음 공지 하나 → 새로고침해도 · 마이페이지에서도 닫은 공지는 안 보인다', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/payments')
    const banner = page.getByRole('button', { name: NOTICE })
    await expect(banner).toBeVisible()
    // 한 번에 하나(이용약관 개정 예고가 먼저)
    await expect(page.getByRole('button', { name: NEXT_NOTICE })).toBeHidden()
    await page.getByRole('button', { name: '공지 닫기' }).click()
    await expect(banner).toBeHidden()
    await expect(page.getByRole('button', { name: NEXT_NOTICE })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: '결제 내역 추가' })).toBeVisible()
    await expect(page.getByRole('button', { name: NOTICE })).toBeHidden()
    await page.goto('/me')
    await expect(page.getByRole('heading', { name: '준용' })).toBeVisible()
    await expect(page.getByRole('button', { name: NOTICE })).toBeHidden()
  })

  test('마이페이지 배너를 누르면 이용약관 예정본(0.2)', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/me')
    await page.getByRole('button', { name: NOTICE }).click()
    await expect(page).toHaveURL(/\/terms\?v=0\.2$/)
    await expect(page.getByText(`예정 버전 0.2이에요. ${TERMS_02.effectiveDate}부터 적용돼요`)).toBeVisible()
  })
})

