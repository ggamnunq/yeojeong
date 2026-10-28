import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing, touchTarget } from '../styles'

// Figma Button(24:6232) · Type × Size × State(Pressed = :active, Disabled = disabled)
export type ButtonType = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'l' | 'm' | 's'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  type?: ButtonType
  size?: ButtonSize
  /** Figma Label */
  label: ReactNode
  /** Figma Leading icon */
  leadingIcon?: boolean
  /** Figma Icon(인스턴스 교체). leadingIcon이 켜졌을 때 보인다. */
  icon?: IconName
  /** HTML button type (Figma Type과 이름이 겹쳐 따로 둔다) */
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

const TYPE = {
  primary: 'bg-brand text-inverse enabled:active:bg-brand-pressed disabled:bg-muted',
  secondary:
    'border border-strong bg-surface text-primary enabled:active:bg-pressed disabled:border-default disabled:bg-subtle',
  ghost: 'text-brand enabled:active:bg-brand-subtle',
  danger: 'bg-danger text-inverse enabled:active:bg-danger-pressed disabled:bg-muted',
} satisfies Record<ButtonType, string>

const ICON_COLOR = {
  primary: 'text-icon-inverse',
  secondary: 'text-icon-default',
  ghost: 'text-icon-brand',
  danger: 'text-icon-inverse',
} satisfies Record<ButtonType, string>

const SIZE = {
  l: 'h-14 gap-2 rounded-md px-5 text-label-l',
  m: 'h-12 gap-1.5 rounded-md px-4 text-label-l',
  s: clsx('h-9 gap-1 rounded-sm px-3 text-label-m', touchTarget),
} satisfies Record<ButtonSize, string>

export function Button({
  type = 'primary',
  size = 'l',
  label,
  leadingIcon = false,
  icon = 'plus',
  htmlType = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={htmlType}
      className={clsx(
        'group inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:text-disabled',
        focusRing,
        TYPE[type],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {leadingIcon && (
        <Icon
          name={icon}
          size={size === 's' ? 16 : 20}
          className={clsx('shrink-0 group-disabled:text-icon-disabled', ICON_COLOR[type])}
        />
      )}
      {label}
    </button>
  )
}
