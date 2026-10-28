import { clsx } from 'clsx'
import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing, touchTarget } from '../styles'

// Figma Toast(24:8745) · Type=Success/Info/Error × Action. 짧은 결과 알림(표시만 — 큐·타이머는 호스트가 맡는다).
// bg/inverse, radius/md, Elevation/2, 패딩 14/16, 간격 10 · 아이콘 20 · 문구 Body/S Strong · 액션 Label/M primary/300.
export type ToastType = 'success' | 'info' | 'error'

// Figma가 아이콘 색을 팔레트에 직접 묶어 두었다(역할 토큰 없음)
const TYPE = {
  success: { icon: 'check-circle', color: 'text-success-500' },
  info: { icon: 'info', color: 'text-primary-300' },
  error: { icon: 'alert', color: 'text-error-500' },
} satisfies Record<ToastType, { icon: IconName; color: string }>

export type ToastProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> & {
  type?: ToastType
  /** Figma message */
  message: ReactNode
  /** Figma Action — 값이 있으면 오른쪽에 액션 하나(예: 실행 취소) */
  action?: { label: ReactNode; onClick: MouseEventHandler<HTMLButtonElement> }
}

export function Toast({ type = 'success', message, action, className, ...rest }: ToastProps) {
  const t = TYPE[type]
  return (
    <div
      // 오류는 바로 읽어 주고, 나머지는 하던 말을 끊지 않는다
      role={type === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-md bg-inverse px-4 py-3.5 shadow-elevation-2',
        className,
      )}
      {...rest}
    >
      <Icon name={t.icon} size={20} className={clsx('shrink-0', t.color)} />
      <p className="min-w-0 flex-1 text-body-s-strong text-inverse">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={clsx('shrink-0 rounded-xs text-label-m whitespace-nowrap text-primary-300', focusRing, touchTarget)}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export type ToastViewportProps = HTMLAttributes<HTMLDivElement> & {
  /** 하단 내비가 있는 화면이면 내비 위 16, 없으면 화면 아래 16(둘 다 안전영역 위). 기본 true */
  aboveNav?: boolean
}

/** 토스트를 놓을 자리. 앱 폭(390) 가운데, 좌우 거터 20. 쌓이는 순서·개수·시간은 호스트가 정한다. */
export function ToastViewport({ aboveNav = true, className, children, ...rest }: ToastViewportProps) {
  return (
    <div
      className={clsx(
        'pointer-events-none fixed inset-x-0 z-50 mx-auto flex w-full max-w-screen-width flex-col gap-2 px-gutter *:pointer-events-auto',
        aboveNav
          ? 'bottom-[calc(var(--spacing-nav-height)+--spacing(4)+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(--spacing(4)+env(safe-area-inset-bottom))]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
