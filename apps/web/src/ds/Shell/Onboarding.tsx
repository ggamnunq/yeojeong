import { clsx } from 'clsx'
import type { MouseEventHandler, ReactNode } from 'react'
import { IconButton } from '../IconButton/IconButton'
import { ProgressSteps, type ProgressStepsStep, type ProgressStepsTotal } from '../Progress/Steps'
import { Screen, type ScreenCtaValue } from '../Screen/Screen'
import { focusRing, touchTarget } from '../styles'

// Figma Shell/Onboarding(세트 58:10474 · Back 24:61264 · Close 58:10455, v1.6) · Leading=Back/Close
// · Time(TEXT) · Back · Progress · CTA · Content + Skip · Skip label(v1.5). 인증 03~08 셸.
// Leading=Close = 왼쪽 ✕(흐름을 끝내고 나감 — 외부 인증 대기 HF-06). Back 속성은 Leading 버튼을 보일지다.
// 위 56: 왼쪽 뒤로(IconButton Ghost M, 왼쪽 4) + 가운데 Progress/Steps(100 × 4) → 내용(첫 블록 위 24, 좌우 거터 20) → 하단 CTA(350 × 56).
// 로그인(HF-02)은 back={false} · progress 없음 · cta 없음. 스플래시는 셸 없이 그린다. 상태바·홈 인디케이터는 그리지 않는다.
export type ShellOnboardingLeading = 'back' | 'close'

export type ShellOnboardingProps = {
  /** Figma Leading: back = ‹ 뒤로 가기(기본), close = ✕ 닫기(HF-06) */
  leading?: ShellOnboardingLeading
  /** Figma Back: 왼쪽 Leading 버튼(‹ 또는 ✕)을 보일지. 기본 true */
  back?: boolean
  /** ‹ 누름(leading="back") */
  onBack?: MouseEventHandler<HTMLButtonElement>
  /** ✕ 누름(leading="close"). 없으면 onBack을 부른다 */
  onClose?: MouseEventHandler<HTMLButtonElement>
  /** Figma Progress + 중첩 Progress/Steps의 Step. 단계를 주면 켜진다 */
  progress?: ProgressStepsStep
  /** Progress/Steps 전체 단계 수(DS18). 기본 4, 토스 연결을 숨긴 가입(accountLink=false)은 2 */
  progressTotal?: ProgressStepsTotal
  /** Figma CTA: 하단 BottomCTA(Primary L, state로 Loading). 객체를 주면 켜진다 */
  cta?: ScreenCtaValue
  /** Figma Skip: 헤더 오른쪽 텍스트 버튼. 기본 false */
  skip?: boolean
  /** Figma Skip label. 기본 "건너뛰기"(화면에서는 "나중에" 등으로 교체) */
  skipLabel?: ReactNode
  onSkip?: MouseEventHandler<HTMLButtonElement>
  skipDisabled?: boolean
  /** 내용 좌우 거터 20. 기본 true */
  gutter?: boolean
  /** Figma Content 슬롯(390 × 622) */
  children?: ReactNode
  className?: string
}

export function ShellOnboarding({
  leading = 'back',
  back = true,
  onBack,
  onClose,
  progress,
  progressTotal,
  cta,
  skip = false,
  skipLabel = '건너뛰기',
  onSkip,
  skipDisabled = false,
  gutter,
  children,
  className,
}: ShellOnboardingProps) {
  // 뒤로·단계·건너뛰기가 모두 없으면(로그인) 빈 56 자리만 남기고 랜드마크는 만들지 않는다
  const Bar = back || progress || skip ? 'header' : 'div'
  return (
    <Screen
      background="surface"
      header={
        <Bar className="relative flex h-header-height items-center bg-surface pr-2 pl-1">
          {back &&
            (leading === 'close' ? (
              <IconButton size="m" icon="close" label="닫기" onClick={onClose ?? onBack} />
            ) : (
              <IconButton size="m" icon="chevron-left" label="뒤로 가기" onClick={onBack} />
            ))}
          {progress && <ProgressSteps step={progress} total={progressTotal} className="absolute top-1/2 left-1/2 -translate-1/2" />}
          {skip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={skipDisabled}
              className={clsx(
                'ml-auto inline-flex rounded-full px-2.5 text-body-m-strong text-tertiary enabled:active:bg-pressed disabled:text-disabled',
                focusRing,
                touchTarget,
              )}
            >
              {skipLabel}
            </button>
          )}
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
