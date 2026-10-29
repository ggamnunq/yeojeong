import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { IllustLinking, ShellSub, type IllustLinkingPhase, type ScreenCtaValue } from '../../ds'
import { focusRing, touchTarget } from '../../ds/styles'
import { COPY } from './copy'
import type { ErrorScreenKind } from './rules'

/** 조용한 텍스트 버튼(Caption, text/tertiary, 가운데): "직접 추가할게요" · "카드 내역 불러오기"(HF-49b) */
export function QuietButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'mx-auto rounded-sm px-2 py-1 text-caption text-tertiary select-none active:text-secondary',
        touchTarget,
        focusRing,
        className,
      )}
    >
      {children}
    </button>
  )
}

/** 가운데 일러스트 + 제목 + 보조 줄(HF-55 · 57 · 57r · 57d) */
export function CenterStatus({
  phase,
  title,
  sub,
  live,
}: {
  phase: IllustLinkingPhase
  title: ReactNode
  sub?: ReactNode
  /** aria-live="polite"(HF-55 불러오는 중) */
  live?: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center" aria-live={live ? 'polite' : undefined}>
      <IllustLinking phase={phase} width={240} className={clsx(live && 'motion-safe:animate-pulse')} />
      <h2 className="mt-8 text-h2 text-primary">{title}</h2>
      {sub && <p className="mt-1.5 text-body-s text-secondary">{sub}</p>}
    </div>
  )
}

/**
 * 오류·한도 화면(WF-57 · 57a · 57r · 57d). 57·57a·57r ‹ = WF-53, 57d ‹ = WF-49.
 * 문구는 우리 코드 매핑만(카드사·CODEF 원문을 보이지 않는다)
 */
export function ImportErrorScreen({
  kind,
  title,
  orgName,
  retryAt,
  onBack,
  onManual,
  onRetry,
}: {
  kind: ErrorScreenKind
  /** 헤더 제목: 카드사 이름, WF-49에서 바로 온 57d는 "카드 내역 불러오기" */
  title: string
  orgName: string
  /** 57r: KST "HH:mm" */
  retryAt?: string
  onBack: () => void
  onManual: () => void
  onRetry?: () => void
}) {
  const heading =
    kind === 'unavailable'
      ? COPY.unavailable(orgName)
      : kind === 'action'
        ? COPY.actionRequired(orgName)
        : kind === 'rate'
          ? COPY.rateLimited
          : COPY.daily
  const cta: ScreenCtaValue =
    kind === 'unavailable' && onRetry
      ? {
          layout: 'horizontal',
          secondary: { label: COPY.manualShort, onClick: onManual },
          primary: { label: COPY.retry, onClick: onRetry },
        }
      : { label: COPY.manualShort, onClick: onManual }
  return (
    <ShellSub header={{ title, onBack }} cta={cta}>
      <CenterStatus phase="before" title={heading} sub={kind === 'rate' && retryAt ? COPY.rateLimitedAt(retryAt) : undefined} />
    </ShellSub>
  )
}
