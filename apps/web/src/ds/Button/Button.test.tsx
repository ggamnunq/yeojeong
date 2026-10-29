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

  describe('type="danger-weak"(v1.6.2 Type=Danger-weak)', () => {
    it('옅은 에러 면 + 에러 글자, 비활성은 bg/subtle + 비활성 글자', () => {
      render(<Button type="danger-weak" label="그룹 삭제" />)
      const button = screen.getByRole('button', { name: '그룹 삭제' })
      expect(button.className).toContain('bg-feedback-error-bg')
      expect(button.className).toContain('text-error')
      expect(button.className).not.toContain('border')
      expect(button.className).toContain('disabled:bg-subtle')
      expect(button.className).toContain('enabled:active:')
    })

    it('Loading이면 스피너는 에러 글자색, 누름 무시', () => {
      const onClick = vi.fn()
      const { container } = render(<Button type="danger-weak" label="그룹 삭제" state="loading" onClick={onClick} />)
      const button = screen.getByRole('button', { name: '그룹 삭제' })
      expect(button.getAttribute('aria-busy')).toBe('true')
      expect(container.querySelector('[data-spinner]')).toBeTruthy()
      expect(button.className).not.toContain('enabled:active:')
      fireEvent.click(button)
      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe('state="loading"(v1.5)', () => {
    it('aria-busy + 이름은 그대로, 라벨·아이콘은 투명(크기 유지)하고 스피너를 그린다', () => {
      const { container } = render(<Button label="동의하고 연결" state="loading" leadingIcon icon="link" />)
      const button = screen.getByRole('button', { name: '동의하고 연결' })
      expect(button.getAttribute('aria-busy')).toBe('true')
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect(screen.getByText('동의하고 연결').className).toContain('opacity-0')
      expect(container.querySelector('svg.lucide')?.getAttribute('class')).toContain('opacity-0')
      expect(container.querySelector('[data-spinner]')).toBeTruthy()
      // disabled가 아니라서 포커스가 남는다
      expect((button as HTMLButtonElement).disabled).toBe(false)
    })

    it('로딩 중 클릭은 무시하고(onClick 없음), submit 버튼이면 폼 제출도 막는다', () => {
      const onClick = vi.fn()
      const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
      const { rerender } = render(
        <form onSubmit={onSubmit}>
          <Button label="저장" htmlType="submit" state="loading" onClick={onClick} />
        </form>,
      )
      fireEvent.click(screen.getByRole('button'))
      expect(onClick).not.toHaveBeenCalled()
      expect(onSubmit).not.toHaveBeenCalled()
      rerender(
        <form onSubmit={onSubmit}>
          <Button label="저장" htmlType="submit" onClick={onClick} />
        </form>,
      )
      fireEvent.click(screen.getByRole('button'))
      expect(onClick).toHaveBeenCalledTimes(1)
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    it('기본 state에서는 aria-busy·스피너가 없다', () => {
      const { container } = render(<Button label="확인" />)
      expect(screen.getByRole('button').hasAttribute('aria-busy')).toBe(false)
      expect(container.querySelector('[data-spinner]')).toBeNull()
    })
  })
})
