import { clsx } from 'clsx'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Input(24:6970) · State=Default/Focus(:focus-within)/Error(error)/Disabled(disabled)
export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Figma Label */
  label: ReactNode
  /** Figma Helper. 넘기면 아래에 보이고, error일 때는 오류 문구로 읽힌다. */
  helper?: ReactNode
  error?: boolean
  /** 넘기면 입력값이 있을 때 포커스 중에 지우기 버튼(Icon close)을 보인다 */
  onClear?: () => void
  clearLabel?: string
}

export function Input({
  label,
  helper,
  error = false,
  onClear,
  clearLabel = '입력 지우기',
  disabled,
  id,
  className,
  ...rest
}: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const helperId = `${inputId}-helper`
  const hasValue = rest.value === undefined ? true : String(rest.value).length > 0

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className={clsx('text-body-s-strong', disabled ? 'text-disabled' : 'text-primary')}>
        {label}
      </label>
      <div
        className={clsx(
          'group flex h-13 items-center gap-2 rounded-md border px-4 transition-shadow',
          disabled
            ? 'border-default bg-subtle'
            : clsx(
                'bg-surface focus-within:shadow-focus-ring',
                error ? 'border-[1.5px] border-error' : 'border-default focus-within:border-[1.5px] focus-within:border-focus',
              ),
        )}
      >
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={error || undefined}
          aria-describedby={helper ? helperId : undefined}
          className="min-w-0 flex-1 bg-transparent text-body-l text-primary outline-hidden placeholder:text-tertiary disabled:text-disabled"
          {...rest}
        />
        {error ? (
          <Icon name="alert" size={20} className="shrink-0 text-error" />
        ) : (
          onClear &&
          hasValue &&
          !disabled && (
            <button
              type="button"
              aria-label={clearLabel}
              onClick={onClear}
              className={clsx(
                'hidden shrink-0 rounded-full text-icon-subtle group-focus-within:inline-flex',
                focusRing,
                touchTarget,
              )}
            >
              <Icon name="close" size={20} />
            </button>
          )
        )}
      </div>
      {helper && (
        <p
          id={helperId}
          className={clsx('text-caption', error ? 'text-error' : disabled ? 'text-disabled' : 'text-tertiary')}
        >
          {helper}
        </p>
      )}
    </div>
  )
}
