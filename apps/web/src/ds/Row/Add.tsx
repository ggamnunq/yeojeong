import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing } from '../styles'

// Figma Row/Add(30:69511) · Label(TEXT). 리스트 끝 "추가" 행: 브랜드 원(40, bg/brand-subtle + plus 20) + 브랜드 라벨.
// 계좌·카드 추가(지갑) · 초대코드 공유(Panel/Side) · 새 여정 만들기(Dropdown/Menu). 전폭 행(자체 좌우 20).
export type RowAddProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  /** Figma Label */
  label: ReactNode
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

export function RowAdd({ label, htmlType = 'button', className, ...rest }: RowAddProps) {
  return (
    <button
      type={htmlType}
      className={clsx(
        'flex w-full items-center gap-3 bg-surface px-5 py-3.5 text-left transition-colors select-none enabled:active:bg-pressed',
        focusRing,
        className,
      )}
      {...rest}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-subtle">
        <Icon name="plus" size={20} className="text-icon-brand" />
      </span>
      <span className="min-w-0 truncate text-body-m-strong text-brand">{label}</span>
    </button>
  )
}
