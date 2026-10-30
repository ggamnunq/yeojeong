import { expect, test, type Page } from '@playwright/test'

// 운영자 관리자 페이지(/admin/*)를 목 개발 서버에서 실제 브라우저로 확인한다(데스크톱 폭 우선, 모바일 폭에서도 깨지지 않게).
// 목 자격 증명은 src/features/admin/mocks.ts의 ADMIN_MOCK_CREDENTIALS(목 전용 값).

const USERNAME = 'admin'
const PASSWORD = 'admin-password-123'
// ADMIN_MOCK_TOTP_CODES: 한 번 쓴 코드는 다시 받지 않는다(로그인 [0], 탈퇴 재인증 [1])
const LOGIN_CODE = '246810'
const STEP_UP_CODE = '135791'

async function login(page: Page) {
  await page.getByLabel('아이디').fill(USERNAME)
  await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD)
  await page.getByLabel('인증 코드').fill(LOGIN_CODE)
  await page.getByRole('button', { name: '로그인' }).click()
}

test.describe('관리자(데스크톱)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })

  test('로그인 → 회원 목록 → 상세 → 탈퇴 2단계 → CODEF 현황 → 로그아웃', async ({ page }) => {
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/admin\/login\?returnTo=%2Fadmin%2Fusers$/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')

    // 틀린 비밀번호는 일반 문구
    await page.getByLabel('아이디').fill(USERNAME)
    await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password')
    await page.getByLabel('인증 코드').fill(LOGIN_CODE)
    await page.getByRole('button', { name: '로그인' }).click()
    await expect(page.getByRole('alert')).toHaveText('아이디, 비밀번호 또는 인증 코드가 맞지 않아요')

    await login(page)
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('heading', { level: 1, name: '회원' })).toBeVisible()
    const table = page.getByRole('region', { name: '회원 목록 표' })
    await expect(table.getByRole('row')).toHaveCount(21)
    await page.getByRole('button', { name: '더 보기' }).click()
    await expect(table.getByRole('row')).toHaveCount(26)

    // 검색
    await page.getByLabel('검색').fill('태현')
    await page.getByRole('button', { name: '검색', exact: true }).click()
    await expect(table.getByRole('row')).toHaveCount(2)
    await table.getByRole('link', { name: '태현' }).click()

    await expect(page.getByRole('heading', { level: 1, name: '태현' })).toBeVisible()
    await expect(page.getByRole('group', { name: '결제', exact: true })).toBeVisible()
    await expect(page.getByText(/₩|가맹점/)).toHaveCount(0)

    // 탈퇴: 사유 + 닉네임 재입력 + 재인증(비밀번호·인증 코드) → 확인 다이얼로그
    const withdraw = page.getByRole('button', { name: '탈퇴 처리' })
    await expect(withdraw).toBeDisabled()
    await page.getByLabel('사유').fill('고객센터 요청 처리')
    await page.getByLabel('닉네임 다시 입력').fill('태현')
    await expect(withdraw).toBeDisabled()
    await page.getByLabel('관리자 비밀번호').fill(PASSWORD)
    // 로그인에 쓴 코드는 다시 쓸 수 없다
    await page.getByLabel('인증 코드').fill(LOGIN_CODE)
    await expect(withdraw).toBeEnabled()
    await withdraw.click()
    await page.getByRole('alertdialog').getByRole('button', { name: '탈퇴 처리' }).click()
    await expect(page.getByText('비밀번호 또는 인증 코드가 맞지 않아요')).toBeVisible()
    // 닫히는 다이얼로그(전환 중)의 버튼과 겹치지 않게 다 닫힐 때까지 기다린다
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByLabel('인증 코드')).toHaveValue('')
    await page.getByLabel('인증 코드').fill(STEP_UP_CODE)
    await expect(withdraw).toBeEnabled()
    await withdraw.click()
    const dialog = page.getByRole('alertdialog', { name: '태현 님을 탈퇴 처리할까요?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '탈퇴 처리' }).click()
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByText('태현 님을 탈퇴 처리했어요')).toBeVisible()
    await expect(page.getByRole('link', { name: '태현' })).toHaveCount(0)

    // CODEF 현황
    await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: 'CODEF 현황' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'CODEF 현황' })).toBeVisible()
    await expect(page.getByText('36 / 100')).toBeVisible()
    await expect(page.getByRole('region', { name: '일별 호출 표' }).getByRole('row')).toHaveCount(15)
    await expect(page.getByRole('region', { name: '회원별 오늘 조회 표' }).getByText('탈퇴한 회원')).toBeVisible()

    // 새로고침해도 관리자 세션 유지(목은 sessionStorage)
    await page.reload()
    await expect(page.getByText('36 / 100')).toBeVisible()

    await page.getByRole('button', { name: '로그아웃' }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)
    await page.goto('/admin/codef')
    await expect(page).toHaveURL(/\/admin\/login\?returnTo=%2Fadmin%2Fcodef$/)
  })
})

test.describe('관리자 기능 권한(데스크톱)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })

  test('기능 권한 탭: 단계 → 회원 찾아 위챗 권한 부여 → 회원 상세에 반영 → 표에서 회수', async ({ page }) => {
    await page.goto('/admin/login')
    await login(page)
    await expect(page.getByRole('heading', { level: 1, name: '회원' })).toBeVisible()
    await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: '기능 권한' }).click()
    await expect(page).toHaveURL(/\/admin\/features$/)
    await expect(page.getByRole('heading', { level: 1, name: '기능 권한' })).toBeVisible()
    await expect(page.getByRole('group', { name: '카드 불러오기 단계' }).getByText('허용 목록')).toBeVisible()
    const table = page.getByRole('region', { name: '기능 권한 표' })
    await expect(table.getByRole('row')).toHaveCount(5)
    // env 항목: 관리자 권한 토글은 꺼짐 + env 태그
    const envRow = table.getByRole('row').filter({ hasText: '준용' })
    await expect(envRow.getByText('env', { exact: true })).toBeVisible()
    await expect(page.getByRole('switch', { name: '준용 카드 불러오기 권한' })).toHaveAttribute('aria-checked', 'false')

    // 부여: 회원 검색 → 위챗페이 파일 토글 → 확인
    await page.getByLabel('회원 검색').fill('태현')
    await page.getByRole('button', { name: '회원 찾기' }).click()
    await expect(table.getByRole('row')).toHaveCount(2)
    await page.getByLabel('부여 메모(선택)').fill('위챗 실파일 검증')
    await page.getByRole('switch', { name: '태현 위챗페이 파일 권한' }).click()
    const grantDialog = page.getByRole('alertdialog', { name: '태현 님에게 위챗페이 파일 권한을 줄까요?' })
    await expect(grantDialog).toBeVisible()
    await grantDialog.getByRole('button', { name: '권한 주기' }).click()
    await expect(page.getByText('태현 님에게 위챗페이 파일 권한을 줬어요')).toBeVisible()
    await expect(page.getByRole('switch', { name: '태현 위챗페이 파일 권한' })).toHaveAttribute('aria-checked', 'true')

    // 회원 상세에도 반영(메모 포함)
    await table.getByRole('link', { name: '태현' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '태현' })).toBeVisible()
    const section = page.getByRole('region', { name: '기능 권한' })
    await expect(section.getByRole('switch', { name: '태현 위챗페이 파일 권한' })).toHaveAttribute('aria-checked', 'true')
    await expect(section.getByText(/메모: 위챗 실파일 검증/)).toBeVisible()

    // 표에서 회수(확인 다이얼로그)
    await section.getByRole('link', { name: '기능 권한 탭' }).click()
    await expect(page).toHaveURL(/\/admin\/features$/)
    await expect(table.getByRole('row')).toHaveCount(6)
    await page.getByRole('switch', { name: '태현 위챗페이 파일 권한' }).click()
    const revokeDialog = page.getByRole('alertdialog', { name: '태현 님의 위챗페이 파일 권한을 회수할까요?' })
    await expect(revokeDialog).toBeVisible()
    await revokeDialog.getByRole('button', { name: '회수' }).click()
    await expect(page.getByText('태현 님의 위챗페이 파일 권한을 회수했어요')).toBeVisible()
    await expect(table.getByRole('row')).toHaveCount(5)
    await expect(table.getByRole('link', { name: '태현' })).toHaveCount(0)
  })
})

test.describe('관리자(모바일 폭)', () => {
  test('390px에서도 페이지 가로 스크롤이 없다(표는 자기 상자 안에서만 넘친다)', async ({ page }) => {
    await page.goto('/admin/login')
    await login(page)
    await expect(page.getByRole('heading', { level: 1, name: '회원' })).toBeVisible()
    await expect(page.getByRole('region', { name: '회원 목록 표' }).getByRole('row')).toHaveCount(21)
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.goto('/admin/codef')
    await expect(page.getByText('36 / 100')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: '회원' }).click()
    await page.getByRole('link', { name: '준용' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '준용' })).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: '기능 권한' }).click()
    await expect(page.getByRole('region', { name: '기능 권한 표' }).getByRole('row')).toHaveCount(5)
    expect(await overflow()).toBeLessThanOrEqual(0)
    // 기능별 단계 카드는 한 줄에 하나씩 쌓이고, 토글은 손가락으로 누를 수 있다
    await page.getByRole('switch', { name: '여행자05 카드 불러오기 권한' }).scrollIntoViewIfNeeded()
    await page.getByRole('switch', { name: '여행자05 카드 불러오기 권한' }).click()
    await expect(page.getByRole('alertdialog', { name: '여행자05 님의 카드 불러오기 권한을 회수할까요?' })).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
})
