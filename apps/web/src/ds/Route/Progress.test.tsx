import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RouteProgress } from './Progress'
import { routeLabel, routeLayout } from './rules'

describe('routeLayout', () => {
  it('Figma 3변형(4일 · 진행 중 Day 2)과 같은 노드·구간', () => {
    expect(routeLayout('upcoming')).toMatchObject({
      nodes: ['start', 'future', 'future', 'end'],
      segments: ['idle', 'idle', 'idle'],
    })
    expect(routeLayout('ongoing')).toMatchObject({
      nodes: ['passed', 'now', 'future', 'end'],
      segments: ['walked', 'idle', 'idle'],
    })
    expect(routeLayout('ended')).toMatchObject({
      nodes: ['passed', 'passed', 'passed', 'arrived'],
      segments: ['done', 'done', 'done'],
    })
  })

  it('days · current로 날 수와 오늘을 바꾼다. 범위를 벗어나면 끝으로 붙인다', () => {
    expect(routeLayout('ongoing', 6, 4).nodes).toEqual(['passed', 'passed', 'passed', 'now', 'future', 'end'])
    expect(routeLayout('ongoing', 6, 4).segments).toEqual(['walked', 'walked', 'walked', 'idle', 'idle'])
    expect(routeLayout('ongoing', 3, 99).nodes).toEqual(['passed', 'passed', 'now'])
    expect(routeLayout('ongoing', 3, 0).nodes).toEqual(['now', 'future', 'end'])
    expect(routeLayout('upcoming', 1).nodes).toEqual(['start', 'end'])
  })

  it('접근성 이름은 단계만 말한다', () => {
    expect(routeLabel('upcoming')).toBe('출발 전')
    expect(routeLabel('ongoing')).toBe('4일 중 2일차')
    expect(routeLabel('ongoing', 6, 4)).toBe('6일 중 4일차')
    expect(routeLabel('ended')).toBe('도착')
  })
})

describe('RouteProgress', () => {
  it('레일은 단계 이름을 가진 그림, 출발·도착 날짜는 글자로 보인다', () => {
    const { container } = render(<RouteProgress phase="ongoing" start="11.12 (목)" end="11.15 (일)" />)
    expect(screen.getByRole('img', { name: '4일 중 2일차' })).toBeTruthy()
    expect(screen.getByText('11.12 (목)')).toBeTruthy()
    expect(screen.getByText('11.15 (일)')).toBeTruthy()
    // 노드 4개 + 구간 3개
    expect(container.querySelectorAll('svg')).toHaveLength(4)
    expect(container.querySelectorAll('.bg-primary-300')).toHaveLength(1)
  })

  it('도착하면 마지막 노드만 노을로 채운다', () => {
    const { container } = render(<RouteProgress phase="ended" start="a" end="b" />)
    expect(container.querySelectorAll('.fill-brand-accent')).toHaveLength(1)
    expect(container.querySelectorAll('.bg-primary-200')).toHaveLength(3)
  })
})
