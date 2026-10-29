import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet, BottomSheetPanel } from './BottomSheet'

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
  it('v1.5 기본 내부 간격은 20px(gap-5)이다', () => {
    const { container } = render(<BottomSheetPanel title="제목">내용</BottomSheetPanel>)
    expect(container.firstElementChild?.className).toContain('gap-5')
  })
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

  describe('initialFocus(HF-46 · 48)', () => {
    // 브라우저 showModal은 dialog 안 첫 포커스 영역(tabIndex=-1 제목 포함)에 포커스를 준다 — jsdom에는 없어 흉내 낸다
    const proto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>
    const withShowModal = (run: () => void) => {
      proto.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '')
        this.querySelector<HTMLElement>('h2')?.focus()
      }
      proto.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open')
      }
      try {
        run()
      } finally {
        delete proto.showModal
        delete proto.close
      }
    }

    function FocusHarness({ initialFocus }: { initialFocus?: 'ref' | 'selector' }) {
      const [open, setOpen] = useState(false)
      const amount = useRef<HTMLInputElement>(null)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            시트 열기
          </button>
          <BottomSheet
            open={open}
            onClose={() => setOpen(false)}
            title="결제 내역 추가"
            initialFocus={initialFocus === 'ref' ? amount : initialFocus === 'selector' ? 'input[name="amount"]' : undefined}
          >
            <input aria-label="메모" />
            <input ref={amount} name="amount" aria-label="금액" inputMode="numeric" />
          </BottomSheet>
        </>
      )
    }

    it('없으면 showModal이 고른 제목에 포커스가 남는다(기본 동작)', () =>
      withShowModal(() => {
        render(<FocusHarness />)
        openSheet2()
        expect(document.activeElement?.tagName).toBe('H2')
      }))

    it('ref를 주면 열 때 그 입력에 포커스를 준다', () =>
      withShowModal(() => {
        render(<FocusHarness initialFocus="ref" />)
        openSheet2()
        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '금액' }))
      }))

    it('선택자를 주면 시트 안에서 찾아 포커스를 준다', () =>
      withShowModal(() => {
        render(<FocusHarness initialFocus="selector" />)
        openSheet2()
        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '금액' }))
      }))

    const openSheet2 = () => fireEvent.click(screen.getByRole('button', { name: '시트 열기' }))
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

  it('DS18 leading="back": 제목 앞 ‹ 는 onBack만 부르고 시트를 닫지 않으며, ✕는 기본으로 숨긴다', () => {
    const onBack = vi.fn()
    const onClose = vi.fn()
    render(<BottomSheet open onClose={onClose} leading="back" onBack={onBack} title="나누기" />)
    const sheet = screen.getByRole('dialog', { name: '나누기' })
    const back = screen.getByRole('button', { name: '뒤로' })
    const heading = screen.getByRole('heading', { name: '나누기' })
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull()
    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    // 단계와 상관없이 ESC는 시트 전체를 닫는다
    fireEvent.keyDown(sheet, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('DS18 leading="back"이어도 close를 켜면 ✕가 남는다', () => {
    render(<BottomSheetPanel title="나누기" leading="back" close />)
    expect(screen.getByRole('button', { name: '뒤로' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy()
  })

  it('DS18 action: 제목 오른쪽 텍스트 버튼(Ghost S)이 ✕ 앞에 온다', () => {
    const onEdit = vi.fn()
    render(<BottomSheetPanel title="타코야키" action={{ label: '수정', onClick: onEdit }} />)
    const edit = screen.getByRole('button', { name: '수정' })
    const close = screen.getByRole('button', { name: '닫기' })
    expect(edit.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(edit.className).toContain('text-brand')
    expect(edit.className).toContain('h-9')
    fireEvent.click(edit)
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('DS18 단계가 바뀌어 누른 행이 사라지면 포커스를 새 제목으로 옮긴다', () => {
    function Steps() {
      const [step, setStep] = useState<'form' | 'split'>('form')
      return (
        <BottomSheet
          open
          onClose={() => {}}
          title={step === 'form' ? '결제 내역 추가' : '나누기'}
          leading={step === 'split' ? 'back' : 'none'}
          onBack={() => setStep('form')}
        >
          {step === 'form' && (
            <button type="button" onClick={() => setStep('split')}>
              나누기 행
            </button>
          )}
        </BottomSheet>
      )
    }
    render(<Steps />)
    const row = screen.getByRole('button', { name: '나누기 행' })
    row.focus()
    fireEvent.click(row)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '나누기' }))
  })

  it('v1.6.3 Figma 이름 그대로: back = leading="back", action 라벨 기본 "수정"', () => {
    render(<BottomSheetPanel title="나누기" back action={{}} />)
    expect(screen.getByRole('button', { name: '뒤로' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '수정' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull()
  })
})

