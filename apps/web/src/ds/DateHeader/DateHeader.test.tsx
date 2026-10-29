import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DateHeader } from './DateHeader'

describe('DateHeader', () => {
  it('기본 style="default"는 bg/canvas 띠 + 보라 Day, total이 꺼져 있으면 합계를 그리지 않는다', () => {
    const { container } = render(<DateHeader date="10월 28일 (화)" day="2일차" dailyTotal="₩184,200" />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-canvas')
    expect(screen.getByText('2일차').className).toContain('text-brand')
    expect(screen.queryByText('₩184,200')).toBeNull()
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('10월 28일 (화)2일차')
  })

  it('style="plain"(v1.6)은 배경 없이 Day·합계를 3차 Caption으로 그린다', () => {
    const { container } = render(<DateHeader style="plain" date="10월 28일 (화)" day="2일차" total dailyTotal="₩184,200" />)
    expect((container.firstChild as HTMLElement).className).not.toContain('bg-canvas')
    expect(screen.getByText('2일차').className).toContain('text-tertiary')
    const total = screen.getByText('₩184,200')
    expect(total.className).toContain('text-caption')
    expect(total.className).toContain('text-tertiary')
  })
})
