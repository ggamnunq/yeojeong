import { clsx } from 'clsx'
import { useState, type ButtonHTMLAttributes } from 'react'
import { focusRing, touchTarget } from '../styles'

// Figma Toggle(24:8839) · Value=Off/On(value) × State=Default/Disabled(disabled). 라벨이 없으니 aria-label을 넘긴다.
export type ToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'children'> & {
  value?: boolean
  defaultValue?: boolean
  onChange?: (value: boolean) => void
  children?: never
}

export function Toggle({ value, defaultValue = false, onChange, onClick, className, ...rest }: ToggleProps) {
  const [inner, setInner] = useState(defaultValue)
  const on = value ?? inner

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (value === undefined) setInner(!on)
        onChange?.(!on)
      }}
      className={clsx(
        'group inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-neutral-300 p-0.75 transition-colors aria-checked:bg-brand disabled:cursor-not-allowed disabled:bg-muted disabled:aria-checked:bg-primary-200',
        focusRing,
        touchTarget,
        className,
      )}
      {...rest}
    >
      <span className="size-5.5 rounded-full bg-surface shadow-elevation-1 transition-transform group-aria-checked:translate-x-5" />
    </button>
  )
}
