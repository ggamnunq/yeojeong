import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RowPick } from './Pick'

const amount = () => screen.getByText('₩110,300')

describe('RowPick (v1.7)', () => {
  it('행 전체가 체크박스 라벨이고, 누르면 onChange', () => {
    const onChange = vi.fn()
    render(<RowPick title="다카시마야 난바점" meta="15:40 · 오사카 3박 4일" amount="₩110,300" subAmount="¥12,000" checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByText('15:40 · 오사카 3박 4일'))
    expect(onChange).toHaveBeenCalledTimes(1)
    const box = screen.getByRole('checkbox', { name: /다카시마야 난바점/ }) as HTMLInputElement
    expect(box.checked).toBe(false)
  })

  it('State: Default 금액 text/secondary · Selected amount/default · Disabled 제목·금액 tertiary + 상자 disabled', () => {
    const props = { title: '다카시마야 난바점', amount: '₩110,300' }
    const { rerender } = render(<RowPick {...props} checked={false} readOnly />)
    expect(amount().className).toContain('text-secondary')
    expect(screen.getByText('다카시마야 난바점').className).toContain('text-body-m-strong')
    expect(screen.getByText('다카시마야 난바점').className).toContain('text-primary')

    rerender(<RowPick {...props} checked readOnly />)
    expect(amount().className).toContain('text-amount-default')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)

    rerender(<RowPick {...props} checked={false} disabled readOnly />)
    expect(amount().className).toContain('text-tertiary')
    expect(screen.getByText('다카시마야 난바점').className).toContain('text-tertiary')
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  })

  it('Meta · Sub amount · Chip은 값이 있을 때만(Chip = Tag Pending S 라벨)', () => {
    const { container, rerender } = render(<RowPick title="제주항공" amount="₩110,300" checked={false} readOnly />)
    expect(container.querySelectorAll('.text-caption')).toHaveLength(0)
    rerender(<RowPick title="MK택시" meta="14:10" amount="₩110,300" subAmount="¥2,860" chip="추가됨" checked={false} disabled readOnly />)
    expect(screen.getByText('14:10').className).toContain('text-tertiary')
    expect(screen.getByText('¥2,860').className).toContain('text-tertiary')
    const chip = screen.getByText('추가됨')
    expect(chip.className).toContain('bg-expense-pending-bg')
    expect(chip.className).toContain('text-[11px]')
  })
})
