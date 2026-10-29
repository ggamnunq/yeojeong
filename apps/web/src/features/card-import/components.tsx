import { clsx } from 'clsx'
import type { CardImportOrganization } from '@yeojeong/shared'
import { useEffect, useState, type ReactNode } from 'react'
import { IllustLinking, Screen, ShellSub, TopHeader, type IllustLinkingPhase, type ScreenCtaValue } from '../../ds'
import { focusRing, touchTarget } from '../../ds/styles'
import { COPY } from './copy'
import { issuerHomepage, issuerInitial, issuerLogo } from './issuers'
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

/** 가운데 일러스트 + 제목 + 보조 줄(HF-55 · 57 · 57r · 57d · 66b · 66c · 67). 자연 줄바꿈 + 낱말 단위(keep-all) */
export function CenterStatus({
  phase,
  title,
  sub,
  live,
  children,
}: {
  phase: IllustLinkingPhase
  title: ReactNode
  sub?: ReactNode
  /** aria-live="polite"(HF-55 불러오는 중) */
  live?: boolean
  /** 보조 줄 아래(HF-57h 홈페이지 링크) */
  children?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center" aria-live={live ? 'polite' : undefined}>
      <IllustLinking phase={phase} width={240} className={clsx(live && 'motion-safe:animate-pulse')} />
      <h2 className="mt-8 text-h2 break-keep text-primary">{title}</h2>
      {sub && <p className="mt-1.5 text-body-s break-keep text-secondary">{sub}</p>}
      {children}
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

/**
 * Tile/Issuer(06 로컬 156:17029): 40 흰 원(bg/surface) + 1px 연회색 테두리(border/default) + 로고 원색(여백 6 → 28 박스).
 * 로고가 없는 카드사는 같은 원 안에 이니셜(Body/S · text/secondary). 꾸밈이라 스크린리더에서 숨긴다(이름이 옆에 있다)
 */
export function IssuerTile({ org, className }: { org: Pick<CardImportOrganization, 'code' | 'name'>; className?: string }) {
  const logo = issuerLogo(org.code)
  return (
    <span
      aria-hidden
      data-issuer-tile={org.code}
      className={clsx('flex size-10 shrink-0 items-center justify-center rounded-full border border-default bg-surface', className)}
    >
      {logo ? (
        <img src={logo} alt="" width={28} height={28} draggable={false} className="size-7 object-contain" />
      ) : (
        <span className="text-body-s text-secondary">{issuerInitial(org)}</span>
      )}
    </span>
  )
}

/** "{카드사} 홈페이지 ›" — 새 탭(opener·referrer 없음). 목록에 없는 코드면 아무것도 그리지 않는다 */
export function IssuerHomepageLink({ org, className }: { org: Pick<CardImportOrganization, 'code' | 'name'>; className?: string }) {
  const href = issuerHomepage(org.code)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clsx('rounded-sm text-body-s-strong text-secondary active:opacity-70', focusRing, className)}>
      {org.name} 홈페이지 ›
    </a>
  )
}

/** 보이는 영역(visualViewport) — 키보드가 올라오면 높이가 줄고, iOS는 위로 밀린 만큼 offsetTop이 생긴다. 없으면 null(전체 화면) */
function useVisibleViewport() {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setBox({ height: vv.height, top: vv.offsetTop })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return box
}

/**
 * WF-53 계열 셸(화면명세 L-0 셸 v0.7.6 · Figma HF-53h "scroll (CTA 고정, 이 영역만 스크롤)"): Shell/Sub와 같은 겉모습이지만
 * 화면이 보이는 영역(visualViewport)에 딱 맞고 폼(안내 블록~기간 행)만 스크롤한다. 키보드가 올라오면 보이는 영역이 줄어
 * CTA가 키보드 바로 위에 남는다(iOS·Android 기본 resizes-visual 모두). 헤더 ‹ + 제목(H3)
 */
export function ScrollFormShell({ title, onBack, cta, children }: { title: string; onBack: () => void; cta: ScreenCtaValue; children: ReactNode }) {
  const box = useVisibleViewport()
  return (
    <div className="fixed inset-x-0 top-0 h-dvh" style={box ? { top: box.top, height: box.height } : undefined} data-scroll-form-shell="">
      <Screen
        background="surface"
        header={<TopHeader type="back" title={title} onBack={onBack} divider={false} />}
        cta={cta}
        className="h-full [--screen-min-height:0px]"
        contentClassName="min-h-0 overflow-y-auto overscroll-contain pt-4"
      >
        {children}
      </Screen>
    </div>
  )
}

/** 제목 두 줄(Figma 줄바꿈 그대로). 접근성 이름은 한 문장으로 읽히게 줄 끝에 띄어쓰기를 둔다 */
export function TwoLines({ lines }: { lines: readonly [string, string] }) {
  return (
    <>
      {lines[0]} <br />
      {lines[1]}
    </>
  )
}

/**
 * HF-57h(현대·하나 2회 실패 차단 — Figma 170:18638, HF-57 레이아웃): 헤더 "{카드사}" · 제목 두 줄 · 보조 줄 · 홈페이지 링크 ·
 * 가로 2버튼 "직접 추가"(Secondary → 수동 추가 시트) · "확인했어요"(Primary → POST /card-import/lockout/ack). ‹ = HF-53h
 */
export function LockedScreen({
  org,
  acking,
  ackDisabled,
  onBack,
  onManual,
  onAck,
}: {
  org: CardImportOrganization
  acking: boolean
  /** 하루 확인 한도(429 CARD_LOCKOUT_ACK_DAILY_LIMIT) — 직접 추가만 */
  ackDisabled: boolean
  onBack: () => void
  onManual: () => void
  onAck: () => void
}) {
  return (
    <ShellSub
      header={{ title: org.name, onBack }}
      cta={{
        layout: 'horizontal',
        secondary: { label: COPY.manualShort, onClick: onManual },
        primary: { label: COPY.lockedAck, onClick: onAck, state: acking ? 'loading' : ackDisabled ? 'disabled' : 'default' },
      }}
    >
      <CenterStatus phase="before" title={<TwoLines lines={COPY.lockedTitle(org.name)} />} sub={COPY.lockedSub}>
        <IssuerHomepageLink org={org} className="mt-4 py-1" />
      </CenterStatus>
    </ShellSub>
  )
}
