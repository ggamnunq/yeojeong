import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomNav } from './BottomNav'

const current = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page')

describe('BottomNav', () => {
  it('nav 랜드마크 안에 탭 3개 목록이 있고 첫 탭이 현재 페이지다', () => {
    render(<BottomNav />)
    const nav = screen.getByRole('navigation', { name: '여정 메뉴' })
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3)
    expect(current().map((b) => b.textContent)).toEqual(['결제내역'])
  })

  it('active가 aria-current="page"를 옮긴다', () => {
    render(<BottomNav active="third" />)
    expect(current().map((b) => b.textContent)).toEqual(['여정 정보'])
    expect(screen.getByRole('button', { name: '결제내역' }).hasAttribute('aria-current')).toBe(false)
  })

  it('phase="ended"면 가운데 탭이 정산이 된다', () => {
    const { rerender } = render(<BottomNav active="second" />)
    expect(current()[0].textContent).toBe('현황')
    rerender(<BottomNav active="second" phase="ended" />)
    expect(current()[0].textContent).toBe('정산')
    expect(screen.queryByRole('button', { name: '현황' })).toBeNull()
  })

  it('누르면 onChange에 Figma Active 값을 준다', () => {
    const onChange = vi.fn()
    render(<BottomNav onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '여정 정보' }))
    expect(onChange).toHaveBeenCalledWith('third')
  })

  it('hrefs를 주면 링크가 되고 현재 탭에 aria-current가 붙는다', () => {
    render(<BottomNav active="second" hrefs={['/payments', '/status', '/info']} />)
    const link = screen.getByRole('link', { name: '현황' })
    expect(link.getAttribute('href')).toBe('/status')
    expect(link.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: '결제내역' }).hasAttribute('aria-current')).toBe(false)
  })
})
