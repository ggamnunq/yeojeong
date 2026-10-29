import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '../ds'
import { createToastStore, type ToastStore } from './store'
import { ToastHost } from './ToastHost'

let store: ToastStore
const layer = () => document.querySelector<HTMLElement>('[data-toast-layer]')

beforeEach(() => {
  store = createToastStore()
})

afterEach(() => {
  store.clear()
})

function SheetDemo({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        시트 열기
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="결제 상세">
        <p>내용</p>
      </BottomSheet>
      <ToastHost store={store} />
    </>
  )
}

describe('ToastHost', () => {
  it('토스트가 없으면 아무것도 그리지 않는다', () => {
    render(<ToastHost store={store} />)
    expect(layer()).toBeNull()
  })

  it('큐의 토스트를 DS Toast로 그리고, 오류는 alert로 읽힌다', () => {
    render(<ToastHost store={store} />)
    act(() => {
      store.show('success', '초대코드를 복사했어요')
    })
    expect(screen.getByRole('status').textContent).toBe('초대코드를 복사했어요')
    act(() => {
      store.show('error', '저장하지 못했어요')
    })
    // 한 번에 하나: 앞 토스트를 바로 바꾼다
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('저장하지 못했어요')
    expect(layer()?.parentElement).toBe(document.body)
    // jsdom에는 Popover API가 없어 일반 고정 층으로 그린다
    expect(layer()?.hasAttribute('popover')).toBe(false)
  })

  it('Popover API가 있으면 popover="manual"로 최상위 레이어에 올린다', () => {
    const showPopover = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { value: showPopover, configurable: true })
    try {
      render(<ToastHost store={store} />)
      act(() => {
        store.show('info', '공동 지출로 바꿨어요')
      })
      expect(layer()?.getAttribute('popover')).toBe('manual')
      expect(showPopover).toHaveBeenCalledTimes(1)
      expect(showPopover.mock.contexts[0]).toBe(layer())
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover
    }
  })

  it('액션을 누르면 콜백을 부르고 닫힌다', () => {
    const onClick = vi.fn()
    render(<ToastHost store={store} />)
    act(() => {
      store.show('error', '연결 상태를 확인해 주세요', { action: { label: '다시 시도', onClick } })
    })

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(layer()).toBeNull()
  })

  it('포인터가 올라가 있는 동안은 닫히지 않는다', () => {
    vi.useFakeTimers()
    try {
      render(<ToastHost store={store} />)
      act(() => {
        store.show('success', '복사했어요')
      })
      fireEvent.pointerEnter(screen.getByRole('status'))
      act(() => vi.advanceTimersByTime(10_000))
      expect(screen.getByRole('status')).toBeTruthy()

      fireEvent.pointerLeave(screen.getByRole('status'))
      act(() => vi.advanceTimersByTime(3000))
      expect(layer()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('시트·다이얼로그가 열리면 떠 있던 토스트는 바로 닫는다(화면명세 0-4 v0.5.8)', async () => {
    render(<SheetDemo />)
    act(() => {
      store.show('info', '공동 지출로 바꿨어요')
    })
    expect(layer()?.parentElement).toBe(document.body)

    fireEvent.click(screen.getByRole('button', { name: '시트 열기' }))
    await act(async () => {})
    expect(document.querySelector('dialog')!.open).toBe(true)
    expect(layer()).toBeNull()
  })

  it('시트가 열린 뒤 뜬 토스트는 그 dialog 안에 그리고, 시트가 닫히면 body로 돌아온다', async () => {
    render(<SheetDemo />)
    fireEvent.click(screen.getByRole('button', { name: '시트 열기' }))
    await act(async () => {})
    const dialog = document.querySelector('dialog')!
    act(() => {
      store.show('info', '공동 지출로 바꿨어요')
    })
    // MutationObserver가 open 속성 변화를 알려 준 뒤
    await act(async () => {})
    expect(layer()?.parentElement).toBe(dialog)
    expect(dialog.contains(screen.getByRole('status'))).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    await act(async () => {})
    expect(dialog.open).toBe(false)
    expect(layer()?.parentElement).toBe(document.body)
    expect(screen.getByRole('status').textContent).toBe('공동 지출로 바꿨어요')
  })

  it('이미 열린 시트 위에서 토스트가 생기면 처음부터 dialog 안에 그린다', () => {
    render(<SheetDemo initialOpen />)
    act(() => {
      store.show('error', '저장하지 못했어요')
    })
    expect(layer()?.parentElement).toBe(document.querySelector('dialog'))
  })
})
