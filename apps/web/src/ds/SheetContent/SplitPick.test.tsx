import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { splitPickSummary } from './rules'
import { SheetContentSplitPick } from './SplitPick'

const MEMBERS = [
  { id: 'u0', name: '준용', me: true, joinOrder: 0 },
  { id: 'u1', name: '민지', joinOrder: 1 },
  { id: 'u2', name: '태현', joinOrder: 2 },
  { id: 'u3', name: '수빈', joinOrder: 3 },
]

describe('splitPickSummary (FR-509 내림 + 나머지 결제자)', () => {
  it('₩11,030 ÷ 3 → "1인 ₩3,676" + "결제자 +2원", 나누어떨어지면 나머지 없음, 0명은 둘 다 null', () => {
    expect(splitPickSummary(11030, 3)).toEqual({ perPerson: '1인 ₩3,676', remainder: '결제자 +2원' })
    expect(splitPickSummary(12000, 4)).toEqual({ perPerson: '1인 ₩3,000', remainder: null })
    expect(splitPickSummary(11030, 0)).toEqual({ perPerson: null, remainder: null })
  })
})

describe('SheetContentSplitPick (DS18)', () => {
  it('나누기: 요약 "3명 · 결제자 +2원 · 1인 ₩3,676" + AvatarToggle 토글, onChange는 멤버 순서대로', () => {
    const onChange = vi.fn()
    render(
      <SheetContentSplitPick
        members={MEMBERS}
        selected={['u2', 'u0', 'u1']}
        perPerson="1인 ₩3,676"
        remainder="결제자 +2원"
        onChange={onChange}
      />,
    )
    expect(screen.getByText('3명')).toBeTruthy()
    expect(screen.getByText('1인 ₩3,676').className).toContain('font-amount')
    expect(screen.getByText('결제자 +2원').className).toContain('text-caption')
    const group = screen.getByRole('group', { name: '나눌 사람' })
    const subin = screen.getByRole('button', { name: '수빈' })
    expect(group.contains(subin)).toBe(true)
    expect(subin.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(subin)
    expect(onChange).toHaveBeenLastCalledWith(['u0', 'u1', 'u2', 'u3'])
    fireEvent.click(screen.getByRole('button', { name: '민지' }))
    expect(onChange).toHaveBeenLastCalledWith(['u0', 'u2'])
  })

  it('personal이면 인원·금액 대신 자물쇠 "개인"(HF-47b)', () => {
    render(<SheetContentSplitPick members={MEMBERS} selected={['u0']} perPerson="1인 ₩11,030" personal />)
    expect(screen.getByText('개인')).toBeTruthy()
    expect(screen.queryByText('1명')).toBeNull()
    expect(screen.queryByText('1인 ₩11,030')).toBeNull()
  })

  it('결제자(mode="single"): 요약 없는 라디오 그룹, 누르거나 화살표로 고른다', () => {
    const onChange = vi.fn()
    render(<SheetContentSplitPick mode="single" members={MEMBERS} selected="u0" onChange={onChange} />)
    const group = screen.getByRole('radiogroup', { name: '결제자' })
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(4)
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    expect(radios[0].hasAttribute('aria-pressed')).toBe(false)
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1])
    expect(screen.queryByText(/명$/)).toBeNull()
    fireEvent.click(radios[2])
    expect(onChange).toHaveBeenLastCalledWith('u2')
    radios[0].focus()
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('u3')
    expect(document.activeElement).toBe(radios[3])
  })

  it('disabled 멤버는 누를 수 없고 화살표 이동에서도 건너뛴다', () => {
    const onChange = vi.fn()
    const members = MEMBERS.map((m) => (m.id === 'u1' ? { ...m, disabled: true } : m))
    render(<SheetContentSplitPick mode="single" members={members} selected="u0" onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    expect((radios[1] as HTMLButtonElement).disabled).toBe(true)
    radios[0].focus()
    fireEvent.keyDown(radios[0], { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('u2')
  })
})
