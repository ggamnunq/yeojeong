import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tag } from './Tag'

describe('Tag', () => {
  it('type="warning"은 "연결 만료" — 옅은 warning 면 + 진한 warning 글자, 아이콘 없음(v1.6.2)', () => {
    const { container } = render(<Tag type="warning" />)
    const tag = screen.getByText('연결 만료')
    expect(tag.className).toContain('bg-feedback-warning-bg')
    expect(tag.className).toContain('text-feedback-warning-fg')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('S 크기와 label 교체', () => {
    render(<Tag type="warning" size="s" label="만료" />)
    expect(screen.getByText('만료').className).toContain('text-[11px]')
  })
})

describe('Tag Label (v1.7)', () => {
  it('pending은 기본 "미확정", label로 "추가됨" 등을 같은 회색 칩에 넣는다', () => {
    const { rerender } = render(<Tag type="pending" size="s" />)
    expect(screen.getByText('미확정').className).toContain('bg-expense-pending-bg')
    rerender(<Tag type="pending" size="s" label="비슷한 기록" />)
    const tag = screen.getByText('비슷한 기록')
    expect(tag.className).toContain('bg-expense-pending-bg')
    expect(tag.className).toContain('text-expense-pending-fg')
  })
})
