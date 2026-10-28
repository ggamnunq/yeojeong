import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { formatKrw } from '../format'
import { Icon } from '../Icon/Icon'
import { budgetPercent, budgetRatio, budgetState, type BudgetProgressState } from './rules'

// Figma BudgetProgress(24:8517) · State=Normal/Caution/Over. 예산 대비 사용률(공동 지출 기준).
// state는 spent/budget 비율로 자동 결정되고(<80% · 80~100% · >100%), state prop으로 덮어쓸 수 있다.
export type BudgetProgressProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** 쓴 돈(원) */
  spent: number
  /** 예산(원) */
  budget: number
  /** Figma State. 생략하면 비율로 정한다 */
  state?: BudgetProgressState
  /** Figma label */
  label?: ReactNode
  children?: never
}

const FILL = {
  normal: 'bg-budget-fill',
  caution: 'bg-budget-caution',
  over: 'bg-budget-over',
} satisfies Record<BudgetProgressState, string>

export function BudgetProgress({ spent, budget, state, label = '예산', className, ...rest }: BudgetProgressProps) {
  const ratio = budgetRatio(spent, budget)
  const current = state ?? budgetState(ratio)
  const percent = budgetPercent(ratio)
  const over = current === 'over'
  const diff = budget - spent
  const percentText = percent === null ? '예산 없음' : `${percent}% 사용`
  const remainingText = diff < 0 ? `${formatKrw(-diff)} 초과` : `${formatKrw(diff)} 남음`
  const valueText = `${formatKrw(spent)} / ${formatKrw(budget)}`
  // 막대 너비는 0~100%로 자른다(초과면 꽉 참)
  const width = Math.min(1, Number.isFinite(ratio) ? ratio : 1) * 100

  return (
    <div className={clsx('flex flex-col gap-2.5 rounded-lg border border-default bg-surface p-5', className)} {...rest}>
      <div className="flex items-center gap-2">
        <span className="text-body-s-strong text-secondary">{label}</span>
        <span className="ml-auto font-amount text-label-m leading-5.25 font-semibold whitespace-nowrap text-amount-default">
          {valueText}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={typeof label === 'string' ? label : '예산'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent ?? 100)}
        aria-valuetext={`${valueText}, ${percentText}, ${remainingText}`}
        className="h-2 overflow-hidden rounded-full bg-budget-track"
      >
        <div className={clsx('h-full rounded-full', FILL[current])} style={{ width: `${width}%` }} />
      </div>
      <div className="flex items-center gap-2">
        {over && <Icon name="alert" size={14} className="shrink-0 text-error" />}
        <span className={clsx('text-caption', over ? 'text-error' : 'text-tertiary')}>{percentText}</span>
        <span className={clsx('ml-auto text-label-s whitespace-nowrap', over ? 'text-error' : 'text-secondary')}>{remainingText}</span>
      </div>
    </div>
  )
}
