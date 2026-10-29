import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressSteps } from './Steps'

describe('ProgressSteps', () => {
  it('기본 total 4: 2단계 = 절반 채움, "4단계 중 2단계"', () => {
    render(<ProgressSteps step={2} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuemax')).toBe('4')
    expect(bar.getAttribute('aria-valuetext')).toBe('4단계 중 2단계')
    expect((bar.firstChild as HTMLElement).className).toContain('w-1/2')
  })

  it('v1.6.3 Total=2(가입 2단계 HF-03·04): 1/2 = 절반, 2/2 = 꽉', () => {
    const { rerender } = render(<ProgressSteps step={1} total={2} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuetext')).toBe('2단계 중 1단계')
    expect((bar.firstChild as HTMLElement).className).toContain('w-1/2')
    rerender(<ProgressSteps step={2} total={2} />)
    expect((screen.getByRole('progressbar').firstChild as HTMLElement).className).toContain('w-full')
  })

  it('Total=3 채움 1/3 · step이 total보다 크면 total로 본다', () => {
    const { rerender } = render(<ProgressSteps step={1} total={3} />)
    expect((screen.getByRole('progressbar').firstChild as HTMLElement).className).toContain('w-1/3')
    rerender(<ProgressSteps step={4} total={3} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect((bar.firstChild as HTMLElement).className).toContain('w-full')
  })
})
