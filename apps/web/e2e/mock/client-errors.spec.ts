import { expect, test, type Page, type Request } from '@playwright/test'
import { useMockScenario } from './support'

// 화면 오류 보고(POST /api/client-errors)와 옛 번들 감지(/version.json). 목 개발 서버(빌드 ID 'dev')에서 실제 브라우저로 본다.
// docs/ops/client-errors.md

const isReport = (request: Request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/client-errors'

/** 앱 안 이동(라우터 popstate) */
async function navigate(page: Page, path: string) {
  await page.evaluate((to) => {
    history.pushState(null, '', to)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

test.describe('옛 번들 · 화면 오류 보고', () => {
  test('지연 로딩 chunk를 못 받으면 「새 버전이 나왔어요」, 경로 템플릿만 담아 보고한다(쿼리·해시 없음)', async ({ page, context }) => {
    await useMockScenario(page)
    // 배포로 지워진 chunk 흉내: 새 여정 만들기 페이지 모듈을 404로
    await context.route(/\/src\/features\/trips\/pages\/NewTripPage\.tsx/, (route) => route.fulfill({ status: 404, body: 'Not Found' }))
    await page.goto('/trips')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()

    const reported = page.waitForRequest(isReport)
    await navigate(page, '/trips/new?from=qr#code=K7M2QX')

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('새 버전이 나왔어요')
    await expect(page.getByRole('button', { name: '새로고침' })).toBeVisible()

    const body = (await reported).postDataJSON() as Record<string, unknown>
    expect(body).toMatchObject({ buildId: 'dev', route: '/trips/new', source: 'boundary', chunk: true, staleBuild: false })
    expect(JSON.stringify(body)).not.toMatch(/K7M2QX|from=qr|localhost/)
    expect(body.userAgent).toMatch(/^Chrome \d+ \/ Android \d+$/)
  })

  test('30분 넘게 백그라운드에 있다 돌아와 새 빌드가 있으면 다음 이동 때 한 번 새로고침한다', async ({ page }) => {
    await page.clock.install()
    await useMockScenario(page)
    await page.goto('/me')
    await expect(page.getByRole('heading', { name: '준용' })).toBeVisible()

    // 그사이 배포됨(목 /version.json이 다른 빌드 ID를 돌려준다)
    await page.evaluate(() => localStorage.setItem('yj:mock:buildId', 'next-build'))
    await setVisibility(page, 'hidden')
    await page.clock.fastForward('31:00')
    const checked = page.waitForResponse((res) => new URL(res.url()).pathname === '/version.json')
    await setVisibility(page, 'visible')
    expect(await (await checked).json()).toEqual({ buildId: 'next-build' })

    // 이동 전에는 그대로
    await page.evaluate(() => ((window as unknown as { __beforeReload?: boolean }).__beforeReload = true))
    await page.clock.runFor(1000)
    expect(await page.evaluate(() => (window as unknown as { __beforeReload?: boolean }).__beforeReload)).toBe(true)

    const reloaded = page.waitForEvent('load')
    await navigate(page, '/me/profile')
    await reloaded
    await expect(page).toHaveURL('/me/profile')
    await expect(page.getByRole('heading', { level: 1, name: '내 정보' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __beforeReload?: boolean }).__beforeReload)).toBeUndefined()
    expect(await page.evaluate(() => sessionStorage.getItem('yj:stale-reload:for'))).toBe('next-build')

    // 같은 빌드로는 다시 새로고침하지 않는다
    await page.evaluate(() => ((window as unknown as { __afterReload?: boolean }).__afterReload = true))
    await setVisibility(page, 'hidden')
    await page.clock.fastForward('31:00')
    await setVisibility(page, 'visible')
    await page.clock.runFor(1000)
    await navigate(page, '/me')
    await expect(page.getByRole('heading', { name: '준용' })).toBeVisible()
    await page.clock.runFor(1000)
    expect(await page.evaluate(() => (window as unknown as { __afterReload?: boolean }).__afterReload)).toBe(true)
  })

  test('30분이 안 됐으면 확인하지 않고 새로고침하지 않는다', async ({ page }) => {
    await page.clock.install()
    await useMockScenario(page)
    await page.goto('/me')
    await expect(page.getByRole('heading', { name: '준용' })).toBeVisible()
    await page.evaluate(() => localStorage.setItem('yj:mock:buildId', 'next-build'))

    let versionChecks = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/version.json') versionChecks += 1
    })
    await setVisibility(page, 'hidden')
    await page.clock.fastForward('10:00')
    await setVisibility(page, 'visible')
    await page.evaluate(() => ((window as unknown as { __kept?: boolean }).__kept = true))
    await navigate(page, '/me/profile')
    await expect(page.getByRole('heading', { level: 1, name: '내 정보' })).toBeVisible()
    await page.clock.runFor(1000)
    expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true)
    expect(versionChecks).toBe(0)
  })
})
