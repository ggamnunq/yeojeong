import { useSyncExternalStore } from 'react'
import type { ToastType } from '../ds'

// 헤드리스 토스트 큐. 어디서든 toast.error('…')로 띄우고, ToastHost가 구독해서 그린다.
// 한 번에 하나(새 토스트가 오면 앞 토스트를 바로 바꾼다, 화면명세 0-4 v0.5.8), 기본 3초·오류 5초 뒤 자동으로 닫힌다.

export const TOAST_DURATION_MS = 3000
export const TOAST_ERROR_DURATION_MS = 5000
export const TOAST_MAX_VISIBLE = 1
/** 같은 토스트가 이 시간 안에 다시 오면 띄우지 않는다 */
export const TOAST_DEDUPE_MS = 2000

export type ToastAction = { label: string; onClick: () => void }

export type ToastOptions = {
  /** 오른쪽 액션 버튼 하나. 누르면 onClick을 부르고 토스트를 닫는다 */
  action?: ToastAction
  /** 자동으로 닫히기까지(ms). 기본 3초, error는 5초. Infinity면 직접 닫을 때까지 남는다 */
  durationMs?: number
  /** 같은 키의 토스트가 떠 있거나 방금 떴으면 무시한다. 기본: type + message */
  dedupeKey?: string
}

export type ToastItem = {
  id: number
  type: ToastType
  message: string
  action?: ToastAction
  durationMs: number
  dedupeKey: string
  /** 뜰 때까지 있었던 사용자 입력 수(noteUserInput). 이 뒤에 입력이 있었으면 사용자가 본 토스트다 */
  inputSeq: number
}

type Timer = { handle?: ReturnType<typeof setTimeout>; remaining: number; startedAt: number }

export type ToastStore = ReturnType<typeof createToastStore>

export function createToastStore({ maxVisible = TOAST_MAX_VISIBLE, dedupeMs = TOAST_DEDUPE_MS } = {}) {
  let toasts: readonly ToastItem[] = []
  let nextId = 1
  const listeners = new Set<() => void>()
  const timers = new Map<number, Timer>()
  const lastShownAt = new Map<string, number>()
  let inputSeq = 0

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const clearTimer = (id: number) => {
    const timer = timers.get(id)
    if (timer?.handle !== undefined) clearTimeout(timer.handle)
    timers.delete(id)
  }

  const runTimer = (id: number, timer: Timer) => {
    if (!Number.isFinite(timer.remaining)) return
    timer.startedAt = Date.now()
    timer.handle = setTimeout(() => dismiss(id), Math.max(0, timer.remaining))
  }

  function show(type: ToastType, message: string, options: ToastOptions = {}): number | undefined {
    const dedupeKey = options.dedupeKey ?? `${type}:${message}`
    const now = Date.now()
    const visible = toasts.find((t) => t.dedupeKey === dedupeKey)
    if (visible) return visible.id
    const last = lastShownAt.get(dedupeKey)
    if (last !== undefined && now - last < dedupeMs) return undefined

    for (const [key, at] of lastShownAt) if (now - at >= dedupeMs) lastShownAt.delete(key)
    lastShownAt.set(dedupeKey, now)

    const item: ToastItem = {
      id: nextId++,
      type,
      message,
      action: options.action,
      durationMs: options.durationMs ?? (type === 'error' ? TOAST_ERROR_DURATION_MS : TOAST_DURATION_MS),
      dedupeKey,
      inputSeq,
    }
    const next = [...toasts, item]
    for (const evicted of next.splice(0, Math.max(0, next.length - maxVisible))) clearTimer(evicted.id)
    toasts = next

    const timer: Timer = { remaining: item.durationMs, startedAt: now }
    timers.set(item.id, timer)
    runTimer(item.id, timer)
    emit()
    return item.id
  }

  function dismiss(id: number) {
    if (!toasts.some((t) => t.id === id)) return
    clearTimer(id)
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }

  return {
    show,
    dismiss,
    /** 액션 버튼을 눌렀을 때: 콜백을 부르고 닫는다 */
    act(id: number) {
      const item = toasts.find((t) => t.id === id)
      if (!item) return
      dismiss(id)
      item.action?.onClick()
    },
    /** 포인터가 올라가거나 포커스가 들어오면 시간을 멈춘다(액션을 누를 시간을 준다) */
    pause(id: number) {
      const timer = timers.get(id)
      if (timer?.handle === undefined) return
      clearTimeout(timer.handle)
      timer.handle = undefined
      timer.remaining -= Date.now() - timer.startedAt
    },
    resume(id: number) {
      const timer = timers.get(id)
      if (!timer || timer.handle !== undefined) return
      runTimer(id, timer)
    },
    /** 떠 있는 토스트를 모두 닫는다. 중복 방지 기록은 남긴다(시트를 열 때 — 같은 토스트가 곧바로 다시 뜨지 않게) */
    dismissAll() {
      if (toasts.length === 0) return
      for (const id of [...timers.keys()]) clearTimer(id)
      toasts = []
      emit()
    },
    /** 사용자 입력(누름·키)이 있었다고 알린다. ToastHost가 문서에서 듣는다 */
    noteUserInput() {
      inputSeq += 1
    },
    /**
     * 사용자가 새로 시트·다이얼로그를 열 때(화면명세 0-4): 뜬 뒤에 사용자 입력이 있었던 토스트만 닫는다.
     * 마지막 입력 뒤에 뜬 토스트는 그 입력(저장·삭제 등)의 결과라서, 이어지는 시트 전환(수정 → 상세 다시 열림)에도 남긴다(HF-50·20b)
     */
    dismissSeen() {
      const seen = toasts.filter((t) => t.inputSeq < inputSeq)
      if (seen.length === 0) return
      for (const t of seen) clearTimer(t.id)
      toasts = toasts.filter((t) => t.inputSeq >= inputSeq)
      emit()
    },
    /** 모두 닫고 중복 방지 기록까지 지운다(로그아웃·테스트 초기화) */
    clear() {
      for (const id of [...timers.keys()]) clearTimer(id)
      toasts = []
      lastShownAt.clear()
      emit()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => toasts,
  }
}

/** 앱 전체가 쓰는 큐 */
export const toastStore = createToastStore()

export const toast = {
  success: (message: string, options?: ToastOptions) => toastStore.show('success', message, options),
  info: (message: string, options?: ToastOptions) => toastStore.show('info', message, options),
  error: (message: string, options?: ToastOptions) => toastStore.show('error', message, options),
  dismiss: (id: number) => toastStore.dismiss(id),
  dismissAll: () => toastStore.dismissAll(),
  clear: () => toastStore.clear(),
}

export function useToasts(store: ToastStore = toastStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
