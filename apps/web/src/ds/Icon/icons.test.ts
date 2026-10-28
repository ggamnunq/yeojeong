import { isValidElement, createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { ICON_NAMES, ICONS } from './icons'

// spec.md 6장 · Figma Icon/<이름> 42종 + v1.4 chevron-up·crown (Brand/KakaoSymbol은 KakaoSymbol 컴포넌트)
const FIGMA_ICONS = [
  'chevron-down', 'chevron-right', 'chevron-left', 'close', 'plus', 'minus', 'check', 'check-circle',
  'alert', 'info', 'wallet', 'user', 'users', 'user-add', 'receipt', 'map', 'route', 'calendar',
  'marker', 'clock', 'lock', 'copy', 'share', 'link', 'edit', 'trash', 'search', 'filter', 'settings',
  'more', 'bell', 'logout', 'exchange', 'card', 'bank', 'coins', 'pie-chart', 'list', 'airplane',
  'home', 'refresh', 'menu',
  'chevron-up', 'crown',
]

describe('아이콘 매핑', () => {
  it('Figma 아이콘 44종이 빠짐없이, 남는 것 없이 매핑된다', () => {
    expect(FIGMA_ICONS).toHaveLength(44)
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
