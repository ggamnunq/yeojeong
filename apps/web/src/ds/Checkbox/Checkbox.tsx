import { clsx } from 'clsx'
import { useEffect, useRef, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing } from '../styles'

// Figma Checkbox(24:8822) · Checked=Off/On(checked)/Indeterminate(indeterminate, v1.7) × State=Default/Disabled(disabled) + Label visible(v1.4). 라벨 전체가 누르는 영역.
// Indeterminate = "전체 선택"에서 일부만 고른 상태: 보라 상자 + 가로 막대(Icon/minus 16). Disabled는 On Disabled와 같은 회색 상자.
export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  /** Figma Label */
  label: ReactNode
  /** Figma Label visible. false면 상자만 보이고 라벨은 스크린리더에만 남는다(접근성 이름). 기본 true */
  labelVisible?: boolean
  /**
   * Figma Checked=Indeterminate(v1.7): 일부 선택. `checked`보다 앞서 보이고, 입력의 `indeterminate`와 `aria-checked="mixed"`를 켠다.
   * 누르면 브라우저가 onChange(checked 반전)를 부르니, 부모가 전체 선택/해제를 정하고 이 값을 다시 계산한다. 기본 false
   */
  indeterminate?: boolean
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
      <CheckboxBox disabled={disabled} {...rest} />
      {labelVisible ? label : <span className="sr-only">{label}</span>}
    </label>
  )
}

export type CheckboxBoxProps = Omit<CheckboxProps, 'label' | 'labelVisible' | 'className'>

/**
 * Checkbox의 상자(22, 진짜 `<input type="checkbox">` + 체크/막대 아이콘)만. 라벨은 감싸는 쪽이 `<label>`로 준다.
 * 행 전체가 라벨인 DS 행(Row/Pick)이 Checkbox 안에 라벨을 또 두지 않으려고 쓴다.
 */
export function CheckboxBox({ indeterminate = false, ref, ...rest }: CheckboxBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  // indeterminate는 HTML 속성이 없어 DOM 속성으로만 켤 수 있다. 누르면 브라우저가 끄므로 매 렌더 다시 맞춘다
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  })

  const setRef = (el: HTMLInputElement | null) => {
    inputRef.current = el
    if (typeof ref === 'function') return ref(el)
    if (ref) ref.current = el
  }

  return (
    <span className="relative grid size-5.5 shrink-0 place-items-center">
      <input
        ref={setRef}
        type="checkbox"
        aria-checked={indeterminate ? 'mixed' : undefined}
        className={clsx(
          'peer col-start-1 row-start-1 size-5.5 cursor-[inherit] appearance-none rounded-xs',
          indeterminate
            ? 'bg-brand disabled:bg-muted'
            : 'border-[1.5px] border-strong bg-surface checked:border-0 checked:bg-brand disabled:border-default disabled:bg-subtle disabled:checked:bg-muted',
          focusRing,
        )}
        {...rest}
      />
      {indeterminate ? (
        <Icon
          name="minus"
          size={16}
          className="pointer-events-none col-start-1 row-start-1 text-icon-inverse peer-disabled:text-icon-disabled"
        />
      ) : (
        <Icon
          name="check"
          size={16}
          className="pointer-events-none col-start-1 row-start-1 hidden text-icon-inverse peer-checked:block peer-disabled:text-icon-disabled"
        />
      )}
    </span>
  )
}
