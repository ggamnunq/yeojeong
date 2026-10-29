import { useLayoutEffect, useSyncExternalStore } from 'react'

// 토스트 위치 기준(화면명세 v0.5.8 0-4 「토스트 위치·수명」, DS17).
// 하단 내비 있음 → 내비 위 16 · 내비 없고 하단 고정 CTA 있음 → CTA 위 16 · 둘 다 없음 → 안전영역 위 16.
// 내비와 CTA가 같이 있으면(ShellApp cta) CTA를 덮지 않게 CTA 위 16.
// Screen(셸 포함)이 그려질 때 자기 하단 구성을 여기에 알리고, ToastViewport anchor="auto"가 가장 최근 것을 읽는다.
export type ToastAnchor = 'nav' | 'cta' | 'nav-cta' | 'safe-area'

export function toastAnchorFor({ nav, cta }: { nav: boolean; cta: boolean }): ToastAnchor {
  if (nav && cta) return 'nav-cta'
  if (nav) return 'nav'
  if (cta) return 'cta'
  return 'safe-area'
}

type Entry = { anchor: ToastAnchor }
// 화면 전환 중 두 Screen이 잠깐 같이 있을 수 있어 등록 순서대로 쌓고 마지막 것을 쓴다
let entries: Entry[] = []
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

function current(): ToastAnchor | null {
  return entries.at(-1)?.anchor ?? null
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Screen이 쓴다: 그려져 있는 동안 자기 하단 구성을 토스트 기준으로 등록한다 */
export function useRegisterToastAnchor(anchor: ToastAnchor) {
  useLayoutEffect(() => {
    const entry: Entry = { anchor }
    entries = [...entries, entry]
    emit()
    return () => {
      entries = entries.filter((e) => e !== entry)
      emit()
    }
  }, [anchor])
}

/** 지금 화면(가장 최근에 그려진 Screen)의 토스트 기준. Screen이 없으면 null */
export function useToastAnchor(): ToastAnchor | null {
  return useSyncExternalStore(subscribe, current, current)
}
