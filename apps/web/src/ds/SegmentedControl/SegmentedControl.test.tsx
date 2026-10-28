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
})
