import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { connectPrompt } from '../app/connectPrompt'
import { resetMockDb } from '../mocks/data'
import { server } from '../mocks/server'
import { toastStore } from '../notifications/store'

// 모든 테스트에서 MSW가 /api를 받는다. 핸들러가 없는 요청은 실패로 본다.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetMockDb()
  toastStore.clear()
  connectPrompt.close()
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    // 저장소가 없는 환경
  }
})

afterAll(() => server.close())
