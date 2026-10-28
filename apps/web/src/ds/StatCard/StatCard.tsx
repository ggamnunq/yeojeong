import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { formatKrw } from '../format'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'

// Figma StatCard(24:8452) · Type=Default/Brand × Size=L/M. 현황 탭 요약 숫자.
// Brand(보라 면)는 화면당 하나 — "내가 낼 금액"에만. 폭은 부모가 정한다(L = 한 줄 350, M = 두 열 167).
export type StatCardType = 'default' | 'brand'
export type StatCardSize = 'l' | 'm'

export type StatCardProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  type?: StatCardType
  size?: StatCardSize
  /** Figma label: "총지출" */
  label: ReactNode
  /** 원화 금액 */
  amount: number
  /** Figma sub: "공동 ₩1,026,000 · 내 개인 ₩258,000" */
  sub?: ReactNode
  /** Figma icon. 기본 Default = receipt, Brand = wallet */
  icon?: IconName
  children?: never
}

export function StatCard({ type = 'default', size = 'l', label, amount, sub, icon, className, ...rest }: StatCardProps) {
  const brand = type === 'brand'
  return (
    <div
      className={clsx(
        'flex flex-col gap-1.5 rounded-xl p-5',
        brand ? 'bg-brand text-inverse' : 'bg-surface shadow-elevation-1',
        className,
      )}
      {...rest}
    >
      <p className="flex items-center gap-1.5">
        {/* Figma 아이콘은 18px. Icon 크기 단계에 없어 CSS로 줄인다 */}
        <Icon
          name={icon ?? (brand ? 'wallet' : 'receipt')}
          size={20}
          className={clsx('size-4.5 shrink-0', brand ? 'text-icon-inverse' : 'text-icon-subtle')}
        />
        <span className={clsx('text-body-s-strong', brand ? 'text-inverse' : 'text-secondary')}>{label}</span>
      </p>
      <p className={clsx('font-amount', size === 'l' ? 'text-amount-l' : 'text-amount-m', brand ? 'text-inverse' : 'text-amount-default')}>
        {formatKrw(amount)}
      </p>
      {sub != null && <p className={clsx('text-caption', brand ? 'text-inverse opacity-80' : 'text-tertiary')}>{sub}</p>}
    </div>
  )
}
