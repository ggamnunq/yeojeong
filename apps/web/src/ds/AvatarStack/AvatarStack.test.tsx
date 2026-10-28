import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvatarStack } from './AvatarStack'
import { avatarStackLabel, avatarStackLayout } from './rules'

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: ['준용', '민지', '태현', '수빈', '서준', '하린', '도윤'][i], me: i === 0 }))

describe('avatarStackLayout', () => {
  it('4명까지는 모두 보이고 칩이 없다', () => {
    expect(avatarStackLayout(2)).toEqual({ shown: 2, rest: 0, figmaCount: '2' })
    expect(avatarStackLayout(3)).toEqual({ shown: 3, rest: 0, figmaCount: '3' })
    expect(avatarStackLayout(4)).toEqual({ shown: 4, rest: 0, figmaCount: '4' })
  })

  it('5명 이상이면 4명 + "+(전체 − 4)"', () => {
    expect(avatarStackLayout(5)).toEqual({ shown: 4, rest: 1, figmaCount: '5+' })
    expect(avatarStackLayout(7)).toEqual({ shown: 4, rest: 3, figmaCount: '5+' })
  })

  it('overflow를 끄면 4명까지만 그리고 칩이 없다', () => {
    expect(avatarStackLayout(7, false)).toEqual({ shown: 4, rest: 0, figmaCount: '5+' })
  })

  it('0·1명과 이상한 값도 안전하다', () => {
    expect(avatarStackLayout(0)).toEqual({ shown: 0, rest: 0, figmaCount: null })
    expect(avatarStackLayout(1)).toEqual({ shown: 1, rest: 0, figmaCount: null })
    expect(avatarStackLayout(-3).shown).toBe(0)
  })
})

describe('avatarStackLabel', () => {
  it('나 먼저, 앞의 두 명 + 외 N명', () => {
    expect(avatarStackLabel(people(4))).toBe('나, 민지 외 2명')
    expect(avatarStackLabel(people(2))).toBe('나, 민지')
    expect(avatarStackLabel([{ name: '민지' }])).toBe('민지')
    expect(avatarStackLabel([{ name: '민지' }, { name: '태현' }, { name: '수빈' }])).toBe('민지, 태현 외 1명')
  })
})

describe('AvatarStack', () => {
  it('하나의 이미지로 읽히고 개별 아바타는 숨긴다', () => {
    const { container } = render(<AvatarStack people={people(6)} />)
    const stack = screen.getByRole('img', { name: '나, 민지 외 4명' })
    expect(stack).toBeTruthy()
    expect(container.querySelectorAll('[data-source]')).toHaveLength(4)
    expect(stack.textContent).toContain('+2')
  })

  it('왼쪽(첫 사람)이 위에 오도록 DOM은 뒤집혀 있다', () => {
    const withPhotos = ['a.jpg', 'b.jpg', 'c.jpg'].map((src, i) => ({ name: `p${i}`, src }))
    const { container } = render(<AvatarStack people={withPhotos} />)
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(srcs).toEqual(['c.jpg', 'b.jpg', 'a.jpg'])
    expect(container.firstElementChild?.className).toContain('flex-row-reverse')
  })

  it('label로 접근성 이름을 바꿀 수 있다', () => {
    render(<AvatarStack people={people(2)} label="부담 인원 나, 민지" />)
    expect(screen.getByRole('img', { name: '부담 인원 나, 민지' })).toBeTruthy()
  })
})
