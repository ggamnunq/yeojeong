import { expect, test } from '@playwright/test'

// 실제 API(로컬 서버 + 데모 어댑터) E2E. playwright.config.ts의 api 프로젝트 — E2E_API_BASE_URL이 있을 때만 돈다.
// 세션: E2E_SESSION_TOKEN(로컬 DB에 만든 테스트 사용자의 yj_session 값). 값은 커밋하지 않는다.

const token = process.env.E2E_SESSION_TOKEN

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!token, 'E2E_SESSION_TOKEN이 없다')
  const { hostname } = new URL(baseURL!)
  await context.addCookies([{ name: 'yj_session', value: token!, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' }])
})

// TODO(S4): 마지막 결제수단 해제로 FIN_LINK·FIN_PRIVACY가 철회된 뒤 다시 동의하면 POST /api/consents는 201인데
// 같은 버전 행이 철회 상태로 남아 POST /api/payment-connections가 계속 403 CONSENT_REQUIRED다(PR #34에서 확인).
// 서버 S4(재동의 append)가 머지되면 fixme를 지운다.
test.fixme('전부 해제 → 연동 동의 철회 → 다시 동의하고 연결 → 계좌·카드 선택까지 이어진다', async ({ page }) => {
  await page.goto('/wallet')
  const more = page.getByRole('button', { name: /더 보기$/ })
  // 결제수단을 모두 해제한다(마지막은 "개인·미확정 결제도 지워져요")
  while ((await more.count()) > 0) {
    await more.first().click()
    await page.getByRole('button', { name: '연결 해제' }).click()
    const dialog = page.getByRole('alertdialog', { name: '연결을 해제할까요?' })
    const last = (await more.count()) === 1
    if (last) await expect(dialog).toContainText('개인·미확정 결제도 지워져요')
    await dialog.getByRole('button', { name: '해제' }).click()
    await expect(page.getByText('연결을 해제했어요')).toBeVisible()
  }
  await expect(page.getByText('연결된 계좌·카드가 없어요')).toBeVisible()

  // 다시 연결: 연동 동의가 철회됐으니 동의 시트(WF-05b) → 동의하고 연결 → 토스 인증(데모) → 계좌·카드 선택
  await page.getByRole('button', { name: '계좌·카드 추가' }).click()
  await page.getByRole('dialog', { name: '계좌·카드 추가' }).getByRole('button', { name: '연결' }).click()
  const consent = page.getByRole('dialog', { name: '금융정보 연동 동의' })
  await expect(consent).toBeVisible()
  await consent.getByRole('checkbox', { name: '전체 동의' }).check({ force: true })
  await consent.getByRole('button', { name: '동의하고 연결' }).click()
  await expect(page).toHaveURL(/\/wallet\/connect\/(toss|select)/, { timeout: 15_000 })
  await expect(page).toHaveURL(/\/wallet\/connect\/select/, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: /개 연결$/ })).toBeVisible()
})
