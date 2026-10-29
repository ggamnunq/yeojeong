import { clsx } from 'clsx'
import { useEffect, useId, useRef, type MouseEventHandler, type ReactNode } from 'react'
import { BottomCTA, type BottomCTASingle, type BottomCTAValue } from '../BottomCTA/BottomCTA'
import { Button } from '../Button/Button'
import { IconButton } from '../IconButton/IconButton'
import { useModalDialog } from '../useModalDialog'

// Figma BottomSheet(24:8647) · Title · Close · CTA · Content(슬롯 = children).
// 손잡이 36×4 → 헤더(제목 H3 + 닫기 IconButton Ghost M) → 내용(hug) → CTA(Button Primary L FILL), 간격 20(v1.5).
// 패딩 8/20/(24 + 안전영역)/20, 위 모서리 radius/2xl, Elevation/3, 뒤에 bg/dim.
// v1.6.3(DS18) 헤더 순서 back · title(FILL) · action · close, 간격 8.
// Back#88:0 = 제목 앞 ‹(IconButton Ghost M) — 같은 시트 안 단계 전환(HF-47 나누기 · HF-48b 여정 선택). 코드는 leading="back" 또는 back.
// 겹 시트가 아니라 한 시트의 내용만 바꾸므로 ‹는 앞 단계로, ESC·딤·✕는 시트 전체를 닫는다. Back이면 ✕는 기본으로 숨긴다(Figma).
// Action#88:1 = 제목 오른쪽 텍스트 버튼(Button Ghost S · Label/M text/brand, 기본 "수정") — 결제 상세(HF-20b).
/** 시트 헤더 왼쪽: none = 제목만(기본), back = ‹ + 제목(시트 안 단계) */
export type BottomSheetLeading = 'none' | 'back'

/** 시트 헤더 오른쪽 텍스트 버튼(Figma edit — "수정" · "완료") */
export type BottomSheetAction = {
  /** Figma action Label. 기본 "수정" */
  label?: ReactNode
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  'aria-label'?: string
}

/** 시트 CTA 버튼 하나(Layout=Single). DS17부터 state(loading·disabled)·aria-label도 받는다 */
export type BottomSheetCta = BottomCTASingle
/** 시트 CTA: 버튼 하나 또는 가로 2버튼({ layout: 'horizontal', secondary, primary }) */
export type BottomSheetCtaValue = BottomCTAValue

export type BottomSheetPanelProps = {
  /** Figma Title */
  title: ReactNode
  /** 헤더 왼쪽(DS18): back이면 제목 앞 ‹. 기본 none */
  leading?: BottomSheetLeading
  /** Figma Back(v1.6.3, 기본 off) — leading="back"과 같다 */
  back?: boolean
  /** ‹ 누름(leading="back") — 앞 단계로. 시트를 닫지 않는다 */
  onBack?: MouseEventHandler<HTMLButtonElement>
  /** ‹ 접근성 이름. 기본 "뒤로" */
  backLabel?: string
  /** Figma Action(DS18): 제목 오른쪽 텍스트 버튼("수정"). 객체를 주면 켜진다 */
  action?: BottomSheetAction
  /** Figma Close — 오른쪽 위 닫기 버튼. 기본 true, leading="back"이면 기본 false */
  close?: boolean
  /** Figma CTA — 값이 있으면 아래에 Button Primary L을 꽉 채워 그린다. layout="horizontal"이면 가로 2버튼(DS17) */
  cta?: BottomSheetCtaValue
  /** Figma Content 슬롯 */
  children?: ReactNode
  onClose?: MouseEventHandler<HTMLButtonElement>
  titleId?: string
  className?: string
}

/** 시트의 겉모습만(모달 동작 없음). BottomSheet 안에서 쓰고, 카탈로그에서 열린 모습을 고정해 보여 줄 때 쓴다. */
export function BottomSheetPanel({
  title,
  leading: leadingProp,
  back = false,
  onBack,
  backLabel = '뒤로',
  action,
  close: closeProp,
  cta,
  children,
  onClose,
  titleId,
  className,
}: BottomSheetPanelProps) {
  const leading: BottomSheetLeading = leadingProp ?? (back ? 'back' : 'none')
  const close = closeProp ?? leading !== 'back'
  const headingRef = useRef<HTMLHeadingElement>(null)
  const step = useRef({ title, leading })
  // 시트 안 단계가 바뀌면(제목·leading) 누른 행이 사라져 포커스가 body로 떨어진다. 그때만 새 제목으로 옮긴다.
  useEffect(() => {
    const prev = step.current
    step.current = { title, leading }
    if (prev.title === title && prev.leading === leading) return
    const active = document.activeElement
    if (active === null || active === document.body) headingRef.current?.focus()
  }, [title, leading])

  return (
    <div
      className={clsx(
        'flex max-h-[calc(100dvh-var(--spacing-header-height))] w-full flex-col gap-5 rounded-t-2xl bg-surface px-5 pt-2 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] shadow-elevation-3',
        className,
      )}
    >
      <div aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-neutral-300" />
      <div className="flex shrink-0 items-center gap-2">
        {leading === 'back' && <IconButton size="m" icon="chevron-left" label={backLabel} onClick={onBack} />}
        <h2 ref={headingRef} id={titleId} tabIndex={-1} className="min-w-0 flex-1 text-h3 text-primary outline-hidden">
          {title}
        </h2>
        {action && (
          <Button
            type="ghost"
            size="s"
            label={action.label ?? '수정'}
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action['aria-label']}
          />
        )}
        {close && <IconButton size="m" icon="close" label="닫기" onClick={onClose} />}
      </div>
      {/* 내용이 길면 이 부분만 스크롤된다. 포커스 링이 잘리지 않게 스크롤 영역을 양옆·위아래로 조금 넓혔다. */}
      {children != null && <div className="-mx-5 -my-1 min-h-0 overflow-y-auto px-5 py-1">{children}</div>}
      {cta && <BottomCTA cta={cta} className="shrink-0" />}
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
  const { dialogProps, requestClose } = useModalDialog(open, onClose, 'sheet')

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
