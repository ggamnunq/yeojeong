import type { MouseEventHandler, ReactNode } from 'react'
import { IconButton } from '../IconButton/IconButton'
import { ProgressSteps, type ProgressStepsStep } from '../Progress/Steps'
import { Screen, type ScreenCta } from '../Screen/Screen'

// Figma Shell/Onboarding(24:61264) · Time(TEXT) · Back · Progress · CTA(BOOLEAN) · Content(INSTANCE_SWAP). 인증 03~08 셸.
// 위 56: 왼쪽 뒤로(IconButton Ghost M, 왼쪽 4) + 가운데 Progress/Steps(100 × 4) → 내용(첫 블록 위 24, 좌우 거터 20) → 하단 CTA(350 × 56).
// 로그인(HF-02)은 back={false} · progress 없음 · cta 없음. 스플래시는 셸 없이 그린다. 상태바·홈 인디케이터는 그리지 않는다.
export type ShellOnboardingProps = {
  /** Figma Back: 왼쪽 뒤로 가기. 기본 true */
  back?: boolean
  onBack?: MouseEventHandler<HTMLButtonElement>
  /** Figma Progress + 중첩 Progress/Steps의 Step. 단계를 주면 켜진다 */
  progress?: ProgressStepsStep
  /** Figma CTA: 하단 Button Primary L. 객체를 주면 켜진다 */
  cta?: ScreenCta
  /** 내용 좌우 거터 20. 기본 true */
  gutter?: boolean
  /** Figma Content 슬롯(390 × 622) */
  children?: ReactNode
  className?: string
}

export function ShellOnboarding({ back = true, onBack, progress, cta, gutter, children, className }: ShellOnboardingProps) {
  // 뒤로·단계가 모두 없으면(로그인) 빈 56 자리만 남기고 랜드마크는 만들지 않는다
  const Bar = back || progress ? 'header' : 'div'
  return (
    <Screen
      background="surface"
      header={
        <Bar className="relative flex h-header-height items-center bg-surface pr-2 pl-1">
          {back && <IconButton size="m" icon="chevron-left" label="뒤로 가기" onClick={onBack} />}
          {progress && <ProgressSteps step={progress} className="absolute top-1/2 left-1/2 -translate-1/2" />}
        </Bar>
      }
      cta={cta}
      gutter={gutter}
      contentClassName="pt-6"
      className={className}
    >
      {children}
    </Screen>
  )
}
