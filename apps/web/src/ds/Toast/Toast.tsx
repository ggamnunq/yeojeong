import { clsx } from 'clsx'
import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing, touchTarget } from '../styles'
import { useToastAnchor, type ToastAnchor } from './anchor'

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
  /**
   * 토스트 위치 기준(화면명세 v0.5.8 0-4, DS17). 모두 그 위 16, 안전영역 포함.
   * nav = 하단 내비 위 · cta = 하단 고정 CTA 위(내비 없음) · nav-cta = 내비 위 CTA 위 · safe-area = 화면 아래.
   * auto = 지금 그려진 Screen(셸)의 하단 구성을 따른다(Screen이 없으면 aboveNav로 정한다).
   * 생략하면 v1.6까지처럼 aboveNav로 정한다.
   */
  anchor?: ToastAnchor | 'auto'
  /** (v1.6 호환) anchor가 없을 때: true = 내비 위 16, false = 화면 아래 16. 기본 true */
  aboveNav?: boolean
}

// 하단 영역 높이: 내비 64(--spacing-nav-height) · CTA 영역 = 위 12 + 버튼 56 + 아래 12(내비 위) / 16(내비 없음)
const ANCHOR_BOTTOM = {
  nav: 'bottom-[calc(var(--spacing-nav-height)+--spacing(4)+env(safe-area-inset-bottom))]',
  'nav-cta': 'bottom-[calc(var(--spacing-nav-height)+--spacing(24)+env(safe-area-inset-bottom))]',
  cta: 'bottom-[calc(--spacing(25)+env(safe-area-inset-bottom))]',
  'safe-area': 'bottom-[calc(--spacing(4)+env(safe-area-inset-bottom))]',
} satisfies Record<ToastAnchor, string>

/** 토스트를 놓을 자리. 앱 폭(390) 가운데, 좌우 거터 20. 쌓이는 순서·개수·시간은 호스트가 정한다. */
export function ToastViewport({ anchor, aboveNav = true, className, children, ...rest }: ToastViewportProps) {
  const screenAnchor = useToastAnchor()
  const fallback: ToastAnchor = aboveNav ? 'nav' : 'safe-area'
  const resolved = anchor === 'auto' ? (screenAnchor ?? fallback) : (anchor ?? fallback)
  return (
    <div
      data-anchor={resolved}
      className={clsx(
        'pointer-events-none fixed inset-x-0 z-50 mx-auto flex w-full max-w-screen-width flex-col gap-2 px-gutter *:pointer-events-auto',
        ANCHOR_BOTTOM[resolved],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
