import { defineConfig, devices } from '@playwright/test'

// 웹 E2E(실제 브라우저). `pnpm --filter @yeojeong/web test:e2e`
// - mock: 개발 서버 + MSW 목(VITE_MOCK_API=1). 서버·DB 없이 화면 흐름을 본다. 기본으로 도는 프로젝트.
// - api: 실제 API(로컬 서버 + 데모 어댑터)에 붙은 웹. E2E_API_BASE_URL · E2E_SESSION_TOKEN이 있을 때만 돈다(e2e/api/README.md).
// 브라우저: 설치된 Playwright Chromium. 시스템 Chrome을 쓰려면 PW_CHANNEL=chrome.
const MOCK_PORT = 5179
const apiBaseURL = process.env.E2E_API_BASE_URL
const channel = process.env.PW_CHANNEL

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'node_modules/.e2e/results',
  reporter: process.env.CI ? 'github' : 'list',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    channel,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mock', testDir: 'e2e/mock', use: { baseURL: `http://localhost:${MOCK_PORT}` } },
    ...(apiBaseURL ? [{ name: 'api', testDir: 'e2e/api', use: { baseURL: apiBaseURL } }] : []),
  ],
  webServer: {
    command: `vite --port ${MOCK_PORT} --strictPort`,
    env: { VITE_MOCK_API: '1' },
    url: `http://localhost:${MOCK_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
