import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheetPanel } from '../BottomSheet/BottomSheet'
import { Screen } from '../Screen/Screen'
import { ShellApp } from '../Shell/App'
import { ShellOnboarding } from '../Shell/Onboarding'
import { ShellSub } from '../Shell/Sub'
import { BottomCTA } from './BottomCTA'

describe('BottomCTA', () => {
  it('기본(Layout=Single)은 Primary L 하나를 꽉 채운다', () => {
    render(<BottomCTA cta={{ label: '다음' }} />)
    const button = screen.getByRole('button', { name: '다음' })
    expect(button.className).toContain('bg-brand')
    expect(button.className).toContain('w-full')
  })

  it('state="loading"이면 스피너 + 누름 무시, state="disabled"면 disabled', () => {
    const onClick = vi.fn()
    const { rerender } = render(<BottomCTA cta={{ label: '참여하기', onClick, state: 'loading' }} />)
    const button = screen.getByRole('button', { name: '참여하기' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    rerender(<BottomCTA cta={{ label: '참여하기', onClick, state: 'disabled' }} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    rerender(<BottomCTA cta={{ label: '참여하기', onClick, disabled: true }} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('Layout=Horizontal: 왼쪽 보조 · 오른쪽 Primary, 간격 8, 1:1', () => {
    const onDelete = vi.fn()
    const onStart = vi.fn()
    const { container } = render(
      <BottomCTA
        cta={{
          layout: 'horizontal',
          secondary: { label: '그룹 삭제', type: 'danger-weak', onClick: onDelete },
          primary: { label: '여정 시작', onClick: onStart },
        }}
      />,
    )
    const [left, right] = screen.getAllByRole('button')
    expect(left.textContent).toBe('그룹 삭제')
    expect(left.className).toContain('bg-feedback-error-bg')
    expect(right.textContent).toBe('여정 시작')
    expect(right.className).toContain('bg-brand')
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain('gap-2')
    expect(row.className).toContain('grid-cols-2')
    fireEvent.click(left)
    fireEvent.click(right)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('왼쪽 기본은 Secondary, 오른쪽 기본은 Primary — 둘 다 Type을 바꿀 수 있다', () => {
    const { rerender } = render(
      <BottomCTA cta={{ layout: 'horizontal', secondary: { label: '초대코드로 참여' }, primary: { label: '여정 만들기' } }} />,
    )
    expect(screen.getByRole('button', { name: '초대코드로 참여' }).className).toContain('border-strong')
    expect(screen.getByRole('button', { name: '여정 만들기' }).className).toContain('bg-brand')
    rerender(
      <BottomCTA
        cta={{ layout: 'horizontal', secondary: { label: '취소' }, primary: { label: '삭제', type: 'danger' } }}
      />,
    )
    expect(screen.getByRole('button', { name: '삭제' }).className).toContain('bg-danger')
  })

  it('layout="single"은 기본과 같다', () => {
    render(<BottomCTA cta={{ layout: 'single', label: '다음' }} />)
    expect(screen.getByRole('button', { name: '다음' }).className).toContain('w-full')
  })

  it('가로 2버튼도 버튼마다 state를 받는다', () => {
    render(
      <BottomCTA
        cta={{
          layout: 'horizontal',
          secondary: { label: '그룹 삭제', type: 'danger-weak', state: 'disabled' },
          primary: { label: '여정 시작', state: 'loading' },
        }}
      />,
    )
    expect((screen.getByRole('button', { name: '그룹 삭제' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: '여정 시작' }).getAttribute('aria-busy')).toBe('true')
  })
})

describe('셸·시트 하단 CTA (DS17)', () => {
  const horizontal = {
    layout: 'horizontal' as const,
    secondary: { label: '그룹 삭제', type: 'danger-weak' as const },
    primary: { label: '여정 시작', state: 'loading' as const },
  }

  it('Screen·ShellSub·ShellOnboarding·ShellApp이 가로 2버튼과 state를 받는다', () => {
    const { rerender } = render(<Screen cta={horizontal}>본문</Screen>)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    rerender(<ShellSub header={{ title: '여정 정보' }} cta={horizontal} />)
    expect(screen.getByRole('button', { name: '여정 시작' }).getAttribute('aria-busy')).toBe('true')
    rerender(<ShellOnboarding back={false} cta={{ label: '다음', state: 'loading' }} />)
    expect(screen.getByRole('button', { name: '다음' }).getAttribute('aria-busy')).toBe('true')
    rerender(<ShellApp header={{ groupName: '오사카' }} cta={horizontal} />)
    expect(screen.getByRole('button', { name: '그룹 삭제' })).toBeTruthy()
  })

  it('BottomSheetPanel도 가로 2버튼·state를 받는다', () => {
    const { rerender } = render(<BottomSheetPanel title="결제 상세" close={false} cta={{ label: '저장하기', state: 'loading' }} />)
    expect(screen.getByRole('button', { name: '저장하기' }).getAttribute('aria-busy')).toBe('true')
    rerender(
      <BottomSheetPanel
        title="결제 상세"
        close={false}
        cta={{ layout: 'horizontal', secondary: { label: '취소' }, primary: { label: '저장하기' } }}
      />,
    )
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '저장하기' })).toBeTruthy()
  })
})
