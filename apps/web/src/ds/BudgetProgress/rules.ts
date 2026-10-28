export type BudgetProgressState = 'normal' | 'caution' | 'over'

/** 주의 시작 비율(80%) */
export const BUDGET_CAUTION_RATIO = 0.8

/** 사용 비율. 예산이 0 이하이면 쓴 돈이 있을 때 무한대(초과), 없으면 0 */
export function budgetRatio(spent: number, budget: number) {
  if (budget > 0) return Math.max(0, spent) / budget
  return spent > 0 ? Number.POSITIVE_INFINITY : 0
}

/** 정상(<80%) · 주의(80~100%) · 초과(>100%) — spec 8장 */
export function budgetState(ratio: number): BudgetProgressState {
  if (ratio > 1) return 'over'
  if (ratio >= BUDGET_CAUTION_RATIO) return 'caution'
  return 'normal'
}

/** 화면에 보이는 퍼센트(반올림). 예산이 없으면 null */
export const budgetPercent = (ratio: number) => (Number.isFinite(ratio) ? Math.round(ratio * 100) : null)
