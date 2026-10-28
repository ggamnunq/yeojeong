import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('기본은 type="button"인 진짜 버튼이고 라벨이 이름이 된다', () => {
    render(<Button label="여정 시작하기" />)
    const button = screen.getByRole('button', { name: '여정 시작하기' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
  })

  it('htmlType으로 submit 버튼이 된다', () => {
    render(<Button label="저장" htmlType="submit" />)
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit')
  })

  it('누르면 onClick, disabled면 호출되지 않는다', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button label="확인" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<Button label="확인" onClick={onClick} disabled />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('leadingIcon은 장식이라 이름에 섞이지 않는다', () => {
    const { container } = render(<Button label="추가" leadingIcon icon="plus" />)
    expect(screen.getByRole('button', { name: '추가' })).toBeTruthy()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('leadingIcon이 꺼져 있으면 아이콘을 그리지 않는다', () => {
    const { container } = render(<Button label="추가" icon="plus" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
