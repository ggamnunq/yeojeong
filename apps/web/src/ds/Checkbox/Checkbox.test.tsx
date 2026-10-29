import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
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

describe('Checkbox Checked=Indeterminate (v1.7)', () => {
  it('indeterminate면 DOM indeterminate + aria-checked="mixed" + 막대 아이콘, 누르면 onChange', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<Checkbox label="전체 선택" indeterminate checked={false} onChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: '전체 선택' }) as HTMLInputElement
    expect(box.indeterminate).toBe(true)
    expect(box.getAttribute('aria-checked')).toBe('mixed')
    expect(container.querySelector('.lucide-minus')).toBeTruthy()
    expect(container.querySelector('.lucide-check')).toBeNull()
    fireEvent.click(box)
    expect(onChange).toHaveBeenCalledTimes(1)
    // 부모가 값을 바꾸지 않았으면 다시 일부 선택으로 맞춘다
    rerender(<Checkbox label="전체 선택" indeterminate checked={false} onChange={onChange} />)
    expect(box.indeterminate).toBe(true)
    rerender(<Checkbox label="전체 선택" checked onChange={onChange} />)
    expect(box.indeterminate).toBe(false)
    expect(box.getAttribute('aria-checked')).toBeNull()
    expect(container.querySelector('.lucide-check')).toBeTruthy()
  })

  it('ref를 넘겨도 indeterminate가 켜진다', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Checkbox label="전체 선택" indeterminate disabled ref={ref} readOnly />)
    expect(ref.current?.indeterminate).toBe(true)
    expect(ref.current?.disabled).toBe(true)
  })
})
