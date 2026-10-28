import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BadgeMe } from '../Badge/Me'
import { ProgressSteps } from '../Progress/Steps'
import { IllustEmptyTrip, IllustLinked, IllustLinking, IllustSettled } from './Illust'

describe('Illust', () => {
  it('기본은 장식(aria-hidden), label을 주면 이름 있는 그림', () => {
    const { container, rerender } = render(<IllustEmptyTrip />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('width')).toBe('140')
    rerender(<IllustEmptyTrip size={120} label="여정 없음" />)
    expect(screen.getByRole('img', { name: '여정 없음' }).getAttribute('width')).toBe('120')
  })

  it('색은 토큰 클래스로만 칠한다(raw hex 없음)', () => {
    const { container } = render(
      <>
        <IllustEmptyTrip />
        <IllustLinked />
        <IllustSettled />
        <IllustLinking phase="before" />
        <IllustLinking phase="pending" />
        <IllustLinking phase="done" />
      </>,
    )
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i)
    expect(container.querySelectorAll('[class*="sunset"]').length).toBeGreaterThanOrEqual(6)
  })

  it('Linking: pending만 가운데 지금 노드(보라 500), done은 Linked를 1.2배로 둔다. 높이는 폭 비율대로', () => {
    const { container, rerender } = render(<IllustLinking phase="pending" width={132} />)
    expect(container.querySelector('.stroke-primary-500')).toBeTruthy()
    expect(container.querySelector('svg')!.getAttribute('height')).toBe('84')
    rerender(<IllustLinking phase="before" />)
    expect(container.querySelector('.stroke-primary-500')).toBeNull()
    rerender(<IllustLinking phase="done" />)
    expect(container.querySelector('g')!.getAttribute('transform')).toBe('translate(48 0) scale(1.2)')
  })
})

describe('BadgeMe · ProgressSteps', () => {
  it('"나" 배지', () => {
    render(<BadgeMe />)
    expect(screen.getByText('나').className).toContain('bg-brand-subtle')
  })

  it('Progress/Steps는 progressbar(1~4)이고 단계만큼 채운다', () => {
    const { container } = render(<ProgressSteps step={3} />)
    const bar = screen.getByRole('progressbar', { name: '진행 단계' })
    expect(bar.getAttribute('aria-valuemax')).toBe('4')
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(container.querySelector('.w-3\\/4')).toBeTruthy()
  })
})
