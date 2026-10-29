import { clsx } from 'clsx'
import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Input(24:6970) · State=Default/Focus(:focus-within)/Error(error)/Disabled(disabled) × Size=M/L + Label visible(v1.4)
// Size=M = 필드 52 · 값 Body/L. Size=L = 온보딩 큰 입력(필드 60 · 값 Heading/H3, HF-03).
export type InputSize = 'm' | 'l'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** Figma Label */
  label: ReactNode
  /** Figma Size. 기본 m */
  size?: InputSize
  /** Figma Label visible. false면 라벨을 화면에서 숨기고 스크린리더에만 남긴다(입력의 접근성 이름). 기본 true */
  labelVisible?: boolean
  /** Figma Helper. 넘기면 아래에 보이고, error일 때는 오류 문구로 읽힌다. */
  helper?: ReactNode
  error?: boolean
  /** 넘기면 입력값이 있을 때 포커스 중에 지우기 버튼(Icon close)을 보인다 */
  onClear?: () => void
  clearLabel?: string
  /** HTML input size(보이는 글자 수). Figma Size와 이름이 겹쳐 따로 둔다 */
  htmlSize?: number
  ref?: Ref<HTMLInputElement>
}

const FIELD = {
  m: 'h-13',
  l: 'h-15',
} satisfies Record<InputSize, string>

const VALUE = {
  m: 'text-body-l',
  l: 'text-h3',
} satisfies Record<InputSize, string>

export function Input({
  label,
  size = 'm',
  labelVisible = true,
  helper,
  error = false,
  onClear,
  clearLabel = '입력 지우기',
  htmlSize,
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
      <label
        htmlFor={inputId}
        className={clsx(labelVisible ? 'text-body-s-strong' : 'sr-only', disabled ? 'text-disabled' : 'text-primary')}
      >
        {label}
      </label>
      <div
        className={clsx(
          'group flex items-center gap-2 rounded-md border px-4 transition-shadow',
          FIELD[size],
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
          size={htmlSize}
          disabled={disabled}
          aria-invalid={error || undefined}
          aria-describedby={helper ? helperId : undefined}
          className={clsx(
            'min-w-0 flex-1 bg-transparent text-primary outline-hidden placeholder:text-tertiary disabled:text-disabled',
            VALUE[size],
          )}
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
              // 누르는 동안 입력이 포커스를 잃지 않게(지운 뒤에도 바로 이어서 입력)
              onMouseDown={(e) => e.preventDefault()}
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
