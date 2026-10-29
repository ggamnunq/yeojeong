import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TimelineItem, type TimelineItemPosition } from './TimelineItem'

// 레일 칸(aria-hidden): [위 레일, 점, 아래 레일]
const rail = (position: TimelineItemPosition) => {
  const { container } = render(<TimelineItem position={position} time="12:40" merchant="이치란" amount={28400} />)
  return Array.from(container.querySelector('[aria-hidden]')!.children) as HTMLElement[]
}

describe('TimelineItem position', () => {
  it('middle: 위·아래 레일이 모두 보인다', () => {
    const [top, , bottom] = rail('middle')
    expect(top.className).not.toContain('invisible')
    expect(bottom).toBeTruthy()
  })

  it('first(v1.6): 점 위 레일은 자리만 남기고 숨긴다(점 위치는 같다), 아래 레일은 이어진다', () => {
    const [top, dot, bottom] = rail('first')
    expect(top.className).toContain('invisible')
    expect(top.className).toContain('h-3.5')
    expect(dot.className).toContain('rounded-full')
    expect(bottom).toBeTruthy()
  })

  it('last: 아래 레일이 없다', () => {
    expect(rail('last')).toHaveLength(2)
  })
})
