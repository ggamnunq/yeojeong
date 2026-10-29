import { expect, test } from '@playwright/test'
import { useMockScenario } from './support'

// W9 내 정보(닉네임) 수정(HF-30 「수정」 → HF-63 → HF-63b) · 여정 정보 영웅 카드 「수정」(HF-16·23). 목 db는 페이지 메모리라 각 테스트는 처음부터 다시 연다.

test.describe('내 정보 — 닉네임 변경(HF-63)', () => {
  test('마이페이지 「수정」 → 내 정보 → 저장 → 마이페이지 + 토스트, 그룹원에도 새 이름', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/me')
    await expect(page.getByRole('heading', { name: '준용' })).toBeVisible()
    await page.getByRole('button', { name: '내 정보 수정' }).click()

    await expect(page).toHaveURL('/me/profile')
    await expect(page.getByRole('heading', { level: 1, name: '내 정보' })).toBeVisible()
    await expect(page.getByText('프로필 사진은 카카오에서 바꿀 수 있어요')).toBeVisible()
    const input = page.getByRole('textbox', { name: '닉네임' })
    await expect(input).toHaveValue('준용')
    const save = page.getByRole('button', { name: '저장' })
    await expect(save).toBeDisabled()

    // 빈 값은 저장할 수 없다
    await input.fill('   ')
    await expect(save).toBeDisabled()
    // 10자를 넘으면 잘린다
    await input.fill('가나다라마바사아자차카')
    await expect(input).toHaveValue('가나다라마바사아자차')
    await input.fill('준용이')
    await expect(save).toBeEnabled()
    await save.click()

    await expect(page).toHaveURL('/me')
    await expect(page.getByRole('heading', { name: '준용이' })).toBeVisible()
    await expect(page.getByText('닉네임을 바꿨어요')).toBeVisible()

    // 같은 페이지(목 db 유지)에서 여정 정보로 — 그룹원 목록이 users를 읽어 새 이름
    await page.evaluate(() => {
      history.pushState(null, '', '/trips/trip-osaka/info')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByRole('region', { name: '그룹원 4명' })).toContainText('준용이')
  })

  test('‹ 는 저장하지 않고 마이페이지로', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/me')
    await page.getByRole('button', { name: '내 정보 수정' }).click()
    await page.getByRole('textbox', { name: '닉네임' }).fill('바꾼이름')
    await page.getByRole('button', { name: '뒤로 가기' }).click()
    await expect(page).toHaveURL('/me')
    await expect(page.getByRole('heading', { name: '준용' })).toBeVisible()
  })
})

test.describe('여정 정보 「수정」(HF-16·23)', () => {
  test('그룹장: 영웅 카드 텍스트 버튼 「수정」 → 여정 수정 화면', async ({ page }) => {
    await useMockScenario(page)
    await page.goto('/trips/trip-osaka/info')
    const edit = page.getByRole('button', { name: '여정 정보 수정' })
    await expect(edit).toHaveText('수정')
    await edit.click()
    await expect(page).toHaveURL('/trips/trip-osaka/edit')
    await expect(page.getByRole('textbox', { name: '그룹명' })).toBeEnabled()
  })
})
