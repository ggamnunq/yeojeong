import { clsx } from 'clsx'
import type { MouseEventHandler, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing } from '../styles'

// Figma NavItem(24:7347) · State=Active/Inactive · Label · Icon. BottomNav 안의 탭 하나(아이콘 24 + Label/S, 간격 2).
export type NavItemState = 'active' | 'inactive'

export type NavItemProps = {
  state?: NavItemState
  /** Figma Label */
  label: ReactNode
  /** Figma Icon(인스턴스 교체) */
  icon: IconName
  /** 있으면 링크(<a>), 없으면 버튼으로 그린다 */
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
  className?: string
}

const STATE = {
  active: { icon: 'text-icon-brand', label: 'text-brand' },
  inactive: { icon: 'text-icon-subtle', label: 'text-tertiary' },
} satisfies Record<NavItemState, { icon: string; label: string }>

export function NavItem({ state = 'inactive', label, icon, href, onClick, className }: NavItemProps) {
  const st = STATE[state]
  const props = {
    // 현재 탭은 색만이 아니라 aria-current로도 알린다
    'aria-current': state === 'active' ? ('page' as const) : undefined,
    onClick,
    className: clsx(
      'flex h-nav-height w-full flex-col items-center justify-center gap-0.5 rounded-md select-none',
      focusRing,
      className,
    ),
  }
  const children = (
    <>
      <Icon name={icon} size={24} className={clsx('shrink-0', st.icon)} />
      <span className={clsx('text-label-s whitespace-nowrap', st.label)}>{label}</span>
    </>
  )
  return href ? (
    <a href={href} {...props}>
      {children}
    </a>
  ) : (
    <button type="button" {...props}>
      {children}
    </button>
  )
}
