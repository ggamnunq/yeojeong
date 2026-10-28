import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing, touchTarget } from '../styles'

// Figma IconButton(24:6386) · Type × Size × State(Pressed = :active, Disabled = disabled)
export type IconButtonType = 'ghost' | 'outline' | 'filled'
export type IconButtonSize = 'l' | 'm' | 's'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  type?: IconButtonType
  size?: IconButtonSize
  /** Figma Icon(인스턴스 교체) */
  icon: IconName
  /** 아이콘만 있으니 스크린리더용 이름이 꼭 필요하다 */
  label: string
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

const TYPE = {
  ghost: 'text-icon-default enabled:active:bg-pressed',
  outline: 'border border-default bg-surface text-icon-default enabled:active:bg-pressed disabled:bg-subtle',
  filled: 'bg-brand text-icon-inverse enabled:active:bg-brand-pressed disabled:bg-muted',
} satisfies Record<IconButtonType, string>

const SIZE = {
  l: 'size-12',
  m: clsx('size-10', touchTarget),
  s: clsx('size-8', touchTarget),
} satisfies Record<IconButtonSize, string>

export function IconButton({
  type = 'ghost',
  size = 'l',
  icon,
  label,
  htmlType = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={htmlType}
      aria-label={label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors select-none disabled:cursor-not-allowed disabled:text-icon-disabled',
        focusRing,
        TYPE[type],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === 's' ? 20 : 24} />
    </button>
  )
}
