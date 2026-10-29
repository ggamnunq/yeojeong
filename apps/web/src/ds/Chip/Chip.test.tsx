import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'

describe('Chip', () => {
  it('style="tone"은 톤 면 + 투명 테두리를 쓰고 선택 동작을 유지한다', () => {
    const onChange = vi.fn()
    render(<Chip style="tone" label="확인 필요 2건" onChange={onChange} />)
    const chip = screen.getByRole('button', { name: '확인 필요 2건' })
    expect(chip.className).toContain('bg-subtle')
    expect(chip.className).toContain('border-transparent')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('기본 style은 기존 outline 모양이다', () => {
    render(<Chip label="민지" />)
    const chip = screen.getByRole('button', { name: '민지' })
    expect(chip.className).toContain('border-default')
    expect(chip.className).toContain('bg-surface')
  })
})
