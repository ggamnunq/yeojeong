import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TopHeader } from '../TopHeader/TopHeader'
import { DropdownMenu } from './Menu'

function Harness({ onSelect = () => {}, onNew = () => {} }: { onSelect?: (i: number) => void; onNew?: () => void }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(1)
  const names = ['오사카 3박 4일', '제주 2박 3일', '부산 1박 2일']
  return (
    <>
      <TopHeader groupName={names[current]} dropdown={open ? 'open' : 'closed'} onGroupClick={() => setOpen(true)} />
      <DropdownMenu
        open={open}
        onClose={() => setOpen(false)}
        trips={names.map((title, i) => ({
          title,
          meta: ['진행 중', '시작 전 · 12.27', '정산 완료'][i],
          current: i === current,
          onSelect: () => {
            setCurrent(i)
            onSelect(i)
          },
        }))}
        actions={[{ label: '새 여정 만들기', onSelect: onNew }]}
      />
    </>
  )
}

const openMenu = () => {
  const trigger = screen.getByRole('button', { name: /2박 3일|3박 4일|1박 2일/ })
  trigger.focus()
  fireEvent.click(trigger)
  return screen.getByRole('menu', { name: '여정 전환' })
}

describe('DropdownMenu', () => {
  it('그룹명 버튼은 aria-haspopup=menu · 열리면 aria-expanded와 ⌃', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '제주 2박 3일' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    openMenu()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.querySelector('.lucide-chevron-up')).toBeTruthy()
  })

  it('role=menu: 여정은 menuitemradio(현재 = checked), 새 여정은 menuitem. 열면 현재 여정에 포커스', () => {
    render(<Harness />)
    const menu = openMenu()
    const radios = screen.getAllByRole('menuitemradio')
    expect(radios).toHaveLength(3)
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(screen.getByRole('menuitem', { name: '새 여정 만들기' })).toBeTruthy()
    expect(document.activeElement).toBe(radios[1])
    expect(menu.contains(document.activeElement)).toBe(true)
  })

  it('↑↓는 돌아가며, Home · End는 처음 · 끝으로 옮긴다', () => {
    render(<Harness />)
    const menu = openMenu()
    const items = [...screen.getAllByRole('menuitemradio'), screen.getByRole('menuitem')]
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[2])
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[3])
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[3])
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(items[3])
  })

  it('항목을 고르면 닫고 onSelect를 부르며, 여는 버튼으로 포커스가 돌아간다', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitemradio', { name: /부산 1박 2일/ }))
    expect(onSelect).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '부산 1박 2일' }))
  })

  it('새 여정 만들기도 닫고 콜백을 부른다', () => {
    const onNew = vi.fn()
    render(<Harness onNew={onNew} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '새 여정 만들기' }))
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('ESC · Tab · 바깥(딤·헤더 자리)을 누르면 닫힌다', () => {
    render(<Harness />)
    fireEvent.keyDown(openMenu(), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.keyDown(openMenu(), { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()

    openMenu()
    fireEvent.click(screen.getByRole('dialog', { name: '여정 전환' }).firstElementChild!)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
