import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopHeader } from './TopHeader'

describe('TopHeader', () => {
  it('group: ≡ · 그룹명(h1 안 버튼) · 지갑 · 마이를 그리고 각 콜백을 부른다', () => {
    const fns = { onMenuClick: vi.fn(), onGroupClick: vi.fn(), onWalletClick: vi.fn(), onMyClick: vi.fn() }
    render(<TopHeader groupName="오사카 3박 4일" {...fns} />)
    expect(screen.getByRole('banner')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: '오사카 3박 4일' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '그룹 구성원' }))
    fireEvent.click(screen.getByRole('button', { name: '오사카 3박 4일' }))
    fireEvent.click(screen.getByRole('button', { name: '지갑' }))
    fireEvent.click(screen.getByRole('button', { name: '마이페이지' }))
    for (const fn of Object.values(fns)) expect(fn).toHaveBeenCalledTimes(1)
  })

  it('group: menu={false}면 ≡가 없고, statusBadge면 상태 배지가 그룹명 옆에 붙는다', () => {
    const { rerender } = render(<TopHeader groupName="오사카" menu={false} />)
    expect(screen.queryByRole('button', { name: '그룹 구성원' })).toBeNull()
    expect(screen.queryByText('진행 중')).toBeNull()
    rerender(<TopHeader groupName="오사카" statusBadge />)
    expect(screen.getByText('진행 중')).toBeTruthy()
    rerender(<TopHeader groupName="오사카" statusBadge status="ended" />)
    expect(screen.getByText('종료')).toBeTruthy()
    // 배지는 그룹명 버튼 이름에 섞이지 않는다
    expect(screen.getByRole('button', { name: '오사카' })).toBeTruthy()
  })

  it('back: 뒤로 가기 + 제목(h1), action은 있을 때만', () => {
    const onBack = vi.fn()
    const onAction = vi.fn()
    const { rerender } = render(<TopHeader type="back" title="결제 상세" onBack={onBack} />)
    expect(screen.getByRole('heading', { level: 1, name: '결제 상세' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '뒤로 가기' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    rerender(<TopHeader type="back" title="결제 상세" action={{ label: '더 보기', onClick: onAction }} />)
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '지갑' })).toBeNull()
  })

  it('logo: 워드마크(h1) + 지갑 · 마이, ≡와 그룹명은 없다', () => {
    render(<TopHeader type="logo" />)
    expect(screen.getByRole('heading', { level: 1, name: '여정' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '지갑' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '마이페이지' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '그룹 구성원' })).toBeNull()
  })
})
