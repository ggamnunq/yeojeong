import { isValidElement, createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Icon } from './Icon'
import { ICON_NAMES, ICON_VIEWBOX, ICONS, iconStrokeWidth } from './icons'

// spec.md 6장 · Figma Icon/<이름> 42종 + v1.4 chevron-up·crown + v1.7 eye·eye-off (Brand/KakaoSymbol은 KakaoSymbol 컴포넌트)
const FIGMA_ICONS = [
  'chevron-down', 'chevron-right', 'chevron-left', 'close', 'plus', 'minus', 'check', 'check-circle',
  'alert', 'info', 'wallet', 'user', 'users', 'user-add', 'receipt', 'map', 'route', 'calendar',
  'marker', 'clock', 'lock', 'copy', 'share', 'link', 'edit', 'trash', 'search', 'filter', 'settings',
  'more', 'bell', 'logout', 'exchange', 'card', 'bank', 'coins', 'pie-chart', 'list', 'airplane',
  'home', 'refresh', 'menu',
  'chevron-up', 'crown',
  'eye', 'eye-off',
]

describe('아이콘 매핑', () => {
  it('Figma 아이콘 46종이 빠짐없이, 남는 것 없이 매핑된다', () => {
    expect(FIGMA_ICONS).toHaveLength(46)
    expect([...ICON_NAMES].sort()).toEqual([...FIGMA_ICONS].sort())
  })

  it('모든 매핑이 렌더할 수 있는 lucide 컴포넌트다', () => {
    for (const name of ICON_NAMES) {
      expect(ICONS[name], name).toBeTruthy()
      expect(isValidElement(createElement(ICONS[name])), name).toBe(true)
    }
  })

  it('서로 다른 이름이 같은 lucide 아이콘을 가리키지 않는다', () => {
    expect(new Set(Object.values(ICONS)).size).toBe(ICON_NAMES.length)
  })
})

describe('아이콘 크기 규칙(spec §6 v1.5)', () => {
  it('모든 아이콘에 맞춘 viewBox가 있고, 그림이 24 박스의 일부만 잘라 쓰지 않을 만큼 정사각·양수다', () => {
    for (const name of ICON_NAMES) {
      const [, , v] = ICON_VIEWBOX[name]
      expect(v, name).toBeGreaterThan(12)
      expect(v, name).toBeLessThan(32)
    }
  })

  it('선 두께는 박스 크기/16 px(24 → 1.5 · 20 → 1.25 · 16 → 1.0): stroke-width = viewBox 한 변/16', () => {
    for (const size of [24, 20, 16] as const) {
      const { container, unmount } = render(<Icon name="chevron-right" size={size} />)
      const svg = container.querySelector('svg')!
      const [x, y, v] = ICON_VIEWBOX['chevron-right']
      expect(svg.getAttribute('viewBox')).toBe(`${x} ${y} ${v} ${v}`)
      expect(svg.getAttribute('width')).toBe(String(size))
      const visual = (Number(svg.getAttribute('stroke-width')) * size) / v
      expect(visual).toBeCloseTo(size / 16, 2)
      unmount()
    }
    expect(iconStrokeWidth(24)).toBe(1.5)
  })

  it('label이 없으면 장식(aria-hidden), 있으면 role=img + 이름', () => {
    const { container, rerender } = render(<Icon name="wallet" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    rerender(<Icon name="wallet" label="지갑" />)
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img')
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('지갑')
  })
})
