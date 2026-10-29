import { clsx } from 'clsx'
import { useId, type HTMLAttributes, type ReactNode } from 'react'
import type { IconName } from '../Icon/icons'
import { RowOption } from '../Row/Option'

// Figma SheetContent/Option(30:69546) · Option 2(BOOLEAN). BottomSheet Content 슬롯용 단일 선택 목록(Row/Option × N, 간격 0).
// v1.6.3(DS18): 최대 2행·간격 4 → N행·간격 0으로 일반화 — HF-10b 통화 7행 · HF-48b 여정 목록(+ "추가 안 함").
// options 개수만큼 그린다. 라디오 그룹이라 화살표 키로 고른다.
export type SheetContentOptionItem = {
  value: string
  /** Figma Title */
  title: ReactNode
  /** Figma subtitle */
  subtitle?: ReactNode
  /** Figma Icon. 기본 bank */
  icon?: IconName
  /** Figma Logo(v1.6.3). 기본 true, false면 원 아이콘 없음(통화·여정 선택) */
  logo?: boolean
  disabled?: boolean
}

export type SheetContentOptionProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange' | 'onSelect' | 'role'> & {
  options: readonly SheetContentOptionItem[]
  /** 선택된 옵션의 value(Row/Option Selected=On) */
  value?: string
  onChange?: (value: string) => void
  /**
   * 옵션을 누를 때마다(이미 선택된 옵션도) — "탭하면 바로 돌아가는" 단계(HF-48b 여정 선택)용.
   * 라디오 onChange는 같은 값을 다시 누르면 오지 않는다
   */
  onSelect?: (value: string) => void
  /** 라디오 name. 기본은 자동 생성 */
  name?: string
  children?: never
}

export function SheetContentOption({ options, value, onChange, onSelect, name, className, ...rest }: SheetContentOptionProps) {
  const autoName = useId()
  return (
    <div role="radiogroup" className={clsx('flex flex-col bg-surface', className)} {...rest}>
      {options.map((option) => (
        <RowOption
          key={option.value}
          name={name ?? autoName}
          value={option.value}
          title={option.title}
          subtitle={option.subtitle}
          icon={option.icon}
          logo={option.logo}
          disabled={option.disabled}
          selected={value === option.value}
          onChange={() => onChange?.(option.value)}
          onClick={onSelect && (() => onSelect(option.value))}
        />
      ))}
    </div>
  )
}
