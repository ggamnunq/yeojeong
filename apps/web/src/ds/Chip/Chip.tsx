import { clsx } from 'clsx'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Chip(24:7111) · State=Default/Selected/Disabled × Style=Outline/Tone(v1.4, v1.6 속성 연결 복구) + Removable(v1.6). 복수 선택용 토글 버튼.
// 선택 체크(16)는 Outline에만 붙는다(Tone 선택은 면 색으로만). Removable = 오른쪽 ✕ 16 — 선택된 필터를 누르면 해제("확인 필요 2건 ✕"),
// ✕가 있으면 체크는 그리지 않는다(같은 칩에 표시가 둘이면 시끄럽다). ✕는 칩 버튼의 일부라 따로 포커스되지 않는다.
export type ChipStyle = 'outline' | 'tone'

// Figma Style과 이름이 겹쳐 HTML style 속성은 받지 않는다(Callout과 같은 규칙).
export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'style' | 'onChange' | 'children'> & {
  /** Figma Label */
  label: ReactNode
  /** Figma Style. 기본 outline */
  style?: ChipStyle
  /** Figma Removable: 오른쪽 ✕ 16. 누르면 선택이 풀리는 필터 칩. 접근성 이름에 "해제"가 들어가도록 aria-label을 같이 주는 것을 권한다 */
  removable?: boolean
  selected?: boolean
  defaultSelected?: boolean
  onChange?: (selected: boolean) => void
  children?: never
}

export function Chip({ label, style = 'outline', removable = false, selected, defaultSelected = false, onChange, onClick, className, ...rest }: ChipProps) {
  const [inner, setInner] = useState(defaultSelected)
  const on = selected ?? inner
  const check = style === 'outline' && !removable

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
        'group inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-label-m text-secondary transition-colors select-none aria-pressed:bg-brand-subtle aria-pressed:text-brand disabled:cursor-not-allowed disabled:bg-subtle disabled:text-disabled',
        style === 'outline'
          ? clsx('border-default bg-surface aria-pressed:border-focus disabled:border-default', check && 'aria-pressed:pl-2.5')
          : 'border-transparent bg-subtle aria-pressed:border-transparent disabled:border-transparent',
        focusRing,
        touchTarget,
        className,
      )}
      {...rest}
    >
      {on && check && <Icon name="check" size={16} className="shrink-0 text-icon-brand group-disabled:text-icon-disabled" />}
      {label}
      {removable && (
        <Icon
          name="close"
          size={16}
          className="shrink-0 text-icon-subtle group-aria-pressed:text-icon-brand group-disabled:text-icon-disabled"
        />
      )}
    </button>
  )
}
