import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InputPicker } from './Picker'

describe('InputPicker (Input Type=Picker, v1.6)', () => {
  it('글자를 받지 않는 버튼: 접근성 이름 = 라벨 + 값, 시트를 연다(aria-haspopup=dialog)', () => {
    const onClick = vi.fn()
    render(<InputPicker label="기간" placeholder="출발일 – 도착일" value="11.12 (목) – 11.15 (일)" onClick={onClick} />)
    const picker = screen.getByRole('button', { name: '기간 11.12 (목) – 11.15 (일)' })
    expect(picker.getAttribute('aria-haspopup')).toBe('dialog')
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(picker)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('값이 없으면 placeholder를 3차 글자로, 오류면 border/error + 문구(describedby), ⌄는 그대로', () => {
    render(<InputPicker label="장소" placeholder="도시 검색" error helper="장소를 골라 주세요" trailingIcon icon="marker" />)
    const picker = screen.getByRole('button', { name: '장소 도시 검색' })
    expect(screen.getByText('도시 검색').className).toContain('text-tertiary')
    expect(picker.getAttribute('aria-invalid')).toBe('true')
    expect(picker.className).toContain('border-error')
    const helper = screen.getByText('장소를 골라 주세요')
    expect(picker.getAttribute('aria-describedby')).toBe(helper.id)
    // trailing 슬롯 + ⌄ = 아이콘 2개(경고 아이콘 없음)
    expect(picker.querySelectorAll('svg')).toHaveLength(2)
  })

  it('disabled면 누를 수 없고 값은 text/secondary', () => {
    render(<InputPicker label="기간" placeholder="출발일 – 도착일" value="11.12 (목) – 11.15 (일)" disabled />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('11.12 (목) – 11.15 (일)').className).toContain('text-secondary')
  })
})
