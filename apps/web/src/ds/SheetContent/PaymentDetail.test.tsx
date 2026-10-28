import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SheetContentPaymentDetail } from './PaymentDetail'
import { splitEvenly } from './rules'

describe('splitEvenly', () => {
  it('1인은 원 단위 내림, 나머지는 결제자 몫', () => {
    expect(splitEvenly(26290, 4)).toEqual({ perPerson: 6572, remainder: 2 })
    expect(splitEvenly(28400, 3)).toEqual({ perPerson: 9466, remainder: 2 })
    expect(splitEvenly(30000, 3)).toEqual({ perPerson: 10000, remainder: 0 })
    expect(splitEvenly(1000, 0)).toEqual({ perPerson: 0, remainder: 0 })
  })
})

const people = [
  { name: '준용', me: true, selected: true },
  { name: '민지', selected: true },
  { name: '태현', selected: false },
  { name: '수빈', selected: true },
]

describe('SheetContentPaymentDetail', () => {
  it('공동이면 선택 인원·1인 금액·결제자 나머지를 보여 준다', () => {
    render(<SheetContentPaymentDetail merchant="이치란" amount={28400} detail="¥3,200" expenseType="shared" participants={people} />)
    const group = screen.getByRole('group', { name: '부담 인원 3명' })
    expect(group.textContent).toContain('1인 ₩9,466')
    expect(group.textContent).toContain('결제자 +2원')
    expect(screen.getByRole('button', { name: '나' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('개인이면 부담 인원을 숨기고, 원하면 비활성 토글로 보인다', () => {
    const { rerender } = render(
      <SheetContentPaymentDetail merchant="이치란" amount={28400} detail="¥3,200" expenseType="personal" participants={people} />,
    )
    expect(screen.queryByRole('group')).toBeNull()
    rerender(
      <SheetContentPaymentDetail
        merchant="이치란"
        amount={28400}
        detail="¥3,200"
        expenseType="personal"
        participants={people}
        showParticipantsWhenPersonal
      />,
    )
    expect((screen.getByRole('button', { name: '민지' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('개인/공동 전환과 토글을 알린다 · pending·changed 칩', () => {
    const onType = vi.fn()
    const onPerson = vi.fn()
    render(
      <SheetContentPaymentDetail
        merchant="이치란"
        amount={28400}
        detail="¥3,200"
        expenseType="shared"
        participants={people}
        pending
        changed
        onExpenseTypeChange={onType}
        onParticipantChange={onPerson}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '개인' }))
    expect(onType).toHaveBeenCalledWith('personal')
    fireEvent.click(screen.getByRole('button', { name: '태현' }))
    expect(onPerson).toHaveBeenCalledWith(2, true)
    expect(screen.getByText('미확정')).toBeTruthy()
    expect(screen.getByText('변경됨')).toBeTruthy()
  })
})
