import { describe, expect, it } from 'vitest'
import { orderMembers } from '../AvatarStack/rules'
import { paymentMeta, payerLabel, walletMeta } from './rules'

describe('결제자 표기 (spec C-06)', () => {
  it('내 결제는 "HH:mm · 내 결제", 다른 멤버는 "HH:mm · 닉네임"(접미사 없음)', () => {
    expect(paymentMeta('18:20', { name: '준용', me: true })).toBe('18:20 · 내 결제')
    expect(paymentMeta('16:40', { name: '민지' })).toBe('16:40 · 민지')
    expect(paymentMeta('16:40', { name: '민지' })).not.toMatch(/결제$|님/)
  })

  it('payerLabel은 타임라인 메타("¥3,200 · 내 결제")에도 쓴다', () => {
    expect(`¥3,200 · ${payerLabel({ name: '준용', me: true })}`).toBe('¥3,200 · 내 결제')
    expect(payerLabel({ name: '태현' })).toBe('태현')
  })
})

describe('orderMembers (spec C-05)', () => {
  it('나 먼저 → 나머지는 가입 순. 결제자라고 앞세우지 않는다', () => {
    const people = [
      { name: '태현', joinOrder: 2 },
      { name: '민지', joinOrder: 1 },
      { name: '수빈', joinOrder: 3 },
      { name: '준용', joinOrder: 0, me: true },
    ]
    expect(orderMembers(people).map((p) => p.name)).toEqual(['준용', '민지', '태현', '수빈'])

    const minjiView = [
      { name: '준용', joinOrder: 0 },
      { name: '민지', joinOrder: 1, me: true },
      { name: '태현', joinOrder: 2 },
    ]
    expect(orderMembers(minjiView).map((p) => p.name)).toEqual(['민지', '준용', '태현'])
  })

  it('joinOrder가 없으면 넘긴 순서대로 맨 뒤, 원본 배열은 그대로', () => {
    const people = [{ name: 'A' }, { name: 'B', joinOrder: 5 }, { name: 'C' }]
    const before = people.map((p) => p.name)
    expect(orderMembers(people).map((p) => p.name)).toEqual(['B', 'A', 'C'])
    expect(people.map((p) => p.name)).toEqual(before)
  })
})

describe('walletMeta (DS18 · HF-49 내 지갑 행)', () => {
  it('"HH:mm · 여정 이름", 연결이 없으면 시각만', () => {
    expect(walletMeta('08:50', '오사카 3박 4일')).toBe('08:50 · 오사카 3박 4일')
    expect(walletMeta('08:50')).toBe('08:50')
    expect(walletMeta('08:50', null)).toBe('08:50')
    expect(walletMeta('08:50', '  ')).toBe('08:50')
  })
})
