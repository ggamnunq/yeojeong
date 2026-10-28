import { useLayoutEffect, useState } from 'react'

// 열린 모달 <dialog>(BottomSheet·Dialog의 showModal) 중 맨 위의 것을 찾는다.
// 모달이 열리면 그 바깥은 전부 inert라서, 바깥의 popover는 위에 보이기만 할 뿐 눌리지 않고 스크린 리더에서도 빠진다.
// 그래서 토스트는 맨 위 모달 안으로 옮겨 그린다.

function isModal(dialog: HTMLDialogElement) {
  if (!dialog.open) return false
  // showModal이 없는 환경(구형 브라우저·jsdom)에서는 useModalDialog가 open 속성만 켜므로 open이면 모달로 본다
  if (typeof dialog.showModal !== 'function') return true
  try {
    return dialog.matches(':modal')
  } catch {
    return true
  }
}

function openModals(root: ParentNode) {
  return Array.from(root.querySelectorAll('dialog')).filter(isModal)
}

/**
 * enabled인 동안 맨 위 모달 dialog를 돌려준다(없으면 null).
 * 최상위 레이어 순서는 API로 알 수 없어서, 지켜보는 동안 열린 순서를 기억하고 처음 본 것들은 문서 순서로 둔다.
 */
export function useTopModalDialog(enabled: boolean): HTMLDialogElement | null {
  const [top, setTop] = useState<HTMLDialogElement | null>(null)

  useLayoutEffect(() => {
    if (!enabled) return
    let stack: HTMLDialogElement[] = []
    const update = () => {
      const modals = openModals(document)
      stack = [...stack.filter((d) => modals.includes(d)), ...modals.filter((d) => !stack.includes(d))]
      setTop(stack.at(-1) ?? null)
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    return () => {
      observer.disconnect()
      setTop(null)
    }
  }, [enabled])

  return enabled ? top : null
}
