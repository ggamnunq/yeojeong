import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RowAdd } from '../Row/Add'
import { RowMember } from '../Row/Member'
import { PanelSide } from './Side'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        그룹 구성원
      </button>
      <PanelSide
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="그룹원 2명"
      >
        <RowMember person={{ name: '준용', me: true }} leader />
        <RowMember person={{ name: '민지' }} kick={{}} />
        <RowAdd label="초대코드 공유" />
      </PanelSide>
    </>
  )
}

const openPanel = () => {
  const trigger = screen.getByRole('button', { name: '그룹 구성원' })
  trigger.focus()
  fireEvent.click(trigger)
  return screen.getByRole('dialog', { name: '그룹원 2명' })
}

describe('PanelSide', () => {
  it('닫혀 있으면 없고, 열면 제목이 이름인 dialog · 첫 버튼(닫기)에 포커스', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const panel = openPanel()
    expect(panel.hasAttribute('open')).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' }))
  })

  it('ESC · 딤 · 닫기 버튼으로 닫히고, 닫히면 여는 버튼으로 포커스가 돌아간다', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(openPanel(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '그룹 구성원' }))

    fireEvent.click(openPanel().querySelector('[data-dim]')!)
    expect(onClose).toHaveBeenCalledTimes(2)

    openPanel()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('Tab은 패널 안에서 돈다(포커스 가두기)', () => {
    render(<Harness />)
    const panel = openPanel()
    const last = screen.getByRole('button', { name: '초대코드 공유' })
    last.focus()
    fireEvent.keyDown(panel, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' }))
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('패널 안을 눌러도 닫히지 않는다', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    openPanel()
    fireEvent.click(screen.getByRole('heading', { name: '그룹원 2명' }))
    fireEvent.click(screen.getByRole('button', { name: '민지 강퇴' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
