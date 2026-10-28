import { clsx } from 'clsx'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Chip(24:7111) · State=Default/Selected(selected)/Disabled(disabled). 복수 선택용 토글 버튼.
export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onChange' | 'children'> & {
  /** Figma Label */
  label: ReactNode
  selected?: boolean
  defaultSelected?: boolean
  onChange?: (selected: boolean) => void
  children?: never
}

export function Chip({ label, selected, defaultSelected = false, onChange, onClick, className, ...rest }: ChipProps) {
  const [inner, setInner] = useState(defaultSelected)
  const on = selected ?? inner

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (selected === undefined) setInner(!on)
        onChange?.(!on)
      }}
      className={clsx(
        'group inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-default bg-surface px-3.5 text-label-m text-secondary transition-colors select-none aria-pressed:border-focus aria-pressed:bg-brand-subtle aria-pressed:pl-2.5 aria-pressed:text-brand disabled:cursor-not-allowed disabled:border-default disabled:bg-subtle disabled:text-disabled',
        focusRing,
        touchTarget,
        className,
      )}
      {...rest}
    >
      {on && <Icon name="check" size={16} className="shrink-0 text-icon-brand group-disabled:text-icon-disabled" />}
      {label}
    </button>
  )
}
