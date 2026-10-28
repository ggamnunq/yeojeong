import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToastStore, TOAST_DEDUPE_MS, TOAST_DURATION_MS, TOAST_ERROR_DURATION_MS, type ToastStore } from './store'

let store: ToastStore
const messages = () => store.getSnapshot().map((t) => t.message)

beforeEach(() => {
  vi.useFakeTimers()
  store = createToastStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('토스트 큐', () => {
  it('기본 3초, 오류는 5초 뒤 닫힌다', () => {
    store.show('success', '저장했어요')
    store.show('error', '저장하지 못했어요')

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(messages()).toEqual(['저장했어요', '저장하지 못했어요'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual(['저장하지 못했어요'])
    vi.advanceTimersByTime(TOAST_ERROR_DURATION_MS - TOAST_DURATION_MS)
    expect(messages()).toEqual([])
  })

  it('durationMs로 시간을 바꾸고, Infinity면 직접 닫을 때까지 남는다', () => {
    const short = store.show('info', '짧게', { durationMs: 500 })!
    const sticky = store.show('info', '계속', { durationMs: Infinity })!
    expect(store.getSnapshot().find((t) => t.id === short)?.durationMs).toBe(500)

    vi.advanceTimersByTime(60_000)
    expect(messages()).toEqual(['계속'])
    store.dismiss(sticky)
    expect(messages()).toEqual([])
  })

  it('동시에 최대 2개. 넘치면 가장 오래된 것을 닫는다', () => {
    store.show('info', '하나')
    store.show('info', '둘')
    store.show('info', '셋')
    expect(messages()).toEqual(['둘', '셋'])

    // 밀려난 토스트의 타이머는 남지 않는다
    expect(vi.getTimerCount()).toBe(2)
  })

  it('같은 토스트가 떠 있거나 방금 떴으면 다시 띄우지 않는다', () => {
    const first = store.show('error', '연결을 확인해 주세요')
    expect(store.show('error', '연결을 확인해 주세요')).toBe(first)
    expect(messages()).toEqual(['연결을 확인해 주세요'])

    store.dismiss(first!)
    vi.advanceTimersByTime(TOAST_DEDUPE_MS - 1)
    expect(store.show('error', '연결을 확인해 주세요')).toBeUndefined()
    expect(messages()).toEqual([])

    vi.advanceTimersByTime(1)
    store.show('error', '연결을 확인해 주세요')
    expect(messages()).toEqual(['연결을 확인해 주세요'])
  })

  it('같은 문구라도 종류나 dedupeKey가 다르면 따로 띄운다', () => {
    store.show('info', '같은 문구')
    store.show('error', '같은 문구')
    expect(messages()).toHaveLength(2)

    store.clear()
    store.show('error', 'A', { dedupeKey: 'NETWORK_ERROR' })
    store.show('error', 'B', { dedupeKey: 'NETWORK_ERROR' })
    expect(messages()).toEqual(['A'])
  })

  it('액션을 누르면 콜백을 부르고 닫는다', () => {
    const onClick = vi.fn()
    const id = store.show('error', '연결을 확인해 주세요', { action: { label: '다시 시도', onClick } })!

    store.act(id)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(messages()).toEqual([])
    store.act(id)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('pause 동안은 닫히지 않고, resume하면 남은 시간만큼 더 보인다', () => {
    const id = store.show('success', '복사했어요')!
    vi.advanceTimersByTime(1000)
    store.pause(id)
    vi.advanceTimersByTime(10_000)
    expect(messages()).toEqual(['복사했어요'])

    store.resume(id)
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1000 - 1)
    expect(messages()).toEqual(['복사했어요'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual([])
  })

  it('구독자에게 바뀔 때마다 알리고, 스냅샷은 바뀔 때만 새 배열이다', () => {
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const before = store.getSnapshot()
    expect(store.getSnapshot()).toBe(before)

    store.show('info', '하나')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).not.toBe(before)

    unsubscribe()
    store.clear()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
