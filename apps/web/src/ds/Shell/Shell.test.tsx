import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShellApp } from './App'
import { ShellOnboarding } from './Onboarding'
import { ShellSub } from './Sub'

const order = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('ShellApp', () => {
  it('TopHeader Group(구분선 없음 · 그룹명 H2) → main(첫 블록 위 8) → BottomNav 3탭', () => {
    const onChange = vi.fn()
    render(
      <ShellApp header={{ groupName: '오사카 3박 4일' }} nav={{ active: 'second', onChange }}>
        <p>본문</p>
      </ShellApp>,
    )
    const banner = screen.getByRole('banner')
    const main = screen.getByRole('main')
    const nav = screen.getByRole('navigation', { name: '여정 메뉴' })
    expect(order(banner, main) && order(main, nav)).toBe(true)
    expect(banner.className).not.toContain('border-b')
    expect(screen.getByRole('heading', { level: 1, name: '오사카 3박 4일' }).querySelector('.text-h2')).toBeTruthy()
    expect(main.className).toContain('pt-2')
    expect(main.className).toContain('px-gutter')
    expect(screen.getByRole('button', { name: '현황' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: '여정 정보' }))
    expect(onChange).toHaveBeenCalledWith('third')
  })

  it('header 콜백 · dropdown을 TopHeader에 넘기고, gutter={false}면 거터가 없다', () => {
    const onGroupClick = vi.fn()
    render(
      <ShellApp header={{ groupName: '오사카', dropdown: 'open', onGroupClick }} gutter={false}>
        본문
      </ShellApp>,
    )
    const group = screen.getByRole('button', { name: '오사카' })
    expect(group.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(group)
    expect(onGroupClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('main').className).not.toContain('px-gutter')
  })
})

describe('ShellSub', () => {
  it('기본은 TopHeader Back(구분선 없음, action 없음) + 첫 블록 위 16, 내비 없음', () => {
    const onBack = vi.fn()
    render(<ShellSub header={{ title: '지갑', onBack }}>본문</ShellSub>)
    expect(screen.getByRole('heading', { level: 1, name: '지갑' })).toBeTruthy()
    expect(screen.getByRole('banner').className).not.toContain('border-b')
    fireEvent.click(screen.getByRole('button', { name: '뒤로 가기' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getByRole('main').className).toContain('pt-4')
  })

  it('여정 없음은 header={{ type: "logo" }}', () => {
    render(<ShellSub header={{ type: 'logo' }}>본문</ShellSub>)
    expect(screen.getByRole('heading', { level: 1, name: '여정' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '뒤로 가기' })).toBeNull()
  })

  it('cta를 주면 본문 밖 하단에 Primary 버튼', () => {
    render(
      <ShellSub header={{ title: '여정 만들기' }} cta={{ label: '다음' }}>
        본문
      </ShellSub>,
    )
    expect(screen.getByRole('main').contains(screen.getByRole('button', { name: '다음' }))).toBe(false)
  })
})

describe('ShellOnboarding', () => {
  it('뒤로 + Progress/Steps(progress 단계) + 첫 블록 위 24 + CTA', () => {
    const onBack = vi.fn()
    const onNext = vi.fn()
    render(
      <ShellOnboarding progress={2} onBack={onBack} cta={{ label: '다음', onClick: onNext }}>
        <h1>닉네임</h1>
      </ShellOnboarding>,
    )
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(bar.getAttribute('aria-valuetext')).toBe('4단계 중 2단계')
    expect(screen.getByRole('banner').contains(bar)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '뒤로 가기' }))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('main').className).toContain('pt-6')
  })

  it('로그인처럼 back·progress·cta가 모두 없으면 빈 자리만 남고 랜드마크·버튼이 없다', () => {
    render(<ShellOnboarding back={false}>로그인</ShellOnboarding>)
    expect(screen.queryByRole('banner')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('skip + skipLabel은 헤더 오른쪽 텍스트 버튼이고 클릭·disabled를 전달한다', () => {
    const onSkip = vi.fn()
    const { rerender } = render(
      <ShellOnboarding back={false} skip skipLabel="나중에" onSkip={onSkip}>
        연결
      </ShellOnboarding>,
    )
    const skip = screen.getByRole('button', { name: '나중에' })
    expect(screen.getByRole('banner').contains(skip)).toBe(true)
    fireEvent.click(skip)
    expect(onSkip).toHaveBeenCalledTimes(1)
    rerender(
      <ShellOnboarding back={false} skip skipDisabled onSkip={onSkip}>
        연결
      </ShellOnboarding>,
    )
    expect((screen.getByRole('button', { name: '건너뛰기' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
