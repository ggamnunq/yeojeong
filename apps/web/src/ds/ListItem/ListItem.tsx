import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing } from '../styles'

// Figma ListItem(24:8635) · Type=Navigation/Value/Selected/Destructive + Subtitle · Leading icon
// 여정 정보(기간·장소·예산·초대코드), 그룹 목록, 마이페이지 메뉴, 지갑 계좌.
// Navigation·Selected·Destructive는 버튼. Value는 onClick이 없으면 누를 수 없는 행(div)이다.
export type ListItemType = 'navigation' | 'value' | 'selected' | 'destructive'

export type ListItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children' | 'value'> & {
  type?: ListItemType
  /** Figma title */
  title: ReactNode
  /** Figma subtitle. 주면 Subtitle이 켜진다 */
  subtitle?: ReactNode
  /** Figma Leading icon. 주면 켜진다 */
  leadingIcon?: IconName
  /** Figma value(Value만): "₩1,500,000" */
  value?: ReactNode
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

export function ListItem({
  type = 'navigation',
  title,
  subtitle,
  leadingIcon,
  value,
  htmlType = 'button',
  className,
  onClick,
  ...rest
}: ListItemProps) {
  const destructive = type === 'destructive'
  const interactive = type !== 'value' || onClick !== undefined
  const base = clsx('flex w-full items-center gap-3 bg-surface px-5 py-3.5 text-left', className)

  const content = (
    <>
      {leadingIcon && (
        <Icon name={leadingIcon} size={20} className={clsx('shrink-0', destructive ? 'text-error' : 'text-icon-default')} />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={clsx('truncate text-body-m', destructive ? 'text-error' : 'text-primary')}>{title}</span>
        {subtitle != null && <span className="truncate text-caption text-tertiary">{subtitle}</span>}
      </span>
      {type === 'value' && value != null && (
        <span className="shrink-0 font-amount text-amount-s whitespace-nowrap text-primary">{value}</span>
      )}
      {type === 'navigation' && <Icon name="chevron-right" size={20} className="shrink-0 text-icon-subtle" />}
      {type === 'selected' && <Icon name="check" size={20} label="선택됨" className="shrink-0 text-icon-brand" />}
    </>
  )

  if (!interactive) return <div className={base}>{content}</div>

  return (
    <button
      type={htmlType}
      aria-current={type === 'selected' ? 'true' : undefined}
      onClick={onClick}
      className={clsx(base, 'transition-colors select-none enabled:active:bg-pressed', focusRing)}
      {...rest}
    >
      {content}
    </button>
  )
}
