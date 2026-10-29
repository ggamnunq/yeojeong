import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react'

// BottomSheet·Dialog가 같이 쓰는 모달 동작. 네이티브 <dialog>.showModal()로 최상위 레이어·배경 inert를 얻고,
// 나머지(ESC·포커스 가두기·포커스 되돌리기·body 스크롤 잠금)는 여기서 직접 맞춘다.
// showModal이 없는 환경(구형 브라우저·jsdom)에서는 open 속성만 켜고 같은 동작을 한다.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
  '[contenteditable="true"]',
].join(',')

export function getFocusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert], [hidden], [aria-hidden="true"]'),
  )
}

// 모달(BottomSheet·Dialog)이 열릴 때 알림(DS17). 화면명세 v0.5.8 0-4: 시트·다이얼로그가 열리면 떠 있던 토스트는 즉시 닫는다.
// DS는 토스트 큐를 갖지 않으므로 호스트(앱 ToastHost)가 구독해서 큐를 비운다.
/** 어떤 모달이 열렸는지. 토스트를 닫는 규칙은 sheet·dialog에만 걸린다(패널·드롭다운은 호스트가 정한다) */
export type ModalKind = 'sheet' | 'dialog' | 'panel' | 'menu'

const modalOpenListeners = new Set<(kind: ModalKind) => void>()

/** BottomSheet·Dialog·Panel/Side·Dropdown/Menu가 열릴 때마다 kind와 함께 부른다. 반환값으로 구독을 끊는다 */
export function onModalOpen(listener: (kind: ModalKind) => void): () => void {
  modalOpenListeners.add(listener)
  return () => {
    modalOpenListeners.delete(listener)
  }
}

// 시트 위에 다이얼로그가 겹쳐도 마지막 하나가 닫힐 때까지 잠가 둔다
let lockCount = 0
let saved = { overflow: '', paddingRight: '' }

function lockScroll() {
  const html = document.documentElement
  if (lockCount++ === 0) {
    saved = { overflow: html.style.overflow, paddingRight: html.style.paddingRight }
    // 데스크톱에서 스크롤바가 사라지며 화면이 옆으로 밀리지 않게 그 폭만큼 채운다
    const scrollbar = html.clientWidth > 0 ? window.innerWidth - html.clientWidth : 0
    html.style.overflow = 'hidden'
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`
  }
  return () => {
    if (--lockCount === 0) {
      html.style.overflow = saved.overflow
      html.style.paddingRight = saved.paddingRight
    }
  }
}

export function useModalDialog(open: boolean, onClose: () => void, kind: ModalKind = 'dialog') {
  const ref = useRef<HTMLDialogElement>(null)
  const latest = useRef({ open, onClose, kind })
  useLayoutEffect(() => {
    latest.current = { open, onClose, kind }
  })

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
    if (!dialog.contains(document.activeElement)) (getFocusables(dialog)[0] ?? dialog).focus()
    const unlock = lockScroll()
    for (const listener of [...modalOpenListeners]) listener(latest.current.kind)

    return () => {
      unlock()
      if (typeof dialog.close === 'function') {
        if (dialog.open) dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
      if (returnTo?.isConnected) returnTo.focus()
    }
  }, [open])

  const requestClose = () => {
    if (latest.current.open) latest.current.onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const dialog = ref.current
    if (!dialog) return
    if (event.key === 'Escape') {
      // keydown을 막으면 브라우저의 cancel(닫기 요청)은 오지 않는다. 겹친 바깥 모달까지 닫히지 않게 전파도 끊는다.
      event.preventDefault()
      event.stopPropagation()
      requestClose()
      return
    }
    if (event.key !== 'Tab') return
    event.stopPropagation()
    const items = getFocusables(dialog)
    if (items.length === 0) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  // 안드로이드 뒤로 가기 같은 닫기 요청. 열림 상태는 부모가 쥐고 있으니 직접 닫지 않고 알리기만 한다.
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    requestClose()
  }

  // 브라우저가 강제로 닫은 경우(취소를 연달아 막을 때 등) 부모 상태를 맞춘다.
  // close 이벤트는 비동기라, 그 사이 다시 열렸으면(StrictMode의 effect 재실행 등) 무시한다.
  const onNativeClose = () => {
    if (!ref.current?.open) requestClose()
  }

  return { ref, requestClose, dialogProps: { ref, onKeyDown, onCancel, onClose: onNativeClose } }
}
