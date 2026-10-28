import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('type="hero"는 Amount/XL · 패딩 24이고 아이콘과 sub를 그리지 않는다', () => {
    const { container } = render(<StatCard type="hero" size="l" label="내가 낼 금액" amount={32080} sub="숨김" icon="wallet" />)
    expect(screen.getByText('₩32,080').className).toContain('text-amount-xl')
    expect(screen.queryByText('숨김')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    expect(container.firstElementChild?.className).toContain('p-6')
  })

  it('기존 default · brand 변형은 아이콘과 sub를 유지한다', () => {
    const { container, rerender } = render(<StatCard label="총지출" amount={1000} sub="공동 ₩1,000" />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('공동 ₩1,000')).toBeTruthy()
    rerender(<StatCard type="brand" label="내가 낼 금액" amount={1000} sub="보낼 예정" />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('보낼 예정')).toBeTruthy()
  })
})
