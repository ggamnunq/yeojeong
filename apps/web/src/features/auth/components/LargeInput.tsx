import { clsx } from 'clsx'
import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Icon } from '../../../ds'
import { focusRing, touchTarget } from '../../../ds/styles'

// Figma Input Size=L · Label 숨김(v1.4 승격 후보 #29, HF-03 24:39462). DS Input에는 아직 크기·라벨 숨김 속성이 없어 같은 규칙으로 조합한다.
// 필드: 위아래 16 · 좌우 16 · radius md · 값 Heading/H3 → 높이 약 60. 상태는 DS Input과 같다(포커스 1.5 + Focus/Ring, 오류 border/error + alert).
export type LargeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** 화면에는 보이지 않는 라벨(스크린리더) */
  label: string
  helper?: ReactNode
  /** 오류 문구. 있으면 helper 대신 보이고 aria-invalid */
  error?: string | null
  onClear?: () => void
  clearLabel?: string
  ref?: Ref<HTMLInputElement>
}

export function LargeInput({
  label,
  helper,
  error,
  onClear,
  clearLabel = '입력 지우기',
  id,
  className,
  ref,
  ...rest
}: LargeInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const helperId = `${inputId}-helper`
  const hasValue = String(rest.value ?? '').length > 0
  const message = error ?? helper

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div
        className={clsx(
          'group flex items-center gap-2 rounded-md border bg-surface px-4 py-4 transition-shadow focus-within:shadow-focus-ring',
          error ? 'border-[1.5px] border-error' : 'border-default focus-within:border-[1.5px] focus-within:border-focus',
        )}
      >
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? helperId : undefined}
          className="min-w-0 flex-1 bg-transparent text-h3 text-primary outline-hidden placeholder:text-tertiary"
          {...rest}
        />
        {error ? (
          <Icon name="alert" size={20} className="shrink-0 text-error" />
        ) : (
          onClear &&
          hasValue && (
            <button
              type="button"
              aria-label={clearLabel}
              // 누르는 동안 입력이 포커스를 잃지 않게(✕ 뒤에도 포커스 유지)
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
      {message && (
        <p id={helperId} className={clsx('text-caption', error ? 'text-error' : 'text-tertiary')}>
          {message}
        </p>
      )}
    </div>
  )
}
