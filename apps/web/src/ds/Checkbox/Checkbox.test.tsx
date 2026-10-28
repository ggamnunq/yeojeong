import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('라벨 전체가 누르는 영역이고 라벨이 이름이 된다', () => {
    const onChange = vi.fn()
    render(<Checkbox label="[필수] 서비스 이용약관 동의" onChange={onChange} />)
    fireEvent.click(screen.getByText('[필수] 서비스 이용약관 동의'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('checkbox', { name: '[필수] 서비스 이용약관 동의' })).toBeTruthy()
  })

  it('labelVisible={false}면 상자만 보이고 라벨은 스크린리더 이름으로 남는다', () => {
    render(<Checkbox label="전체 동의" labelVisible={false} defaultChecked />)
    const box = screen.getByRole('checkbox', { name: '전체 동의' }) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(screen.getByText('전체 동의').className).toContain('sr-only')
  })
})
