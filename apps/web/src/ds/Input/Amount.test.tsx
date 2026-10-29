import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InputAmount } from './Amount'
import { amountCaretPosition, amountCharsBefore, amountInputNumber, formatAmountInput, normalizeAmountInput } from './rules'

describe('금액 입력 규칙 (DS18 · B-24)', () => {
  it('숫자·첫 소수점만 남기고 소수 자리는 통화 규칙으로, 앞 0은 지운다', () => {
    expect(normalizeAmountInput('1,2a00')).toBe('1200')
    expect(normalizeAmountInput('007')).toBe('7')
    expect(normalizeAmountInput('0')).toBe('0')
    expect(normalizeAmountInput('12.5')).toBe('12')
    expect(normalizeAmountInput('3.456', 2)).toBe('3.45')
    expect(normalizeAmountInput('.5', 2)).toBe('0.5')
    expect(normalizeAmountInput('1.2.3', 2)).toBe('1.23')
    expect(normalizeAmountInput('12.', 2)).toBe('12.')
    expect(normalizeAmountInput('')).toBe('')
    expect(normalizeAmountInput('1234567890123456')).toBe('123456789012')
  })

  it('보이는 글자는 쉼표, 숫자는 빈 값 0', () => {
    expect(formatAmountInput('1200')).toBe('1,200')
    expect(formatAmountInput('1234567.5')).toBe('1,234,567.5')
    expect(formatAmountInput('12.')).toBe('12.')
    expect(formatAmountInput('')).toBe('')
    expect(amountInputNumber('')).toBe(0)
    expect(amountInputNumber('12.50')).toBe(12.5)
  })

  it('쉼표를 다시 넣어도 캐럿은 같은 숫자 뒤', () => {
    // "1,2|00"에서 3을 넣으면 "1,23|00" → "12,3|00"
    expect(amountCharsBefore('1,2300', 4)).toBe(3)
    expect(amountCaretPosition('12,300', 3)).toBe(4)
    expect(amountCaretPosition('12,300', 0)).toBe(0)
    expect(amountCaretPosition('12,300', 99)).toBe(6)
  })
})

function Harness({ onCurrency }: { onCurrency?: () => void }) {
  const [value, setValue] = useState('')
  return (
    <InputAmount
      value={value}
      onChange={setValue}
      symbol="¥"
      currency={{ label: 'JPY', onClick: onCurrency }}
      converted={value ? '≈ ₩11,030' : undefined}
    />
  )
}

describe('InputAmount (DS18)', () => {
  it('빈 값은 placeholder "0"(text/disabled), 입력하면 쉼표를 넣어 보인다', () => {
    const { container } = render(<Harness />)
    const input = screen.getByRole('textbox', { name: '금액' }) as HTMLInputElement
    expect(input.placeholder).toBe('0')
    expect(input.inputMode).toBe('numeric')
    expect(container.querySelector('label')?.className).toContain('text-disabled')
    expect(screen.queryByText('≈ ₩11,030')).toBeNull()
    fireEvent.change(input, { target: { value: '1200' } })
    expect(input.value).toBe('1,200')
    expect(container.querySelector('label')?.className).toContain('text-primary')
    expect(screen.getByText('≈ ₩11,030').className).toContain('text-caption')
  })

  it('통화 칩은 버튼(이름 "통화 바꾸기, 지금 JPY"), onClick이 없으면 정적 칩', () => {
    const onCurrency = vi.fn()
    const { rerender } = render(<Harness onCurrency={onCurrency} />)
    fireEvent.click(screen.getByRole('button', { name: '통화 바꾸기, 지금 JPY' }))
    expect(onCurrency).toHaveBeenCalledTimes(1)
    rerender(<InputAmount value="" symbol="₩" currency={{ label: 'KRW' }} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('KRW')).toBeTruthy()
  })

  it('소수 통화는 decimal 키패드 + 자리 제한', () => {
    const onChange = vi.fn()
    render(<InputAmount value="3.4" onChange={onChange} symbol="$" fractionDigits={2} />)
    const input = screen.getByRole('textbox', { name: '금액' }) as HTMLInputElement
    expect(input.inputMode).toBe('decimal')
    fireEvent.change(input, { target: { value: '3.456' } })
    expect(onChange).toHaveBeenLastCalledWith('3.45')
  })
})
