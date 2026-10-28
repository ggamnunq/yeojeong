import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'

function Harness({ onClose = () => {}, onCta = () => {}, close }: { onClose?: () => void; onCta?: () => void; close?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        시트 열기
      </button>
      <BottomSheet
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="결제 상세"
        close={close}
        cta={{ label: '저장하기', onClick: onCta }}
      >
        <input aria-label="메모" />
      </BottomSheet>
    </>
  )
}

const openSheet = () => {
  fireEvent.click(screen.getByRole('button', { name: '시트 열기' }))
  return screen.getByRole('dialog', { name: '결제 상세' })
}

describe('BottomSheet', () => {
  it('닫혀 있으면 보이지 않고, 열면 제목이 이름인 dialog가 된다', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const sheet = openSheet()
    expect(sheet.hasAttribute('open')).toBe(true)
  })

  it('ESC로 닫힌다', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(openSheet(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('딤을 누르면 닫히고, 시트 안을 누르면 닫히지 않는다', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const sheet = openSheet()
    fireEvent.click(screen.getByRole('textbox', { name: '메모' }))
    fireEvent.click(screen.getByRole('heading', { name: '결제 상세' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(sheet.querySelector('[data-dim]')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('닫기 버튼으로 닫히고, close={false}면 닫기 버튼이 없다', () => {
    const onClose = vi.fn()
    const { unmount } = render(<Harness onClose={onClose} />)
    openSheet()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    render(<Harness close={false} />)
    openSheet()
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull()
  })

  it('CTA는 Button Primary로 그려지고 누르면 콜백을 부른다(시트는 부모가 닫는다)', () => {
    const onCta = vi.fn()
    render(<Harness onCta={onCta} />)
    openSheet()
    fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    expect(onCta).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('열면 포커스가 시트 안으로 들어가고, Tab·Shift+Tab이 시트 안에서만 돈다', () => {
    render(<Harness />)
    openSheet()
    const close = screen.getByRole('button', { name: '닫기' })
    const cta = screen.getByRole('button', { name: '저장하기' })
    expect(document.activeElement).toBe(close)

    cta.focus()
    fireEvent.keyDown(cta, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cta)
  })

  it('닫히면 연 버튼으로 포커스가 돌아간다', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '시트 열기' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).not.toBe(opener)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
  })

  it('열려 있는 동안 문서 스크롤을 잠그고 닫으면 되돌린다', () => {
    render(<Harness />)
    expect(document.documentElement.style.overflow).toBe('')
    const sheet = openSheet()
    expect(document.documentElement.style.overflow).toBe('hidden')
    fireEvent.keyDown(sheet, { key: 'Escape' })
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('브라우저의 닫기 요청(cancel 이벤트)도 onClose로 알린다', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const sheet = openSheet()
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(sheet, cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
