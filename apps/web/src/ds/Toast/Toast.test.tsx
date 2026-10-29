import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { BottomSheet } from '../BottomSheet/BottomSheet'
import { Dialog } from '../Dialog/Dialog'
import { Screen } from '../Screen/Screen'
import { onModalOpen, type ModalKind } from '../useModalDialog'
import { toastAnchorFor } from './anchor'
import { Toast, ToastViewport } from './Toast'

describe('Toast', () => {
  it('성공·안내는 status, 오류는 alert로 읽힌다', () => {
    const { rerender } = render(<Toast type="success" message="초대코드를 복사했어요" />)
    expect(screen.getByRole('status').textContent).toBe('초대코드를 복사했어요')
    rerender(<Toast type="info" message="공동 지출로 바꿨어요" />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Toast type="error" message="저장하지 못했어요" />)
    expect(screen.getByRole('alert').textContent).toBe('저장하지 못했어요')
  })

  it('action이 있으면 버튼 하나를 그리고 누르면 콜백을 부른다', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Toast message="공동 지출로 바꿨어요" />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<Toast message="공동 지출로 바꿨어요" action={{ label: '실행 취소', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('ToastViewport는 내비 위/아래 기준으로 자리만 잡는다', () => {
    const { container, rerender } = render(
      <ToastViewport>
        <Toast message="a" />
      </ToastViewport>,
    )
    expect((container.firstElementChild as HTMLElement).className).toContain('--spacing-nav-height')
    rerender(<ToastViewport aboveNav={false} />)
    expect((container.firstElementChild as HTMLElement).className).not.toContain('--spacing-nav-height')
  })

  describe('위치(DS17, 화면명세 0-4)', () => {
    const anchorOf = (container: HTMLElement) => (container.firstElementChild as HTMLElement).dataset.anchor

    it('toastAnchorFor: 내비 위 · CTA 위 · 안전영역 위, 둘 다면 nav-cta(CTA를 덮지 않게)', () => {
      expect(toastAnchorFor({ nav: true, cta: false })).toBe('nav')
      expect(toastAnchorFor({ nav: false, cta: true })).toBe('cta')
      expect(toastAnchorFor({ nav: true, cta: true })).toBe('nav-cta')
      expect(toastAnchorFor({ nav: false, cta: false })).toBe('safe-area')
    })

    it('anchor를 주면 그 기준, 없으면 aboveNav(v1.6 호환)', () => {
      const { container, rerender } = render(<ToastViewport anchor="cta" />)
      expect(anchorOf(container)).toBe('cta')
      expect((container.firstElementChild as HTMLElement).className).toContain('--spacing(25)')
      rerender(<ToastViewport anchor="safe-area" aboveNav />)
      expect(anchorOf(container)).toBe('safe-area')
      rerender(<ToastViewport />)
      expect(anchorOf(container)).toBe('nav')
    })

    it('anchor="auto"는 지금 그려진 Screen의 하단 구성을 따른다', () => {
      const { container } = render(<ToastViewport anchor="auto" aboveNav={false} />)
      expect(anchorOf(container)).toBe('safe-area')
      const page = render(<Screen cta={{ label: '다음' }}>본문</Screen>)
      expect(anchorOf(container)).toBe('cta')
      page.rerender(<Screen nav={<nav />}>본문</Screen>)
      expect(anchorOf(container)).toBe('nav')
      page.unmount()
      expect(anchorOf(container)).toBe('safe-area')
    })
  })

  it('onModalOpen: 시트·다이얼로그가 열리면 종류와 함께 알린다(호스트가 떠 있던 토스트를 닫는다)', () => {
    const kinds: ModalKind[] = []
    const off = onModalOpen((kind) => kinds.push(kind))
    const { rerender } = render(<BottomSheet open={false} onClose={() => {}} title="결제 상세" />)
    expect(kinds).toEqual([])
    act(() => rerender(<BottomSheet open onClose={() => {}} title="결제 상세" />))
    expect(kinds).toEqual(['sheet'])
    off()
    act(() => rerender(<BottomSheet open={false} onClose={() => {}} title="결제 상세" />))
    const after: ModalKind[] = []
    const off2 = onModalOpen((kind) => after.push(kind))
    render(<Dialog open title="그룹을 삭제할까요?" confirmLabel="삭제" onConfirm={() => {}} onCancel={() => {}} />)
    expect(after).toEqual(['dialog'])
    expect(kinds).toEqual(['sheet'])
    off2()
  })
})
