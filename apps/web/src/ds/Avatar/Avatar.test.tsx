import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'
import { avatarColorByJoinOrder, avatarInitial, avatarLabel, resolveAvatarSource } from './rules'

describe('resolveAvatarSource (프사 규칙)', () => {
  it('source를 안 주면 사진이 있으면 photo, 없으면 기본 이미지', () => {
    expect(resolveAvatarSource({ src: 'https://k.kakaocdn.net/a.jpg' })).toBe('photo')
    expect(resolveAvatarSource({ src: null })).toBe('default')
    expect(resolveAvatarSource({ src: '' })).toBe('default')
    expect(resolveAvatarSource({})).toBe('default')
  })

  it('사진을 못 불러오면 이니셜로 떨어진다', () => {
    expect(resolveAvatarSource({ src: 'x.jpg', failed: true })).toBe('initial')
    expect(resolveAvatarSource({ source: 'photo', src: 'x.jpg', failed: true })).toBe('initial')
  })

  it('photo인데 src가 없으면 기본 이미지, initial·default는 그대로', () => {
    expect(resolveAvatarSource({ source: 'photo' })).toBe('default')
    expect(resolveAvatarSource({ source: 'initial', src: 'x.jpg' })).toBe('initial')
    expect(resolveAvatarSource({ source: 'default', src: 'x.jpg' })).toBe('default')
  })
})

describe('Avatar 규칙', () => {
  it('합류 순서대로 Violet → Sunset → Green → Blue → Amber → Gray, 그다음은 처음부터', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(avatarColorByJoinOrder)).toEqual([
      'violet',
      'sunset',
      'green',
      'blue',
      'amber',
      'gray',
      'violet',
      'sunset',
    ])
    expect(avatarColorByJoinOrder(-1)).toBe('gray')
  })

  it('이니셜은 이름 첫 글자, 로마자는 대문자', () => {
    expect(avatarInitial('민지')).toBe('민')
    expect(avatarInitial(' alex')).toBe('A')
    expect(avatarInitial('')).toBe('')
  })

  it('나·나간 멤버는 접근성 이름에 글자로 붙는다', () => {
    expect(avatarLabel({ name: '민지' })).toBe('민지')
    expect(avatarLabel({ name: '준용', me: true })).toBe('준용 (나)')
    expect(avatarLabel({ name: '태현', left: true })).toBe('태현 (나간 멤버)')
  })
})

describe('Avatar', () => {
  it('사진 로딩이 실패하면 이니셜을 보여 준다', () => {
    const { container } = render(<Avatar name="민지" src="https://example.com/broken.jpg" />)
    const root = screen.getByRole('img', { name: '민지' })
    expect(root.dataset.source).toBe('photo')
    fireEvent.error(container.querySelector('img')!)
    expect(root.dataset.source).toBe('initial')
    expect(root.textContent).toBe('민')
    expect(container.querySelector('img')).toBeNull()
  })

  it('src가 바뀌면 다시 사진을 시도한다', () => {
    const { container, rerender } = render(<Avatar name="민지" src="a.jpg" />)
    fireEvent.error(container.querySelector('img')!)
    rerender(<Avatar name="민지" src="b.jpg" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('b.jpg')
  })

  it('사진이 없으면 기본 이미지(data URI)를 쓴다', () => {
    const { container } = render(<Avatar name="태현" />)
    expect(screen.getByRole('img', { name: '태현' }).dataset.source).toBe('default')
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('me · left는 접근성 이름에 들어가고, alt=""면 장식으로 숨긴다', () => {
    render(<Avatar name="준용" me left />)
    expect(screen.getByRole('img', { name: '준용 (나) (나간 멤버)' })).toBeTruthy()
    const { container } = render(<Avatar name="민지" alt="" />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })
})
