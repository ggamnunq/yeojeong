import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatSettlement, settlementNet } from './rules'
import { SettlementRow } from './SettlementRow'

describe('settlementNet · formatSettlement', () => {
  it('받을 돈은 +와 "받을 돈", 보낼 돈은 −(U+2212)와 "보낼 돈"', () => {
    expect(formatSettlement(161000)).toEqual({ net: 'receive', amount: '+₩161,000', label: '받을 돈' })
    expect(formatSettlement(-48250)).toEqual({ net: 'send', amount: '−₩48,250', label: '보낼 돈' })
  })

  it('0(반올림 포함)은 부호 없이 "정산 끝"', () => {
    expect(formatSettlement(0)).toEqual({ net: 'even', amount: '₩0', label: '정산 끝' })
    expect(settlementNet(0.4)).toBe('even')
    expect(settlementNet(-0.4)).toBe('even')
  })

  it('net을 덮어쓰면 그 부호·라벨을 따른다', () => {
    expect(formatSettlement(48250, 'send').amount).toBe('−₩48,250')
    expect(formatSettlement(-161000, 'receive').amount).toBe('+₩161,000')
  })
})

describe('SettlementRow', () => {
  it('순잔액은 기본 결제 − 부담이고, 부호·라벨을 함께 보여 주는 버튼이다', () => {
    render(<SettlementRow person={{ name: '민지' }} paid={482000} share={321000} />)
    const button = screen.getByRole('button')
    const text = button.textContent ?? ''
    expect(text).toContain('결제 ₩482,000')
    expect(text).toContain('부담 ₩321,000')
    expect(text).toContain('+₩161,000')
    expect(text).toContain('받을 돈')
  })

  it('보낼 돈은 amount/send 색, me면 "나" 배지, member="left"(또는 person.left)면 "나간 멤버" 태그', () => {
    render(<SettlementRow person={{ name: '서준' }} member="left" paid={273000} share={321250} me />)
    const amount = screen.getByText('−₩48,250')
    expect(amount.parentElement?.className).toContain('text-amount-send')
    expect(screen.getByText('보낼 돈')).toBeTruthy()
    expect(screen.getByText('나')).toBeTruthy()
    expect(screen.getByText('나간 멤버')).toBeTruthy()
  })

  it('person.left면 member 기본값이 left', () => {
    render(<SettlementRow person={{ name: '태현', left: true }} paid={0} share={0} />)
    expect(screen.getByText('나간 멤버')).toBeTruthy()
    expect(screen.getByText('정산 끝')).toBeTruthy()
  })
})
