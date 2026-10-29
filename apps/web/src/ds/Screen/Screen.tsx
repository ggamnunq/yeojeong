import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { BottomCTA, type BottomCTASingle, type BottomCTAValue } from '../BottomCTA/BottomCTA'
import { toastAnchorFor, useRegisterToastAnchor } from '../Toast/anchor'

// spec 7-1 화면 조립 규칙: 390 폭 · bg/canvas · TopHeader(56) → 본문(좌우 거터 20) → BottomNav(64 + 안전영역).
// 하단 CTA는 Button Primary L을 거터 안에서 꽉 채운다. 데스크톱에서는 390 폭 그대로 가운데 정렬.
// 스크롤은 문서 전체가 하고(모바일 주소창 접힘 유지), 헤더·하단 영역은 sticky로 붙인다.
// DS v1.4부터 화면은 Shell/App · Shell/Sub · Shell/Onboarding(ShellApp·ShellSub·ShellOnboarding)으로 만든다(spec 9-3).
// Screen은 셸들이 공통으로 쓰는 레이아웃 틀이고, 셸에 맞지 않는 화면(스플래시·로그인 등)만 직접 쓴다.
/** 하단 CTA 버튼 하나(Layout=Single). DS17부터 state(loading·disabled)·aria-label도 받는다 */
export type ScreenCta = BottomCTASingle
/** 셸 하단 CTA: 버튼 하나(ScreenCta) 또는 가로 2버튼({ layout: 'horizontal', secondary, primary }) */
export type ScreenCtaValue = BottomCTAValue
export type ScreenBackground = 'canvas' | 'surface'

export type ScreenProps = {
  /** TopHeader 자리. 위 안전영역(노치)은 이 영역 바탕(bg/surface)으로 채운다. */
  header?: ReactNode
  /** BottomNav 자리. 아래 안전영역은 BottomNav가 직접 채운다. */
  nav?: ReactNode
  /** 하단 CTA(Button Primary L FILL, 또는 layout="horizontal" 가로 2버튼). 내비가 있으면 그 위에 붙는다. */
  cta?: ScreenCtaValue
  /** 본문 좌우 거터 20. 리스트처럼 행이 화면 끝까지 가야 하면 false. 기본 true */
  gutter?: boolean
  /** 화면 바탕. spec 7-1은 bg/canvas, v1.4 셸은 bg/surface */
  background?: ScreenBackground
  children?: ReactNode
  className?: string
  /** 본문(main)에 붙일 클래스. 셸이 첫 블록 위 여백(App 8 · Sub 16 · Onboarding 24)을 여기로 준다 */
  contentClassName?: string
}

const BACKGROUND = { canvas: 'bg-canvas', surface: 'bg-surface' } satisfies Record<ScreenBackground, string>

export function Screen({
  header,
  nav,
  cta,
  gutter = true,
  background = 'canvas',
  children,
  className,
  contentClassName,
}: ScreenProps) {
  const bg = BACKGROUND[background]
  // 토스트 자리(화면명세 0-4): 내비 위 · CTA 위 · 안전영역 위 16. ToastViewport anchor="auto"가 읽는다
  useRegisterToastAnchor(toastAnchorFor({ nav: nav != null, cta: cta != null }))
  return (
    <div
      className={clsx(
        // 최소 높이는 화면 높이. 카탈로그처럼 틀 안에 넣을 때는 --screen-min-height로 바꾼다.
        'mx-auto flex min-h-[var(--screen-min-height,100dvh)] w-full max-w-screen-width flex-col',
        bg,
        className,
      )}
    >
      {header && <div className="sticky top-0 z-10 bg-surface pt-[env(safe-area-inset-top)]">{header}</div>}
      <main
        className={clsx(
          'flex flex-1 flex-col',
          gutter && 'px-gutter',
          !nav && !cta && 'pb-[env(safe-area-inset-bottom)]',
          contentClassName,
        )}
      >
        {children}
      </main>
      {(cta || nav) && (
        <div className="sticky bottom-0 z-10">
          {cta && (
            <div
              className={clsx(
                'px-gutter pt-3',
                bg,
                nav ? 'pb-3' : 'pb-[calc(--spacing(4)+env(safe-area-inset-bottom))]',
              )}
            >
              <BottomCTA cta={cta} />
            </div>
          )}
          {nav}
        </div>
      )}
    </div>
  )
}
