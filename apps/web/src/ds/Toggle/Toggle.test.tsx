import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from '../Chip/Chip'
import { Toggle } from './Toggle'

describe('Toggle · Chip', () => {
  it('Toggle은 switch이고 누르면 aria-checked가 바뀐다', () => {
    const onChange = vi.fn()
    render(<Toggle aria-label="알림" onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: '알림' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('Chip은 aria-pressed 토글 버튼이다', () => {
    render(<Chip label="민지" />)
    const chip = screen.getByRole('button', { name: '민지' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })
})
