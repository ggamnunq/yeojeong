import { expect, test } from '@playwright/test'
import { useMockScenario } from './support'

// W5B 화면(DS v1.5 적용 · 탈퇴한 멤버 · 약관 구조 · 결제수단 0개 규칙)을 목 개발 서버에서 실제 브라우저로 확인한다.

test.describe('가입 · 약관(HF-03·04·05·05b)', () => {
  test('닉네임(Input L) → 약관 Row/Consent → › 전문 → 돌아와도 체크 유지 → 가입 → 토스 연결 안내(나중에)', async ({ page }) => {
    await useMockScenario(page, { session: 'SIGNUP_REQUIRED', accountLink: true })
    await page.goto('/signup/nickname')
    const nickname = page.getByRole('textbox', { name: '닉네임' })
    await expect(nickname).toHaveValue('준용')
    await expect(page.getByText('중복 가능 · 2/10')).toBeVisible()
    await page.getByRole('button', { name: '다음' }).click()

    await expect(page.getByRole('heading', { name: '약관에 동의해 주세요' })).toBeVisible()
    const next = page.getByRole('button', { name: '다음' })
    await expect(next).toBeDisabled()
    // 체크 상자는 화면에서 숨긴 input이라 행(label)을 누른다
    await page.getByRole('checkbox', { name: /\[필수\] 서비스 이용약관/ }).locator('xpath=..').click()
    await expect(page.getByRole('checkbox', { name: /\[필수\] 서비스 이용약관/ })).toBeChecked()
    await page.getByRole('link', { name: '서비스 이용약관 전문' }).click()
    await expect(page).toHaveURL(/\/consents\/TOS$|\/terms$/)
    await expect(page.locator('[data-legal-body]')).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('checkbox', { name: /\[필수\] 서비스 이용약관/ })).toBeChecked()

    await page.getByRole('checkbox', { name: '전체 동의' }).locator('xpath=ancestor::label[1]').click()
    await expect(page.getByRole('checkbox', { name: '전체 동의' })).toBeChecked()
    await next.click()
    await expect(page.getByRole('heading', { name: '토스 지갑을 연결해 주세요' })).toBeVisible()
    await expect(page.getByRole('button', { name: '나중에' })).toBeVisible()

    await page.getByRole('button', { name: '토스로 연결' }).click()
    const sheet = page.getByRole('dialog', { name: '금융정보 연동 동의' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: '동의하고 연결' })).toBeDisabled()
    await sheet.getByRole('checkbox', { name: '전체 동의' }).locator('xpath=ancestor::label[1]').click()
    await expect(sheet.getByRole('button', { name: '동의하고 연결' })).toBeEnabled()
  })
})

test.describe('현황 · 정산(HF-22·25)', () => {
  test('현황: StatCard Hero + MetricBar(공동 지출 meter · 내 지출 범례)', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/stats')
    await expect(page.getByRole('region', { name: '내가 낼 금액' })).toBeVisible()
    const shared = page.getByRole('region', { name: '공동 지출' })
    await expect(shared.getByRole('meter')).toBeVisible()
    await expect(page.getByRole('region', { name: '내 지출' }).getByRole('img')).toBeVisible()
  })

  test('정산: 톤 영웅 + 탈퇴한 멤버 행은 회색 기본 아바타 · 태그 없음 · 누를 수 없음', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-jeju/settlement')
    await expect(page.getByRole('region', { name: '총 공동 지출' })).toBeVisible()
    const list = page.getByRole('list', { name: '멤버별 정산' })
    const gone = list.getByRole('listitem').filter({ hasText: '탈퇴한 멤버' })
    await expect(gone).toHaveCount(1)
    await expect(gone.getByRole('button')).toHaveCount(0)
    await expect(gone).not.toContainText('나간 멤버')
    await expect(gone.locator('[data-source="default"]')).toHaveCount(1)
    // 나간 멤버(수빈)는 태그 + 누를 수 있다
    await expect(list.getByRole('button', { name: /수빈/ })).toContainText('나간 멤버')
  })

  test('결제내역: 탈퇴한 멤버의 결제 메타는 "HH:mm · 탈퇴한 멤버"', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-jeju/payments')
    await expect(page.getByRole('button', { name: /함덕 카페 델문도/ })).toContainText('15:30 · 탈퇴한 멤버')
  })
})

test.describe('지갑 해제(부록 C-5, v0.5.7)', () => {
  test('일부 해제: "이후 결제는 불러오지 않아요", 연결의 마지막이 아니면 체크 없음', async ({ page }) => {
    await useMockScenario(page, { accountLink: true })
    await page.goto('/wallet')
    await page.getByRole('button', { name: '신한카드 Deep Dream 더 보기' }).click()
    await page.getByRole('button', { name: '연결 해제' }).click()
    const dialog = page.getByRole('alertdialog', { name: '연결을 해제할까요?' })
    await expect(dialog).toContainText('이후 결제는 불러오지 않아요')
    await expect(dialog.getByRole('checkbox')).toHaveCount(0)
    await dialog.getByRole('button', { name: '취소' }).click()
  })

  test('전부 해제: "개인·미확정 결제도 지워져요"(체크 없음) → 결제내역에서 내 미확정이 사라진다', async ({ page }) => {
    await useMockScenario(page, { accountLink: true })
    // 목 db는 페이지 메모리에 있다 — 새로 불러오지 않고 앱 안에서만 이동한다
    await page.goto('/trips/trip-osaka/payments')
    await expect(page.getByRole('button', { name: /551 호라이/ })).toBeVisible()
    await page.getByRole('button', { name: '지갑' }).click()
    for (const name of ['토스뱅크 통장', '토스뱅크 체크카드', '신한카드 Deep Dream']) {
      await page.getByRole('button', { name: `${name} 더 보기` }).click()
      await page.getByRole('button', { name: '연결 해제' }).click()
      const dialog = page.getByRole('alertdialog', { name: '연결을 해제할까요?' })
      if (name === '신한카드 Deep Dream') {
        await expect(dialog).toContainText('개인·미확정 결제도 지워져요')
        await expect(dialog.getByRole('checkbox')).toHaveCount(0)
      }
      await dialog.getByRole('button', { name: '해제' }).click()
      await expect(page.getByRole('button', { name: `${name} 더 보기` })).toHaveCount(0)
    }
    await expect(page.getByText('연결된 계좌·카드가 없어요')).toBeVisible()
    await page.getByRole('button', { name: '뒤로 가기' }).click()
    await expect(page.getByRole('button', { name: /이치란/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /551 호라이/ })).toHaveCount(0)
  })
})

test.describe('결제수단 0개 · 결제 상세(WF-32 변형, v0.5.7)', () => {
  test('공동으로 확정 → 403 NO_ACTIVE_PAYMENT_METHOD → 시트 유지 + 계좌·카드 추가 시트, 토스트 없음', async ({ page }) => {
    await useMockScenario(page, { wallet: 'empty', accountLink: true })
    // 결제수단을 지운 상태에서도 미확정이 남아 있는 경우(서버 파기 전 데이터)를 흉내 낸다
    await page.goto('/trips/trip-osaka/payments/exp-551')
    const sheet = page.getByRole('dialog', { name: '551 호라이 난바본점' })
    await expect(sheet.getByRole('button', { name: '공동으로 확정' })).toBeEnabled()
    await sheet.getByRole('button', { name: '공동으로 확정' }).click()
    await expect(page.getByRole('dialog', { name: '계좌·카드 추가' })).toBeVisible()
    await expect(sheet).toBeVisible()
    await expect(page.getByText(/동의가 필요해요/)).toHaveCount(0)
  })

  test('공동 → 개인: 본문 "내 결제내역에서도 지워져요" → 바꾸기 → "결제를 지웠어요" + 목록으로', async ({ page }) => {
    await useMockScenario(page, { wallet: 'empty', accountLink: true })
    await page.goto('/trips/trip-osaka/payments')
    await page.getByRole('button', { name: /이치란/ }).click()
    const sheet = page.getByRole('dialog', { name: '이치란 라멘 도톤보리점' })
    await sheet.getByRole('radio', { name: '개인' }).check({ force: true })
    await sheet.getByRole('button', { name: '개인으로 변경' }).click()
    const dialog = page.getByRole('alertdialog', { name: '개인 결제로 바꿀까요?' })
    await expect(dialog).toContainText('내 결제내역에서도 지워져요')
    await dialog.getByRole('button', { name: '바꾸기' }).click()
    await expect(page.getByText('결제를 지웠어요')).toBeVisible()
    await expect(page).toHaveURL(/\/trips\/trip-osaka\/payments$/)
    await expect(page.getByRole('button', { name: /이치란/ })).toHaveCount(0)
  })
})

test.describe('마이페이지(WF-30)', () => {
  test('로그아웃은 확인 다이얼로그 없이 바로 로그인 화면', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/me')
    await page.getByRole('button', { name: '로그아웃' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('법적 문서(부록 C-7)', () => {
  test('로그인 없이 열리고 본문 구조(제목 없음 · 본문 영역)로 그린다', async ({ page }) => {
    await useMockScenario(page, { session: 'ANONYMOUS' })
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: '개인정보처리방침' })).toBeVisible()
    await expect(page.locator('[data-legal-body]')).toBeVisible()
    await expect(page.locator('[data-legal-body] blockquote')).toHaveCount(0)
  })
})
