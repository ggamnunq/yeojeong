import { clsx } from 'clsx'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing } from '../styles'

// Figma Row/Option(30:69543) · Selected=On/Off + Title(TEXT) · Icon(INSTANCE_SWAP) · Logo · Subtitle(v1.6.3). 시트 안 단일 선택 옵션 행(350 × 64).
// v1.6.3(DS18): Logo off = 원 아이콘 없음(HF-10b 통화 · HF-48b 여정), Subtitle off = 보조 줄 없음(높이 46) — subtitle을 넘기지 않으면 off.
// 원 아이콘(40, bg/subtle) + 제목 + 부제 + 오른쪽 라디오(Off = 회색 링 · On = 보라 원 + 체크).
// 진짜 라디오 입력이라 같은 name끼리 화살표 키로 움직인다. 보통 SheetContentOption 안에서 쓴다.
export type RowOptionProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'title' | 'checked' | 'defaultChecked'
> & {
  /** Figma Title */
  title: ReactNode
  /** Figma subtitle(Subtitle 켜짐): "은행·카드를 한 번에 연결" · "진행 중 · 11.12 – 11.15". 생략 = Subtitle off */
  subtitle?: ReactNode
  /** Figma Icon(인스턴스 교체). 기본 bank */
  icon?: IconName
  /** Figma Logo(v1.6.3): 왼쪽 원 아이콘(40). 기본 true, false면 제목·보조 줄만(HF-10b · 48b) */
  logo?: boolean
  /** Figma Selected */
  selected?: boolean
}

export function RowOption({ title, subtitle, icon = 'bank', logo = true, selected, disabled, className, ...rest }: RowOptionProps) {
  return (
    <label
      className={clsx(
        'flex w-full items-center gap-3 py-3 select-none',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        className,
      )}
    >
      {logo && (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle">
          <Icon name={icon} size={20} className="text-icon-default" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-m-strong text-primary">{title}</span>
        {subtitle != null && <span className="truncate text-caption text-tertiary">{subtitle}</span>}
      </span>
      <span className="grid size-5.5 shrink-0 place-items-center">
        <input
          type="radio"
          checked={selected}
          disabled={disabled}
          className={clsx(
            'peer col-start-1 row-start-1 size-5.5 cursor-[inherit] appearance-none rounded-full border-[1.5px] border-strong bg-surface checked:border-0 checked:bg-brand',
            focusRing,
          )}
          {...rest}
        />
        <Icon name="check" size={14} className="pointer-events-none col-start-1 row-start-1 hidden text-icon-inverse peer-checked:block" />
      </span>
    </label>
  )
}
