import { clsx } from 'clsx'
import { useId, type HTMLAttributes, type ReactNode } from 'react'
import type { IconName } from '../Icon/icons'
import { RowOption } from '../Row/Option'

// Figma SheetContent/Option(30:69546) · Option 2(BOOLEAN). BottomSheet Content 슬롯용 단일 선택 목록(Row/Option × n, 간격 4).
// Figma는 옵션 1~2개(Option 2 속성)이고, 코드에서는 options 개수만큼 그린다. 라디오 그룹이라 화살표 키로 고른다.
export type SheetContentOptionItem = {
  value: string
  /** Figma Title */
  title: ReactNode
  /** Figma subtitle */
  subtitle?: ReactNode
  /** Figma Icon. 기본 bank */
  icon?: IconName
  disabled?: boolean
}

export type SheetContentOptionProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange' | 'role'> & {
  options: readonly SheetContentOptionItem[]
  /** 선택된 옵션의 value(Row/Option Selected=On) */
  value?: string
  onChange?: (value: string) => void
  /** 라디오 name. 기본은 자동 생성 */
  name?: string
  children?: never
}

export function SheetContentOption({ options, value, onChange, name, className, ...rest }: SheetContentOptionProps) {
  const autoName = useId()
  return (
    <div role="radiogroup" className={clsx('flex flex-col gap-1 bg-surface', className)} {...rest}>
      {options.map((option) => (
        <RowOption
          key={option.value}
          name={name ?? autoName}
          value={option.value}
          title={option.title}
          subtitle={option.subtitle}
          icon={option.icon}
          disabled={option.disabled}
          selected={value === option.value}
          onChange={() => onChange?.(option.value)}
        />
      ))}
    </div>
  )
}
