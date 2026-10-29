import { clsx } from 'clsx'
import { useId, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'

// Figma Input Type=Picker(v1.6 · 60:10366 Default · 60:10380 Focus · 60:10396 Error · 60:10412 Disabled), Size=M.
// 읽기 전용 값 + ⌄. 누르면 시트가 열린다 — 기간(SheetContent/DateRange) · 장소(도시 검색). 글자를 직접 받지 않으니 <input>이 아니라 <button>.
// 겉모습은 Input M과 같다: 라벨 Body/S Strong → 필드 52(radius md · 좌우 16) → 오류 문구 Caption.
// 오류여도 ⌄는 그대로(경고 아이콘 없음, 테두리 border/error 1.5 + 문구). 비활성은 bg/subtle + 값 text/secondary.
export type InputPickerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'value' | 'children'> & {
  /** Figma Label */
  label: ReactNode
  /** Figma Label visible. false면 라벨을 화면에서 숨기고 스크린리더에만 남긴다. 기본 true */
  labelVisible?: boolean
  /** 고른 값("11.12 (목) – 11.15 (일)"). 없으면 placeholder */
  value?: ReactNode
  /** 값이 없을 때(text/tertiary): 기간 "출발일 – 도착일" · 장소 "도시 검색" */
  placeholder: ReactNode
  error?: boolean
  /** 오류 문구. error와 같이 쓴다(설명형 헬퍼는 쓰지 않는다, v1.6.1) */
  helper?: ReactNode
  /** Figma Suffix · Suffix text */
  suffix?: boolean
  suffixText?: ReactNode
  /** Figma Trailing icon · Icon: ⌄ 앞 아이콘 슬롯(20, 장식). 기본 false · calendar */
  trailingIcon?: boolean
  icon?: IconName
  /** 누르면 열리는 것. 기본 dialog(시트) */
  'aria-haspopup'?: 'dialog' | 'listbox' | 'menu' | boolean
  ref?: Ref<HTMLButtonElement>
}

export function InputPicker({
  label,
  labelVisible = true,
  value,
  placeholder,
  error = false,
  helper,
  suffix = false,
  suffixText = '원',
  trailingIcon = false,
  icon = 'calendar',
  disabled,
  id,
  className,
  'aria-haspopup': hasPopup = 'dialog',
  ...rest
}: InputPickerProps) {
  const autoId = useId()
  const buttonId = id ?? autoId
  const labelId = `${buttonId}-label`
  const valueId = `${buttonId}-value`
  const helperId = `${buttonId}-helper`
  const hasValue = value != null && value !== ''

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <span id={labelId} className={clsx(labelVisible ? 'text-body-s-strong' : 'sr-only', disabled ? 'text-disabled' : 'text-primary')}>
        {label}
      </span>
      <button
        type="button"
        id={buttonId}
        disabled={disabled}
        aria-haspopup={hasPopup}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-invalid={error || undefined}
        aria-describedby={helper ? helperId : undefined}
        className={clsx(
          'flex h-13 w-full items-center gap-2 rounded-md border px-4 text-left outline-hidden transition-shadow select-none',
          disabled
            ? 'cursor-not-allowed border-default bg-subtle'
            : clsx(
                'bg-surface focus-visible:shadow-focus-ring',
                error ? 'border-[1.5px] border-error' : 'border-default focus-visible:border-[1.5px] focus-visible:border-focus',
              ),
        )}
        {...rest}
      >
        <span
          id={valueId}
          className={clsx(
            'min-w-0 flex-1 truncate text-body-l',
            disabled ? 'text-secondary' : hasValue ? 'text-primary' : 'text-tertiary',
          )}
        >
          {hasValue ? value : placeholder}
        </span>
        {suffix && <span className="shrink-0 text-body-l whitespace-nowrap text-secondary">{suffixText}</span>}
        {trailingIcon && (
          <Icon name={icon} size={20} className={clsx('shrink-0', disabled ? 'text-icon-disabled' : 'text-icon-subtle')} />
        )}
        <Icon name="chevron-down" size={20} className={clsx('shrink-0', disabled ? 'text-icon-disabled' : 'text-icon-subtle')} />
      </button>
      {helper && (
        <p id={helperId} className={clsx('text-caption', error ? 'text-error' : disabled ? 'text-disabled' : 'text-tertiary')}>
          {helper}
        </p>
      )}
    </div>
  )
}
