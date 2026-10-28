import { afterEach, beforeEach, vi } from 'vitest'
import { db, MOCK_NOW } from '../../mocks/data'
import { toastStore } from '../../notifications'

// 이 플로우 테스트 공통: 화면의 "오늘"을 목 기준 시점(11.13 18:34 KST)에 맞춘다. 타이머(디바운스·토스트)는 진짜로 흐른다.
export function setupMockToday() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(MOCK_NOW))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

/** 지금 떠 있는 토스트 문구 */
export const toastMessages = () => toastStore.getSnapshot().map((t) => t.message)

/** 이 여정에서 준용을 그룹장으로(나머지는 멤버) */
export function makeMeLeader(tripId: string) {
  for (const m of db.memberships) if (m.tripId === tripId) m.role = m.userId === db.meUserId ? 'LEADER' : 'MEMBER'
}

/** navigator.clipboard · navigator.share 대역 */
export function stubNavigator({ share }: { share?: boolean } = {}) {
  const writeText = vi.fn().mockResolvedValue(undefined)
  const shareFn = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  Object.defineProperty(navigator, 'share', { value: share ? shareFn : undefined, configurable: true })
  return { writeText, share: shareFn }
}
