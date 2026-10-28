import { clsx } from 'clsx'
import { useId, type MouseEventHandler, type ReactNode } from 'react'
import { Button, type ButtonProps } from '../Button/Button'
import { IconButton } from '../IconButton/IconButton'
import { useModalDialog } from '../useModalDialog'

// Figma BottomSheet(24:8647) · Title · Close · CTA · Content(슬롯 = children).
// 손잡이 36×4 → 헤더(제목 H3 + 닫기 IconButton Ghost M) → 내용(hug) → CTA(Button Primary L FILL), 간격 16.
// 패딩 8/20/(24 + 안전영역)/20, 위 모서리 radius/2xl, Elevation/3, 뒤에 bg/dim.
export type BottomSheetCta = Pick<ButtonProps, 'label' | 'onClick' | 'disabled' | 'htmlType' | 'form'>

export type BottomSheetPanelProps = {
  /** Figma Title */
  title: ReactNode
  /** Figma Close — 오른쪽 위 닫기 버튼. 기본 true */
  close?: boolean
  /** Figma CTA — 값이 있으면 아래에 Button Primary L을 꽉 채워 그린다 */
  cta?: BottomSheetCta
  /** Figma Content 슬롯 */
  children?: ReactNode
  onClose?: MouseEventHandler<HTMLButtonElement>
  titleId?: string
  className?: string
}

/** 시트의 겉모습만(모달 동작 없음). BottomSheet 안에서 쓰고, 카탈로그에서 열린 모습을 고정해 보여 줄 때 쓴다. */
export function BottomSheetPanel({
  title,
  close = true,
  cta,
  children,
  onClose,
  titleId,
  className,
}: BottomSheetPanelProps) {
  return (
    <div
      className={clsx(
        'flex max-h-[calc(100dvh-var(--spacing-header-height))] w-full flex-col gap-4 rounded-t-2xl bg-surface px-5 pt-2 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] shadow-elevation-3',
        className,
      )}
    >
      <div aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-neutral-300" />
      <div className="flex shrink-0 items-center gap-2">
        <h2 id={titleId} className="min-w-0 flex-1 text-h3 text-primary">
          {title}
        </h2>
        {close && <IconButton size="m" icon="close" label="닫기" onClick={onClose} />}
      </div>
      {/* 내용이 길면 이 부분만 스크롤된다. 포커스 링이 잘리지 않게 스크롤 영역을 양옆·위아래로 조금 넓혔다. */}
      {children != null && <div className="-mx-5 -my-1 min-h-0 overflow-y-auto px-5 py-1">{children}</div>}
      {cta && <Button type="primary" size="l" className="w-full" {...cta} />}
    </div>
  )
}

export type BottomSheetProps = Omit<BottomSheetPanelProps, 'onClose' | 'titleId'> & {
  open: boolean
  /** ESC · 딤 탭 · 닫기 버튼 · 뒤로 가기(닫기 요청) */
  onClose: () => void
  'aria-describedby'?: string
}

export function BottomSheet({ open, onClose, 'aria-describedby': describedBy, ...panel }: BottomSheetProps) {
  const titleId = useId()
  const { dialogProps, requestClose } = useModalDialog(open, onClose)

  return (
    <dialog
      {...dialogProps}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      className={clsx(
        // UA 스타일(가운데 정렬·여백·CanvasText 색)을 지우고 화면 전체를 덮는 투명 틀로 쓴다
        'group/sheet fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-primary backdrop:bg-transparent',
        // 닫힐 때 아래 애니메이션이 끝날 때까지 최상위 레이어에 남겨 둔다
        'transition-[display,overlay] transition-discrete duration-200 motion-reduce:transition-none',
      )}
    >
      <div
        data-dim=""
        aria-hidden
        onClick={requestClose}
        className="absolute inset-0 bg-dim opacity-0 transition-opacity duration-200 group-open/sheet:opacity-100 motion-reduce:transition-none starting:group-open/sheet:opacity-0"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-screen-width translate-y-full transition-transform duration-200 ease-out group-open/sheet:translate-y-0 motion-reduce:transition-none starting:group-open/sheet:translate-y-full">
        <BottomSheetPanel {...panel} titleId={titleId} onClose={requestClose} />
      </div>
    </dialog>
  )
}
