import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Toast, ToastViewport } from './Toast'

describe('Toast', () => {
  it('성공·안내는 status, 오류는 alert로 읽힌다', () => {
    const { rerender } = render(<Toast type="success" message="초대코드를 복사했어요" />)
    expect(screen.getByRole('status').textContent).toBe('초대코드를 복사했어요')
    rerender(<Toast type="info" message="공동 지출로 바꿨어요" />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Toast type="error" message="저장하지 못했어요" />)
    expect(screen.getByRole('alert').textContent).toBe('저장하지 못했어요')
  })

  it('action이 있으면 버튼 하나를 그리고 누르면 콜백을 부른다', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Toast message="공동 지출로 바꿨어요" />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<Toast message="공동 지출로 바꿨어요" action={{ label: '실행 취소', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('ToastViewport는 내비 위/아래 기준으로 자리만 잡는다', () => {
    const { container, rerender } = render(
      <ToastViewport>
        <Toast message="a" />
      </ToastViewport>,
    )
    expect((container.firstElementChild as HTMLElement).className).toContain('--spacing-nav-height')
    rerender(<ToastViewport aboveNav={false} />)
    expect((container.firstElementChild as HTMLElement).className).not.toContain('--spacing-nav-height')
  })
})
