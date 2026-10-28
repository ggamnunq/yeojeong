import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BudgetProgress } from './BudgetProgress'
import { budgetPercent, budgetRatio, budgetState } from './rules'

describe('budgetState', () => {
  it('80% 미만 정상, 80~100% 주의, 100% 초과는 초과', () => {
    expect(budgetState(0)).toBe('normal')
    expect(budgetState(0.799)).toBe('normal')
    expect(budgetState(0.8)).toBe('caution')
    expect(budgetState(1)).toBe('caution')
    expect(budgetState(1.0001)).toBe('over')
    expect(budgetState(Number.POSITIVE_INFINITY)).toBe('over')
  })

  it('비율·퍼센트 계산, 예산이 0이면 안전하게', () => {
    expect(budgetRatio(825000, 1500000)).toBe(0.55)
    expect(budgetPercent(budgetRatio(1284000, 1500000))).toBe(86)
    expect(budgetPercent(budgetRatio(1612000, 1500000))).toBe(107)
    expect(budgetRatio(0, 0)).toBe(0)
    expect(budgetRatio(1000, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(budgetPercent(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('BudgetProgress', () => {
  it('progressbar 역할과 값을 갖는다', () => {
    render(<BudgetProgress spent={825000} budget={1500000} />)
    const bar = screen.getByRole('progressbar', { name: '예산' })
    expect(bar.getAttribute('aria-valuenow')).toBe('55')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-valuetext')).toBe('₩825,000 / ₩1,500,000, 55% 사용, ₩675,000 남음')
    expect(bar.firstElementChild?.className).toContain('bg-budget-fill')
  })

  it('비율로 주의·초과 색을 고르고, 초과면 막대는 100%에서 멈추고 "초과" 문구', () => {
    const { rerender } = render(<BudgetProgress spent={1284000} budget={1500000} />)
    expect(screen.getByRole('progressbar').firstElementChild?.className).toContain('bg-budget-caution')
    rerender(<BudgetProgress spent={1612000} budget={1500000} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.firstElementChild?.className).toContain('bg-budget-over')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByText('₩112,000 초과')).toBeTruthy()
    expect(screen.getByText('107% 사용')).toBeTruthy()
  })

  it('state로 수동 지정할 수 있다', () => {
    render(<BudgetProgress spent={100} budget={1000} state="caution" />)
    expect(screen.getByRole('progressbar').firstElementChild?.className).toContain('bg-budget-caution')
  })
})
