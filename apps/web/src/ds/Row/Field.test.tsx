import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RowField, RowFieldInput, RowFieldToggle } from './Field'

const ME = { name: '준용', me: true, joinOrder: 0 }
const GROUP = [ME, { name: '민지', joinOrder: 1 }, { name: '태현', joinOrder: 2 }, { name: '수빈', joinOrder: 3 }, { name: '서준', joinOrder: 4 }]

describe('RowField (DS18)', () => {
  it('라벨 … 값 › 버튼이고 이름은 라벨 + 값', () => {
    const onClick = vi.fn()
    render(<RowField label="날짜" value="지금" onClick={onClick} />)
    const row = screen.getByRole('button', { name: '날짜 지금' })
    expect(row.getAttribute('type')).toBe('button')
    expect(row.querySelector('svg')).toBeTruthy()
    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('값이 없으면 placeholder를 흐린 글자(text/tertiary)로', () => {
    render(<RowField label="여정" placeholder="추가 안 함" />)
    expect(screen.getByText('추가 안 함').className).toContain('text-tertiary')
  })

  it('결제자 = 프사 XS + 이름, 나누기 = 스택(최대 4 + "+N", 이름은 "나, 민지 외 3명")', () => {
    const { container } = render(
      <>
        <RowField label="결제자" avatar={ME} value="나" />
        <RowField label="나누기" stack={GROUP} />
      </>,
    )
    expect(screen.getByRole('button', { name: '결제자 나' }).querySelector('[data-source]')).toBeTruthy()
    expect(screen.getByRole('img', { name: '나, 민지 외 3명' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^나누기/ }).textContent).toContain('+1')
    expect(container.textContent).not.toMatch(/공동 \d명/)
  })

  it('개인이면 자물쇠 "개인" 태그', () => {
    render(<RowField label="나누기" personal />)
    expect(screen.getByRole('button', { name: '나누기 개인' })).toBeTruthy()
  })

  it('disabled면 누를 수 없고 › 를 숨길 수 있다', () => {
    const onClick = vi.fn()
    render(<RowField label="결제자" value="나" disabled chevron={false} onClick={onClick} />)
    const row = screen.getByRole('button', { name: '결제자 나' }) as HTMLButtonElement
    expect(row.disabled).toBe(true)
    expect(row.querySelector('svg')).toBeNull()
    fireEvent.click(row)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('RowFieldInput (DS18 · 내용)', () => {
  it('라벨이 입력 이름이고 오른쪽 정렬 · placeholder · maxLength가 그대로 간다', () => {
    const onChange = vi.fn()
    render(<RowFieldInput label="내용" placeholder="예) 저녁" maxLength={40} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: '내용' })
    expect(input.getAttribute('placeholder')).toBe('예) 저녁')
    expect(input.getAttribute('maxlength')).toBe('40')
    expect(input.className).toContain('text-right')
    fireEvent.change(input, { target: { value: '타코야키' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('RowFieldToggle (DS18 · 내 지갑에도 기록)', () => {
  it('라벨이 스위치 이름이고 스위치·라벨 어느 쪽을 눌러도 바뀐다', () => {
    const onChange = vi.fn()
    render(<RowFieldToggle label="내 지갑에도 기록" defaultValue onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: '내 지갑에도 기록' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByText('내 지갑에도 기록'))
    expect(onChange).toHaveBeenLastCalledWith(true)
  })
})
