import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '../BottomSheet/BottomSheet'
import { Dialog } from './Dialog'

const COPY = { title: '그룹을 삭제할까요?', message: '초대된 그룹원 모두에게서 사라져요.', confirmLabel: '삭제하기' }

describe('Dialog', () => {
  it('제목으로 이름, 문구로 설명이 붙은 alertdialog이고 처음 포커스는 취소다', () => {
    render(<Dialog open type="danger" {...COPY} onCancel={() => {}} onConfirm={() => {}} />)
    const dialog = screen.getByRole('alertdialog', { name: '그룹을 삭제할까요?' })
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText(COPY.message).id)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }))
  })

  it('확인·취소 버튼이 각 콜백을 부른다', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<Dialog open {...COPY} cancelLabel="닫기" onCancel={onCancel} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('ESC는 취소, 딤을 눌러서는 닫히지 않는다', () => {
    const onCancel = vi.fn()
    render(<Dialog open {...COPY} onCancel={onCancel} onConfirm={() => {}} />)
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(dialog.firstElementChild!)
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shared-to-personal은 정해진 문구를 기본으로 쓴다', () => {
    render(<Dialog open type="shared-to-personal" onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('alertdialog', { name: '개인 결제로 바꿀까요?' })).toBeTruthy()
    expect(screen.getByText('다른 멤버의 내역과 정산에서 빠져요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '바꾸기' })).toBeTruthy()
  })

  it('Tab이 두 버튼 사이에서만 돈다', () => {
    render(<Dialog open {...COPY} onCancel={() => {}} onConfirm={() => {}} />)
    const cancel = screen.getByRole('button', { name: '취소' })
    const confirm = screen.getByRole('button', { name: '삭제하기' })
    confirm.focus()
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('시트 위에 겹치면 ESC는 위의 다이얼로그만 닫는다', () => {
    const onSheetClose = vi.fn()
    const onCancel = vi.fn()
    render(
      <BottomSheet open title="결제 상세" onClose={onSheetClose}>
        <Dialog open type="shared-to-personal" onCancel={onCancel} onConfirm={() => {}} />
      </BottomSheet>,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: '바꾸기' }), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSheetClose).not.toHaveBeenCalled()
  })

  it('body={false}(v1.6)면 제목만 — 본문과 aria-describedby가 없다', () => {
    render(<Dialog open {...COPY} body={false} onCancel={() => {}} onConfirm={() => {}} />)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.getAttribute('aria-describedby')).toBeNull()
    expect(screen.queryByText(COPY.message)).toBeNull()
  })

  it('confirmState="loading"(v1.6)이면 확인 버튼이 aria-busy이고 누름을 무시한다', () => {
    const onConfirm = vi.fn()
    render(<Dialog open {...COPY} confirmState="loading" onCancel={() => {}} onConfirm={onConfirm} />)
    const confirm = screen.getByRole('button', { name: '삭제하기' })
    expect(confirm.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
