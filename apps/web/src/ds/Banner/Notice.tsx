import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Banner/Notice(131:15944, 06 로컬 · HF-60·60b) — 공지 한 줄. 면 bg/subtle · r16 · 테두리·그림자 없음, 높이 44.
// 속성: Label(Body/S Strong 한 줄, 넘치면 말줄임) · Chevron(문서 열기) · Close(✕, 32 상자 + 16 아이콘).
// 누르면(라벨·› 영역) onClick, ✕는 onClose. DS Callout은 닫기가 없고 Tone이 상태 의미라 따로 둔다.
// 화면 상단(헤더 아래) 거터 안, 가로로 꽉 찬다.
export type BannerNoticeProps = {
  /** Figma Label */
  label: ReactNode
  /** 라벨·› 영역을 누를 때(문서 열기). 없으면 글자만 */
  onClick?: () => void
  /** Figma Chevron. 기본 true(onClick이 없으면 그리지 않는다) */
  chevron?: boolean
  /** ✕를 누를 때. 없으면 Close를 그리지 않는다 */
  onClose?: () => void
  /** ✕의 스크린리더 이름. 기본 "공지 닫기" */
  closeLabel?: string
  className?: string
}

export function BannerNotice({ label, onClick, chevron = true, onClose, closeLabel = '공지 닫기', className }: BannerNoticeProps) {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate text-body-s-strong text-primary">{label}</span>
      {chevron && onClick && <Icon name="chevron-right" size={16} className="shrink-0 text-icon-default" />}
    </>
  )
  return (
    <div
      data-banner-notice=""
      className={clsx('flex h-11 w-full items-center rounded-lg bg-subtle py-1.5 pr-1.5', !onClick && 'pl-4', className)}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={clsx(
            'flex h-full min-w-0 flex-1 items-center gap-0.5 rounded-lg pl-4 text-left transition-[filter] select-none active:brightness-95',
            focusRing,
          )}
        >
          {content}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-0.5">{content}</span>
      )}
      {onClose && (
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className={clsx(
            'ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-icon-default active:bg-pressed',
            touchTarget,
            focusRing,
          )}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  )
}
