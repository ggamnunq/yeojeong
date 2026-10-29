import { clsx } from 'clsx'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Chip(24:7111) · State=Default/Selected/Disabled × Style=Outline/Tone(v1.4, v1.6 속성 연결 복구). 복수 선택용 토글 버튼.
export type ChipStyle = 'outline' | 'tone'

// Figma Style과 이름이 겹쳐 HTML style 속성은 받지 않는다(Callout과 같은 규칙).
export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'style' | 'onChange' | 'children'> & {
  /** Figma Label */
  label: ReactNode
  /** Figma Style. 기본 outline */
  style?: ChipStyle
  selected?: boolean
  defaultSelected?: boolean
  onChange?: (selected: boolean) => void
  children?: never
}

export function Chip({ label, style = 'outline', selected, defaultSelected = false, onChange, onClick, className, ...rest }: ChipProps) {
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
        'group inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-label-m text-secondary transition-colors select-none aria-pressed:bg-brand-subtle aria-pressed:pl-2.5 aria-pressed:text-brand disabled:cursor-not-allowed disabled:bg-subtle disabled:text-disabled',
        style === 'outline'
          ? 'border-default bg-surface aria-pressed:border-focus disabled:border-default'
          : 'border-transparent bg-subtle aria-pressed:border-transparent disabled:border-transparent',
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
