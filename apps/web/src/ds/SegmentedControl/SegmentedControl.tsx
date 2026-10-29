import { clsx } from 'clsx'
import { useId, useState, type ReactNode } from 'react'

// Figma SegmentedControl(24:7040) · Count=2/3(labels 개수) × Selected=First/Second/Third × Size=M/S(v1.6) + Disabled 1~3(v1.6)
// Size=M = 높이 44 · 패딩 4 · Label/M · 폭 FILL. Size=S = 높이 32 · 패딩 2 · Label/S · 폭 176(2칸)/240(3칸) — 컨트롤 줄 오른쪽 작은 토글(HF-18).
// Disabled n = 그 칸만 흐림(bg/subtle 60% 덮개) + 선택 불가. 칸 비활성은 화살표 키 이동에서도 건너뛴다(네이티브 라디오).
export type SegmentedSelected = 'first' | 'second' | 'third'
export type SegmentedControlSize = 'm' | 's'

const ORDER: readonly SegmentedSelected[] = ['first', 'second', 'third']

export type SegmentedControlProps = {
  /** Figma label 1~3. 개수가 Count가 된다. */
  labels: readonly [ReactNode, ReactNode] | readonly [ReactNode, ReactNode, ReactNode]
  selected?: SegmentedSelected
  defaultSelected?: SegmentedSelected
  onChange?: (selected: SegmentedSelected, index: number) => void
  /** Figma Size. 기본 m(FILL), s는 폭 176/240 고정 */
  size?: SegmentedControlSize
  /** Figma Disabled 1~3: 흐리게 하고 고를 수 없는 칸. 예) ['second'] = Disabled 2 */
  disabledItems?: readonly SegmentedSelected[]
  name?: string
  /** 전체 비활성 */
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

const SIZE = {
  m: 'h-11 w-full gap-1 p-1',
  s: 'h-8 shrink-0 gap-0.5 p-0.5',
} satisfies Record<SegmentedControlSize, string>

export function SegmentedControl({
  labels,
  selected,
  defaultSelected = 'first',
  onChange,
  size = 'm',
  disabledItems,
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
      className={clsx(
        'flex rounded-full bg-subtle',
        SIZE[size],
        size === 's' && (labels.length === 3 ? 'w-60' : 'w-44'),
        className,
      )}
      {...aria}
    >
      {labels.map((label, index) => {
        const value = ORDER[index]
        const itemDisabled = disabledItems?.includes(value) ?? false
        const off = disabled || itemDisabled
        return (
          <label
            key={value}
            className={clsx(
              'relative flex min-w-0 flex-1 items-center justify-center rounded-full text-tertiary transition-colors select-none has-checked:bg-surface has-checked:text-primary has-checked:shadow-elevation-1 has-focus-visible:shadow-focus-ring',
              size === 's' ? 'text-label-s' : 'text-label-m',
              off ? 'cursor-not-allowed' : 'cursor-pointer',
              disabled && 'opacity-50',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name ?? autoName}
              value={value}
              checked={current === value}
              disabled={off}
              onChange={() => {
                if (selected === undefined) setInner(value)
                onChange?.(value, index)
              }}
            />
            <span className="truncate">{label}</span>
            {/* Figma disabled n: 칸 위에 bg/subtle 60% 덮개 */}
            {itemDisabled && !disabled && <span aria-hidden className="absolute inset-0 rounded-full bg-subtle opacity-60" />}
          </label>
        )
      })}
    </div>
  )
}
