import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SheetContentOption } from './Option'
import { SheetContentReadOnly } from './ReadOnly'

const JUNYONG = { name: '준용', joinOrder: 0 }
const MINJI = { name: '민지', joinOrder: 1, me: true }
const TAEHYUN = { name: '태현', joinOrder: 2 }
const SUBIN = { name: '수빈', joinOrder: 3 }

describe('SheetContentReadOnly', () => {
  it('금액 · 상세 줄 · 톤 카드(결제자 · 부담 n명 · 1인 = 금액 ÷ 인원 내림), 버튼 없음', () => {
    render(<SheetContentReadOnly amount={26290} detail="¥2,860 · 11.13 14:10" payer={JUNYONG} participants={[MINJI, JUNYONG, TAEHYUN, SUBIN]} />)
    expect(screen.getByText('₩26,290')).toBeTruthy()
    expect(screen.getByText('¥2,860 · 11.13 14:10')).toBeTruthy()
    expect(screen.getByText('준용')).toBeTruthy()
    expect(screen.getByText('4명')).toBeTruthy()
    expect(screen.getByText('₩6,572')).toBeTruthy()
    expect(screen.getByRole('img', { name: '부담 인원 나, 준용 외 2명' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('변경됨')).toBeNull()
  })

  it('결제자가 나면 "나"(spec C-06), 나간 멤버면 「나간 멤버」 태그', () => {
    const { rerender } = render(
      <SheetContentReadOnly amount={1000} detail="d" payer={{ ...MINJI }} participants={[MINJI, JUNYONG]} />,
    )
    expect(screen.getByText('나')).toBeTruthy()
    expect(screen.queryByText('민지')).toBeNull()
    rerender(<SheetContentReadOnly amount={1000} detail="d" payer={{ ...SUBIN, left: true }} participants={[MINJI, JUNYONG]} />)
    expect(screen.getByText('수빈')).toBeTruthy()
    expect(screen.getByText('나간 멤버')).toBeTruthy()
  })

  it('type="refund"(v1.6): 결제·취소 톤 블록(취소는 −₩) + 결제자 · 부담 인원 n명 · 1인 ₩0, locked여도 버튼 없음', () => {
    render(
      <SheetContentReadOnly
        type="refund"
        amount={0}
        detail="¥0 · 11.13 (금)"
        locked
        payment={{ time: '09:40', amount: 121330 }}
        refunds={[{ time: '12:15', amount: 121330 }]}
        payer={TAEHYUN}
        participants={[MINJI, JUNYONG, TAEHYUN, SUBIN]}
      />,
    )
    const block = screen.getByText('09:40').closest('dl')!
    expect(block.textContent).toBe('결제09:40₩121,330취소12:15−₩121,330')
    expect(screen.getByText('−₩121,330').className).toContain('text-secondary')
    expect(screen.getByText('결제자')).toBeTruthy()
    expect(screen.getByText('부담 인원 4명')).toBeTruthy()
    expect(screen.getAllByText('₩0')).toHaveLength(2)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('changed면 상세 줄 끝 "변경됨", locked면 비활성 "변경 불가" 버튼', () => {
    render(<SheetContentReadOnly amount={1000} detail="d" changed locked payer={JUNYONG} participants={[JUNYONG]} perPerson="₩1,000" />)
    expect(screen.getByText('변경됨')).toBeTruthy()
    const locked = screen.getByRole('button', { name: '변경 불가' }) as HTMLButtonElement
    expect(locked.disabled).toBe(true)
    expect(screen.getAllByText('₩1,000')).toHaveLength(2)
  })
})

describe('SheetContentOption', () => {
  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState('toss')
    return (
      <SheetContentOption
        aria-label="추가 방법"
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange(v)
        }}
        options={[
          { value: 'toss', title: '토스로 불러오기' },
          { value: 'manual', icon: 'card', title: '직접 추가' },
        ]}
      />
    )
  }

  it('라디오 그룹: 선택된 옵션이 checked, 다른 옵션을 누르면 onChange(value)', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(screen.getByRole('radiogroup', { name: '추가 방법' })).toBeTruthy()
    const [toss, manual] = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(toss.checked).toBe(true)
    expect(toss.name).toBe(manual.name)
    fireEvent.click(manual)
    expect(onChange).toHaveBeenCalledWith('manual')
    expect(manual.checked).toBe(true)
    expect(toss.checked).toBe(false)
  })

  it('onSelect는 이미 선택된 옵션을 다시 눌러도 온다(HF-48b 탭하면 돌아가기), onChange는 안 온다', () => {
    const onChange = vi.fn()
    const onSelect = vi.fn()
    render(
      <SheetContentOption
        aria-label="여정"
        value="trip-a"
        onChange={onChange}
        onSelect={onSelect}
        options={[
          { value: 'trip-a', logo: false, title: '오사카' },
          { value: 'none', logo: false, title: '추가 안 함' },
        ]}
      />,
    )
    fireEvent.click(screen.getByText('오사카'))
    expect(onSelect).toHaveBeenCalledWith('trip-a')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('추가 안 함'))
    expect(onSelect).toHaveBeenLastCalledWith('none')
    expect(onSelect).toHaveBeenCalledTimes(2)
  })
})
