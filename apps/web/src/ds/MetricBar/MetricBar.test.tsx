import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetricBar } from './MetricBar'

describe('MetricBar', () => {
  it('single: 라벨로 이름 붙은 meter(0~100) + "/ 총액", 값 문구에 금액·사용률', () => {
    render(<MetricBar label="공동 지출" amount={352790} total={1200000} />)
    const meter = screen.getByRole('meter', { name: '공동 지출' })
    expect(meter.getAttribute('aria-valuemin')).toBe('0')
    expect(meter.getAttribute('aria-valuemax')).toBe('100')
    expect(meter.getAttribute('aria-valuenow')).toBe('29')
    expect(meter.getAttribute('aria-valuetext')).toBe('₩352,790 / ₩1,200,000, 29% 사용')
    expect(meter.getAttribute('data-state')).toBe('normal')
    expect(screen.getByText('/ ₩1,200,000')).toBeTruthy()
  })

  it('single 초과: valuenow는 100으로 자르고, 라벨 줄에 "초과 ₩N" + 값 문구에도 초과', () => {
    render(<MetricBar label="공동 지출" amount={1284500} total={1200000} />)
    const meter = screen.getByRole('meter')
    expect(meter.getAttribute('aria-valuenow')).toBe('100')
    expect(meter.getAttribute('aria-valuetext')).toContain('초과 ₩84,500')
    expect(meter.getAttribute('data-state')).toBe('over')
    expect(screen.getByText('초과 ₩84,500')).toBeTruthy()
  })

  it('single: state로 색을 덮어쓰고, total이 없으면 막대·총액이 없다', () => {
    const { rerender } = render(<MetricBar label="공동 지출" amount={100} total={1000} state="caution" />)
    expect(screen.getByRole('meter').getAttribute('data-state')).toBe('caution')
    rerender(<MetricBar label="공동 지출" amount={352790} />)
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.queryByText(/\//)).toBeNull()
  })

  it('split: 막대는 role=img(공동·개인 비율 이름), 범례는 같은 내용이라 aria-hidden', () => {
    const { container } = render(<MetricBar type="split" label="내 지출" amount={174190} shared={54} personal={46} />)
    expect(screen.getByRole('img', { name: '공동 54% · 개인 46%' })).toBeTruthy()
    expect(container.querySelector('ul')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('[data-part="shared"]')).toBeTruthy()
    expect(container.querySelector('[data-part="personal"]')).toBeTruthy()
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('split: 둘 다 null(내 지출 0)이면 빈 막대(장식) · 범례 없음', () => {
    const { container } = render(<MetricBar type="split" label="내 지출" amount={0} shared={null} personal={null} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('ul')).toBeNull()
    expect(container.querySelector('[data-part]')).toBeNull()
  })

  it('headingLevel을 주면 section + 제목으로 이름 붙는다', () => {
    render(<MetricBar headingLevel={3} label="공동 지출" amount={1000} total={2000} />)
    expect(screen.getByRole('heading', { level: 3, name: '공동 지출' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '공동 지출' })).toBeTruthy()
  })
})
