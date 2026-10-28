import { clsx } from 'clsx'
import { useId, type ReactNode } from 'react'
import { Icon, type IconName } from '../../../ds'

// 누르면 시트를 여는 입력란(장소 검색 · 기간 선택). DS Input과 같은 겉모습(라벨 Body/S Strong · 52 · radius md · 오른쪽 아이콘 20)이지만
// 글자를 직접 받지 않는 버튼이다. DS Input에 trailing icon·읽기 전용 선택 변형이 없어 플로우에서 조합했다(DS 추가 요청).
export type PickerFieldProps = {
  /** 폼 오류 포커스용(서버 DTO 경로와 같게) */
  name: string
  label: ReactNode
  /** 고른 값. 없으면 플레이스홀더 */
  value?: ReactNode
  placeholder: string
  /** Figma trailing icon: 장소 marker · 기간 calendar */
  icon: IconName
  /** 오류 문구. 있으면 Input State=Error 모양 */
  error?: string | null
  disabled?: boolean
  onOpen: () => void
}

export function PickerField({ name, label, value, placeholder, icon, error, disabled = false, onOpen }: PickerFieldProps) {
  const id = useId()
  const hasValue = value != null && value !== ''
  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className={clsx('text-body-s-strong', disabled ? 'text-disabled' : 'text-primary')}>
        {label}
      </span>
      <button
        type="button"
        name={name}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-helper` : undefined}
        onClick={onOpen}
        className={clsx(
          'flex h-13 w-full items-center gap-2 rounded-md border px-4 text-left outline-hidden transition-shadow select-none',
          disabled
            ? 'border-default bg-subtle'
            : clsx(
                'bg-surface focus-visible:shadow-focus-ring',
                error ? 'border-[1.5px] border-error' : 'border-default focus-visible:border-[1.5px] focus-visible:border-focus',
              ),
        )}
      >
        <span
          id={`${id}-value`}
          className={clsx(
            'min-w-0 flex-1 truncate text-body-l',
            disabled ? 'text-disabled' : hasValue ? 'text-primary' : 'text-tertiary',
          )}
        >
          {hasValue ? value : placeholder}
        </span>
        <Icon
          name={error ? 'alert' : icon}
          size={20}
          className={clsx('shrink-0', error ? 'text-error' : disabled ? 'text-icon-disabled' : 'text-icon-subtle')}
        />
      </button>
      {error && (
        <p id={`${id}-helper`} className="text-caption text-error">
          {error}
        </p>
      )}
    </div>
  )
}
