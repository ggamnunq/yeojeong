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

  it('선택 체크는 outline에만, removable(v1.6)이면 체크 대신 오른쪽 ✕ — 누르면 선택이 풀린다', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<Chip style="tone" label="Day 2" defaultSelected />)
    expect(container.querySelectorAll('svg')).toHaveLength(0)
    rerender(<Chip label="민지" selected />)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    rerender(<Chip removable label="확인 필요 2건" aria-label="확인 필요 2건, 미확정만 보기 해제" selected onChange={onChange} />)
    const chip = screen.getByRole('button', { name: '확인 필요 2건, 미확정만 보기 해제' })
    const icons = container.querySelectorAll('svg')
    expect(icons).toHaveLength(1)
    expect(chip.lastElementChild).toBe(icons[0])
    expect(chip.className).not.toContain('aria-pressed:pl-2.5')
    fireEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('기본 style은 기존 outline 모양이다', () => {
    render(<Chip label="민지" />)
    const chip = screen.getByRole('button', { name: '민지' })
    expect(chip.className).toContain('border-default')
    expect(chip.className).toContain('bg-surface')
  })
})
