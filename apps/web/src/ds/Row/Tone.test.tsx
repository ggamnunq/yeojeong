import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RowTone } from './Tone'

describe('RowTone', () => {
  it('라벨 · 값 + action(Button Secondary S, icon을 주면 앞 아이콘)', () => {
    const onClick = vi.fn()
    const { container } = render(
      <RowTone
        label="초대코드"
        value="K7M-2QX"
        action={{
          label: '복사',
          icon: 'copy',
          'aria-label': '초대코드 복사',
          onClick,
        }}
      />,
    )
    expect(screen.getByText('K7M-2QX')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '초대코드 복사' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(container.querySelector('button svg')).toBeTruthy()
  })

  it('action이 없으면 버튼이 없다', () => {
    render(<RowTone label="초대코드" value="K7M-2QX" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
