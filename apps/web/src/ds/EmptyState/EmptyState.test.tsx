import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '../Button/Button'
import { IllustSettled } from '../Illust/Illust'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('type="no-trip"은 H3 제목 + 설명(기본 문구)', () => {
    render(<EmptyState type="no-trip" />)
    expect(screen.getByRole('heading', { level: 2, name: '아직 참여한 여정이 없어요' }).className).toContain('text-h3')
    expect(screen.getByText(/초대코드로 참여하거나/)).toBeTruthy()
  })

  it('type="illust"(v1.6 · HF-09)은 일러스트 160 + H2 제목 + 버튼, 설명은 그리지 않는다', () => {
    const { container } = render(
      <EmptyState
        type="illust"
        message="그리지 않음"
        actions={
          <>
            <Button label="여정 만들기" />
            <Button type="secondary" label="초대코드로 참여" />
          </>
        }
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: '참여한 여정이 없어요' }).className).toContain('text-h2')
    expect(screen.queryByText('그리지 않음')).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('160')
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('layout="horizontal"(v1.6.2)이면 버튼을 가로 1:1(간격 8), 기본은 세로', () => {
    const actions = (
      <>
        <Button type="secondary" label="초대코드로 참여" />
        <Button label="여정 만들기" />
      </>
    )
    const { rerender } = render(<EmptyState type="illust" actions={actions} />)
    const box = () => screen.getByRole('button', { name: '여정 만들기' }).parentElement as HTMLElement
    expect(box().className).toContain('flex-col')
    rerender(<EmptyState type="illust" layout="horizontal" actions={actions} />)
    expect(box().className).not.toContain('flex-col')
    expect(box().className).toContain('*:flex-1')
    expect(box().className).toContain('gap-2')
    const [left, right] = screen.getAllByRole('button')
    expect(left.textContent).toBe('초대코드로 참여')
    expect(right.textContent).toBe('여정 만들기')
  })

  it('illust를 교체할 수 있다(Figma Illust 인스턴스 교체)', () => {
    render(<EmptyState type="illust" title="정산할 결제가 없어요" illust={<IllustSettled size={160} label="정산 완료" />} />)
    expect(screen.getByRole('img', { name: '정산 완료' })).toBeTruthy()
  })
})
