import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AvatarToggle } from './AvatarToggle'

describe('AvatarToggle', () => {
  it('이름이 버튼 이름이 되고 누르면 aria-pressed가 바뀐다', () => {
    const onChange = vi.fn()
    render(<AvatarToggle person={{ name: '민지' }} onChange={onChange} />)
    const button = screen.getByRole('button', { name: '민지' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('나는 기본 이름이 "나"', () => {
    render(<AvatarToggle person={{ name: '준용', me: true }} selected />)
    expect(screen.getByRole('button', { name: '나' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('disabled면 눌러도 바뀌지 않는다', () => {
    const onChange = vi.fn()
    render(<AvatarToggle person={{ name: '태현' }} selected disabled onChange={onChange} />)
    const button = screen.getByRole('button', { name: '태현' })
    fireEvent.click(button)
    expect(onChange).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })
})
