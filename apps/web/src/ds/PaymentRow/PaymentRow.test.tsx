import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentRow } from './PaymentRow'

const payer = { name: '민지', source: 'initial' as const }

describe('PaymentRow', () => {
  it('진짜 버튼이고 부담 인원 스택이 이름에 들어간다', () => {
    render(
      <PaymentRow
        payer={payer}
        merchant="이치란 라멘"
        meta="12:40 · 민지"
        amount={28400}
        participants={[{ name: '준용', me: true }, { name: '민지' }, { name: '태현' }]}
      />,
    )
    const button = screen.getByRole('button')
    expect(button.getAttribute('type')).toBe('button')
    expect(screen.getByRole('img', { name: '부담 인원 나, 민지 외 1명' })).toBeTruthy()
    expect(button.textContent).toContain('₩28,400')
  })

  it('환불은 금액을 −로 보여 주고 환불 태그를 단다', () => {
    render(<PaymentRow type="refund" payer={payer} merchant="이치란" meta="원 결제 10.28 12:40 · 취소" amount={28400} />)
    const text = screen.getByRole('button').textContent ?? ''
    expect(text).toContain('−₩28,400')
    expect(text).toContain('환불')
  })

  it('미확정 태그는 메타 줄 맨 끝에 온다', () => {
    render(<PaymentRow type="pending" payer={payer} merchant="FamilyMart" meta="15:12 · 하린" amount={5320} />)
    const text = screen.getByRole('button').textContent ?? ''
    expect(text.indexOf('15:12 · 하린')).toBeLessThan(text.indexOf('미확정'))
  })

  it('changed면 "변경됨"을 붙인다', () => {
    render(<PaymentRow payer={payer} merchant="MK택시" meta="14:10 · 내 결제" amount={26290} changed />)
    expect(screen.getByRole('button').textContent).toContain('변경됨')
  })

  it('leading="none"(DS18 · HF-49 지갑)은 프사 없이 메타 "HH:mm · 여정"과 원통화 보조 줄을 그린다', () => {
    const { container } = render(
      <PaymentRow leading="none" merchant="551 호라이 난바본점" meta="18:20 · 오사카 3박 4일" amount={25740} originalAmount="¥2,800" />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-source]')).toBeNull()
    const text = screen.getByRole('button').textContent ?? ''
    expect(text).toContain('18:20 · 오사카 3박 4일')
    expect(text).toContain('₩25,740')
    expect(text).toContain('¥2,800')
  })

  it('amountLabel을 주면 원화 대신 그 글자를 주 금액으로 그린다(원화 모름 — ₩0 금지)', () => {
    render(<PaymentRow leading="none" merchant="결제" meta="08:50" amount={0} amountLabel="$12.50" />)
    const text = screen.getByRole('button').textContent ?? ''
    expect(text).toContain('$12.50')
    expect(text).not.toContain('₩0')
  })
})
