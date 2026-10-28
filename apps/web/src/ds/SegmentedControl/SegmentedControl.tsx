import { clsx } from 'clsx'
import { useId, useState, type ReactNode } from 'react'

// Figma SegmentedControl(24:7040) · Count=2/3(labels 개수) × Selected=First/Second/Third
export type SegmentedSelected = 'first' | 'second' | 'third'

const ORDER: readonly SegmentedSelected[] = ['first', 'second', 'third']

export type SegmentedControlProps = {
  /** Figma label 1~3. 개수가 Count가 된다. */
  labels: readonly [ReactNode, ReactNode] | readonly [ReactNode, ReactNode, ReactNode]
  selected?: SegmentedSelected
  defaultSelected?: SegmentedSelected
  onChange?: (selected: SegmentedSelected, index: number) => void
  name?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function SegmentedControl({
  labels,
  selected,
  defaultSelected = 'first',
  onChange,
  name,
  disabled,
  className,
  ...aria
}: SegmentedControlProps) {
  const autoName = useId()
  const [inner, setInner] = useState(defaultSelected)
  const current = selected ?? inner

  return (
    <div
      role="radiogroup"
      aria-disabled={disabled || undefined}
      className={clsx('flex h-11 w-full gap-1 rounded-full bg-subtle p-1', className)}
      {...aria}
    >
      {labels.map((label, index) => {
        const value = ORDER[index]
        return (
          <label
            key={value}
            className={clsx(
              'flex min-w-0 flex-1 items-center justify-center rounded-full text-label-m text-tertiary transition-colors select-none has-checked:bg-surface has-checked:text-primary has-checked:shadow-elevation-1 has-focus-visible:shadow-focus-ring',
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name ?? autoName}
              value={value}
              checked={current === value}
              disabled={disabled}
              onChange={() => {
                if (selected === undefined) setInner(value)
                onChange?.(value, index)
              }}
            />
            <span className="truncate">{label}</span>
          </label>
        )
      })}
    </div>
  )
}
