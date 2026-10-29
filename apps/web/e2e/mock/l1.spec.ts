import { expect, test } from '@playwright/test'
import { useMockScenario } from './support'

// L-1 정식 약관 v1.0 게시 · 공지 배너(Q-57, HF-60·60b) · 앱 안 탈퇴(HF-59) · 재동의 화면의 탈퇴.

const NOTICE = '서비스 이용약관과 개인정보처리방침을 게시했어요'

test.describe('공개 약관 페이지(v1.0)', () => {
  test('로그인 없이 /terms · /privacy · /privacy/processors · /consents/PRIVACY · /oss가 v1.0 본문으로 열린다', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS' })
    for (const [url, title, text] of [
      ['/terms', '서비스 이용약관', '제29조(회원의 탈퇴)'],
      ['/privacy', '개인정보처리방침', '개인정보 처리방침'],
      ['/privacy/processors', '개인정보 처리위탁', '위탁 현황'],
      ['/consents/PRIVACY', '개인정보 수집·이용', '개인정보'],
      ['/oss', '오픈소스 라이선스', 'lucide-react'],
    ] as const) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByText('버전 1.0 · 시행일 2026-10-30')).toBeVisible()
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
})

test.describe('공지 배너(HF-60·60b)', () => {
  test('결제내역 헤더 아래 → ✕ 닫기 → 새로고침해도 · 마이페이지에서도 안 보인다', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/payments')
    const banner = page.getByRole('button', { name: NOTICE })
    await expect(banner).toBeVisible()
    await page.getByRole('button', { name: '공지 닫기' }).click()
    await expect(banner).toBeHidden()
    await page.reload()
    await expect(page.getByRole('button', { name: '결제 추가' })).toBeVisible()
    await expect(page.getByRole('button', { name: NOTICE })).toBeHidden()
    await page.goto('/me')
    await expect(page.getByRole('heading', { name: '준용' })).toBeVisible()
    await expect(page.getByRole('button', { name: NOTICE })).toBeHidden()
  })

  test('마이페이지 배너를 누르면 이용약관', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/me')
    await page.getByRole('button', { name: NOTICE }).click()
    await expect(page).toHaveURL(/\/terms$/)
  })
})

test.describe('탈퇴(HF-59)', () => {
  test('마이페이지 "탈퇴" → 확인 체크 → 탈퇴하기 → 탈퇴할까요? → 로그인 + "탈퇴했어요"', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/me')
    await page.getByRole('link', { name: '탈퇴', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: '탈퇴' })).toBeVisible()
    await expect(page.getByText('그룹장은 다음 멤버가 맡아요')).toBeVisible()
    const cta = page.getByRole('button', { name: '탈퇴하기' })
    await expect(cta).toBeDisabled()
    await page.getByText('위 내용을 확인했어요').click()
    await expect(cta).toBeEnabled()
    await cta.click()
    const dialog = page.getByRole('alertdialog', { name: '탈퇴할까요?' })
    await expect(dialog.getByText('되돌릴 수 없어요')).toBeVisible()
    await dialog.getByRole('button', { name: '탈퇴', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('탈퇴했어요')).toBeVisible()
  })

  test('재동의 화면에서 "탈퇴" → 탈퇴 화면(재동의로 되돌아가지 않음)', async ({ page }) => {
    await useMockScenario(page, { reconsent: ['TOS', 'PRIVACY', 'AGE14'] })
    await page.goto('/me')
    await expect(page).toHaveURL(/\/reconsent/)
    await page.getByRole('button', { name: '탈퇴', exact: true }).click()
    await expect(page).toHaveURL(/\/me\/withdraw$/)
    await expect(page.getByRole('heading', { level: 1, name: '탈퇴' })).toBeVisible()
    await expect(page.getByText('참여한 여정에서 모두 나가요')).toBeVisible()
  })
})
