import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl, type SegmentedSelected } from './SegmentedControl'

const checked = (name: string) => (screen.getByRole('radio', { name }) as HTMLInputElement).checked

describe('SegmentedControl', () => {
  it('radiogroup 안에 라벨 수만큼 radio가 있고 첫 번째가 선택돼 있다', () => {
    render(<SegmentedControl labels={['전체', '공동', '개인']} aria-label="필터" />)
    expect(screen.getByRole('radiogroup', { name: '필터' })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(checked('전체')).toBe(true)
  })

  it('누르면 선택이 바뀌고 onChange가 Figma Selected 값과 순서를 준다', () => {
    const onChange = vi.fn()
    render(<SegmentedControl labels={['리스트', '타임라인']} aria-label="보기" onChange={onChange} />)
    fireEvent.click(screen.getByText('타임라인'))
    expect(onChange).toHaveBeenCalledWith('second', 1)
    expect(checked('타임라인')).toBe(true)
    expect(checked('리스트')).toBe(false)
  })

  it('selected를 넘기면 부모 상태를 따른다', () => {
    function Controlled() {
      const [selected, setSelected] = useState<SegmentedSelected>('third')
      return (
        <>
          <SegmentedControl labels={['전체', '공동', '개인']} aria-label="필터" selected={selected} onChange={setSelected} />
          <output>{selected}</output>
        </>
      )
    }
    render(<Controlled />)
    expect(checked('개인')).toBe(true)
    fireEvent.click(screen.getByText('공동'))
    expect(screen.getByRole('status').textContent).toBe('second')
    expect(checked('공동')).toBe(true)
  })

  it('컨트롤 두 개가 서로의 선택을 건드리지 않는다', () => {
    render(
      <>
        <SegmentedControl labels={['A', 'B']} aria-label="첫째" />
        <SegmentedControl labels={['C', 'D']} aria-label="둘째" defaultSelected="second" />
      </>,
    )
    fireEvent.click(screen.getByText('B'))
    expect(checked('B')).toBe(true)
    expect(checked('D')).toBe(true)
  })

  it('size="s"(v1.6)는 높이 32 · Label/S · 폭 176(2칸)/240(3칸), 기본 m은 높이 44 · FILL', () => {
    const { rerender } = render(<SegmentedControl size="s" labels={['리스트', '타임라인']} aria-label="보기" />)
    const group = screen.getByRole('radiogroup')
    expect(group.className).toContain('h-8')
    expect(group.className).toContain('w-44')
    expect(screen.getByText('리스트').parentElement!.className).toContain('text-label-s')
    rerender(<SegmentedControl size="s" labels={['전체', '공동', '개인']} aria-label="보기" />)
    expect(screen.getByRole('radiogroup').className).toContain('w-60')
    rerender(<SegmentedControl labels={['전체', '공동', '개인']} aria-label="보기" />)
    expect(screen.getByRole('radiogroup').className).toContain('h-11')
    expect(screen.getByRole('radiogroup').className).toContain('w-full')
  })

  it('disabledItems(v1.6 Disabled n)는 그 칸만 비활성 — 눌러도 바뀌지 않고 나머지는 동작한다', () => {
    const onChange = vi.fn()
    render(<SegmentedControl labels={['개인', '공동']} disabledItems={['second']} aria-label="구분" onChange={onChange} />)
    expect((screen.getByRole('radio', { name: '공동' }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: '개인' }) as HTMLInputElement).disabled).toBe(false)
    fireEvent.click(screen.getByText('공동'))
    expect(onChange).not.toHaveBeenCalled()
    expect(checked('개인')).toBe(true)
  })
})
