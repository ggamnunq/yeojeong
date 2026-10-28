import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomNav } from '../BottomNav/BottomNav'
import { TopHeader } from '../TopHeader/TopHeader'
import { Screen } from './Screen'

describe('Screen', () => {
  it('header → main → nav 순서로 랜드마크를 놓는다', () => {
    render(
      <Screen header={<TopHeader groupName="오사카" />} nav={<BottomNav />}>
        <p>본문</p>
      </Screen>,
    )
    const banner = screen.getByRole('banner')
    const main = screen.getByRole('main')
    const nav = screen.getByRole('navigation')
    expect(main.textContent).toBe('본문')
    expect(banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(main.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('cta를 주면 본문 아래에 Primary 버튼을 그린다', () => {
    const onClick = vi.fn()
    render(<Screen cta={{ label: '다음', onClick }}>본문</Screen>)
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('main').contains(screen.getByRole('button'))).toBe(false)
  })

  it('기본은 본문에 좌우 거터, gutter={false}면 없다', () => {
    const { rerender } = render(<Screen>본문</Screen>)
    expect(screen.getByRole('main').className).toContain('px-gutter')
    rerender(<Screen gutter={false}>본문</Screen>)
    expect(screen.getByRole('main').className).not.toContain('px-gutter')
  })
})
