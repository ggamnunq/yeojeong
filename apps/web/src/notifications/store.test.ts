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
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(messages()).toEqual(['저장했어요'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual([])

    store.show('error', '저장하지 못했어요')
    vi.advanceTimersByTime(TOAST_ERROR_DURATION_MS - 1)
    expect(messages()).toEqual(['저장하지 못했어요'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual([])
  })

  it('durationMs로 시간을 바꾸고, Infinity면 직접 닫을 때까지 남는다', () => {
    const short = store.show('info', '짧게', { durationMs: 500 })!
    expect(store.getSnapshot().find((t) => t.id === short)?.durationMs).toBe(500)
    vi.advanceTimersByTime(500)
    expect(messages()).toEqual([])

    const sticky = store.show('info', '계속', { durationMs: Infinity })!
    vi.advanceTimersByTime(60_000)
    expect(messages()).toEqual(['계속'])
    store.dismiss(sticky)
    expect(messages()).toEqual([])
  })

  it('한 번에 하나. 새 토스트가 오면 앞 토스트를 바로 바꾼다(화면명세 0-4)', () => {
    store.show('info', '하나')
    store.show('info', '둘')
    store.show('info', '셋')
    expect(messages()).toEqual(['셋'])

    // 밀려난 토스트의 타이머는 남지 않는다
    expect(vi.getTimerCount()).toBe(1)
  })

  it('dismissSeen은 뜬 뒤에 사용자 입력이 있었던 토스트만 닫는다(HF-50·20b)', () => {
    store.noteUserInput() // 저장 누름
    store.show('success', '저장했어요')
    // 저장 결과로 상세 시트가 다시 열림 — 입력이 없었으니 남는다
    store.dismissSeen()
    expect(messages()).toEqual(['저장했어요'])
    expect(vi.getTimerCount()).toBe(1)
    // 사용자가 다른 행을 눌러 시트를 새로 열면 닫는다
    store.noteUserInput()
    store.dismissSeen()
    expect(messages()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('dismissAll은 떠 있는 토스트만 닫고 중복 방지 기록은 남긴다', () => {
    store.show('success', '저장했어요')
    store.dismissAll()
    expect(messages()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    // 같은 토스트가 곧바로 다시 오면 띄우지 않는다
    expect(store.show('success', '저장했어요')).toBeUndefined()
    vi.advanceTimersByTime(TOAST_DEDUPE_MS)
    store.show('success', '저장했어요')
    expect(messages()).toEqual(['저장했어요'])
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
    // 둘 다 띄워지고(하나씩이라 뒤엣것이 남는다) 중복으로 버려지지 않았다
    expect(store.getSnapshot().map((t) => t.type)).toEqual(['error'])

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
