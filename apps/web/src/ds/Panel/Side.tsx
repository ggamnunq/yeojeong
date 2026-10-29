import { clsx } from 'clsx'
import { useId, type MouseEventHandler, type ReactNode } from 'react'
import { IconButton } from '../IconButton/IconButton'
import { useModalDialog } from '../useModalDialog'

// Figma Panel/Side(30:69592) · 그룹원 드로어(헤더 ≡). 왼쪽 300 × 화면 높이, 오른쪽 모서리 radius/2xl(24), Elevation/3, 뒤에 bg/dim.
// 헤더(제목 H3 + 닫기) 아래에 Row/Member × n + Row/Add("초대코드 공유")를 children으로 넣는다(간격 4).
// 모달 동작은 BottomSheet·Dialog와 같은 useModalDialog(네이티브 <dialog> · ESC · Tab 가두기 · 포커스 되돌리기 · 스크롤 잠금).
export type PanelSidePanelProps = {
  /** Figma title: "그룹원 4명" */
  title: ReactNode
  /** 오른쪽 위 닫기 버튼. 기본 true */
  close?: boolean
  /** Row/Member · Row/Add 등 */
  children?: ReactNode
  onClose?: MouseEventHandler<HTMLButtonElement>
  titleId?: string
  className?: string
}

/** 패널의 겉모습만(모달 동작 없음). PanelSide 안에서 쓰고, 카탈로그에서 열린 모습을 고정해 보여 줄 때 쓴다. */
export function PanelSidePanel({ title, close = true, children, onClose, titleId, className }: PanelSidePanelProps) {
  return (
    <div
      className={clsx(
        // Figma 위 60 = 상태바 44 + 16 → 웹은 16 + 위 안전영역. 아래 34(홈 인디케이터) → 16 + 아래 안전영역
        'flex h-full w-75 max-w-full flex-col gap-1 overflow-y-auto rounded-r-2xl bg-surface pt-[calc(--spacing(4)+env(safe-area-inset-top))] pb-[calc(--spacing(4)+env(safe-area-inset-bottom))] shadow-elevation-3',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 pr-3 pb-2 pl-5">
        <h2 id={titleId} className="min-w-0 flex-1 text-h3 text-primary">
          {title}
        </h2>
        {close && <IconButton size="m" icon="close" label="닫기" onClick={onClose} />}
      </div>
      {children}
    </div>
  )
}

export type PanelSideProps = Omit<PanelSidePanelProps, 'onClose' | 'titleId'> & {
  open: boolean
  /** ESC · 딤 탭 · 닫기 버튼 · 뒤로 가기(닫기 요청) */
  onClose: () => void
  'aria-describedby'?: string
}

export function PanelSide({ open, onClose, 'aria-describedby': describedBy, ...panel }: PanelSideProps) {
  const titleId = useId()
  const { dialogProps, requestClose } = useModalDialog(open, onClose, 'panel')

  return (
    <dialog
      {...dialogProps}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      className={clsx(
        // UA 스타일을 지우고 화면 전체를 덮는 투명 틀로 쓴다(BottomSheet와 같다)
        'group/panel fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-primary backdrop:bg-transparent',
        'transition-[display,overlay] transition-discrete duration-200 motion-reduce:transition-none',
      )}
    >
      <div
        data-dim=""
        aria-hidden
        onClick={requestClose}
        className="absolute inset-0 bg-dim opacity-0 transition-opacity duration-200 group-open/panel:opacity-100 motion-reduce:transition-none starting:group-open/panel:opacity-0"
      />
      {/* 데스크톱에서도 390 화면 열의 왼쪽 끝에 붙인다. 열 자체는 딤 클릭을 막지 않는다. */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-screen-width -translate-x-1/2">
        <div className="pointer-events-auto h-full w-fit -translate-x-full transition-transform duration-200 ease-out group-open/panel:translate-x-0 motion-reduce:transition-none starting:group-open/panel:-translate-x-full">
          <PanelSidePanel {...panel} titleId={titleId} onClose={requestClose} />
        </div>
      </div>
    </dialog>
  )
}
