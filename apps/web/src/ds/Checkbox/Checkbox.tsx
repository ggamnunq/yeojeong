import { clsx } from 'clsx'
import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing } from '../styles'

// Figma Checkbox(24:8822) · Checked=Off/On(checked) × State=Default/Disabled(disabled) + Label visible(v1.4). 라벨 전체가 누르는 영역.
export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  /** Figma Label */
  label: ReactNode
  /** Figma Label visible. false면 상자만 보이고 라벨은 스크린리더에만 남는다(접근성 이름). 기본 true */
  labelVisible?: boolean
  ref?: Ref<HTMLInputElement>
  children?: never
}

export function Checkbox({ label, labelVisible = true, disabled, className, ...rest }: CheckboxProps) {
  return (
    <label
      className={clsx(
        'relative inline-flex items-center gap-2.5 py-2.5 text-body-m before:absolute before:inset-x-0 before:top-1/2 before:h-touch-min before:-translate-y-1/2',
        // 상자만 보일 때도 누르는 영역은 44×44
        !labelVisible && 'before:left-1/2 before:w-touch-min before:-translate-x-1/2',
        disabled ? 'cursor-not-allowed text-disabled' : 'cursor-pointer text-primary',
        className,
      )}
    >
      <span className="relative grid size-5.5 shrink-0 place-items-center">
        <input
          type="checkbox"
          disabled={disabled}
          className={clsx(
            'peer col-start-1 row-start-1 size-5.5 cursor-[inherit] appearance-none rounded-xs border-[1.5px] border-strong bg-surface checked:border-0 checked:bg-brand disabled:border-default disabled:bg-subtle disabled:checked:bg-muted',
            focusRing,
          )}
          {...rest}
        />
        <Icon
          name="check"
          size={16}
          className="pointer-events-none col-start-1 row-start-1 hidden text-icon-inverse peer-checked:block peer-disabled:text-icon-disabled"
        />
      </span>
      {labelVisible ? label : <span className="sr-only">{label}</span>}
    </label>
  )
}
