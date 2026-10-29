import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { onModalOpen, Toast, ToastViewport } from '../ds'
import { toastStore, useToasts, type ToastStore } from './store'
import { useTopModalDialog } from './topModalDialog'

// 토스트 큐를 DS Toast + ToastViewport로 그린다. 앱에 하나만 둔다(RootLayout).
// 자리(화면명세 0-4 v0.5.8): 하단 내비 위 16 · 내비 없으면 하단 CTA 위 16 · 둘 다 없으면 안전영역 위 16 — 지금 그려진 Screen이 알려 준 구성(anchor="auto").
// 시트·다이얼로그가 열리면 떠 있던 토스트는 바로 닫는다(시트 안 동작의 결과 토스트는 연 뒤에 뜨니 영향 없음).
//
// 열린 BottomSheet·Dialog(네이티브 <dialog> 최상위 레이어) 위에도 보이고 눌리게 하려고 두 가지를 같이 쓴다.
// 1. popover="manual" + showPopover()로 토스트 층을 최상위 레이어에 올린다(z-index로는 dialog 위에 못 올라간다).
// 2. 모달이 열려 있으면 그 층을 맨 위 모달 <dialog> 안으로 옮긴다. 모달 바깥은 inert라서 popover만으로는
//    보이기만 하고 눌리지 않으며(누르면 아래 시트의 딤이 눌린다) 스크린 리더에서도 빠진다.

export type ToastHostProps = {
  /** Screen이 없는 화면(로딩·오류)일 때만 쓴다: 하단 내비가 있는 레이아웃이면 내비 위 16, 아니면 화면 아래 16. 기본 true */
  aboveNav?: boolean
  /** 테스트용. 기본은 앱 전체 큐 */
  store?: ToastStore
}

export function ToastHost({ aboveNav = true, store = toastStore }: ToastHostProps) {
  const toasts = useToasts(store)
  const active = toasts.length > 0
  useEffect(
    () =>
      onModalOpen((kind) => {
        if (kind === 'sheet' || kind === 'dialog') store.dismissAll()
      }),
    [store],
  )
  const modal = useTopModalDialog(active)
  if (!active) return null

  return createPortal(
    <TopLayer>
      <ToastViewport anchor="auto" aboveNav={aboveNav}>
        {toasts.map((t) => (
          <Toast
            key={t.id}
            type={t.type}
            message={t.message}
            action={t.action && { label: t.action.label, onClick: () => store.act(t.id) }}
            onPointerEnter={() => store.pause(t.id)}
            onPointerLeave={() => store.resume(t.id)}
            onFocus={() => store.pause(t.id)}
            onBlur={() => store.resume(t.id)}
          />
        ))}
      </ToastViewport>
    </TopLayer>,
    modal ?? document.body,
  )
}

const supportsPopover = () => typeof HTMLElement === 'function' && 'showPopover' in HTMLElement.prototype

/** 화면 전체를 덮는 투명 층(누르기는 통과). Popover API가 없는 브라우저(iOS 16 이하 등)에서는 z-50 고정 층으로 남는다 */
function TopLayer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const popover = supportsPopover()

  // 그리기 전에 연다. 옮겨질 때마다(포털 대상이 바뀌면 새로 만들어진다) 다시 연다.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !popover) return
    try {
      el.showPopover()
    } catch {
      // 이미 열려 있음
    }
  }, [popover])

  return (
    <div
      ref={ref}
      popover={popover ? 'manual' : undefined}
      data-toast-layer=""
      className="pointer-events-none fixed inset-0 z-50 m-0 size-full max-h-none max-w-none overflow-visible border-0 bg-transparent p-0 [&:not(:popover-open)]:hidden"
    >
      {children}
    </div>
  )
}
