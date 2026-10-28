import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { IconButton, ProgressSteps, Screen, type ProgressStepsStep, type ScreenCta } from '../../../ds'
import { focusRing } from '../../../ds/styles'

// Shell/Onboarding + 오른쪽 건너뛰기 텍스트 버튼(HF-05 "나중에", Figma 24:58204 — v1.4 승격 후보 #1 `Skip` TEXT).
// DS ShellOnboarding에 아직 skip 자리가 없어 같은 틀(Screen + 56 헤더 + 가운데 Progress/Steps)로 조립한다. skip이 없으면 ShellOnboarding을 쓴다.
export type OnboardingShellProps = {
  onBack: () => void
  progress: ProgressStepsStep
  skip: { label: string; onClick: () => void; disabled?: boolean }
  cta?: ScreenCta
  children?: ReactNode
}

export function OnboardingShell({ onBack, progress, skip, cta, children }: OnboardingShellProps) {
  return (
    <Screen
      background="surface"
      header={
        <header className="relative flex h-header-height items-center bg-surface pr-2 pl-1">
          <IconButton size="m" icon="chevron-left" label="뒤로 가기" onClick={onBack} />
          <ProgressSteps step={progress} className="absolute top-1/2 left-1/2 -translate-1/2" />
          <button
            type="button"
            onClick={skip.onClick}
            disabled={skip.disabled}
            className={clsx(
              'ml-auto inline-flex h-10 items-center rounded-full px-2.5 text-body-m-strong text-tertiary enabled:active:bg-pressed disabled:text-disabled',
              focusRing,
            )}
          >
            {skip.label}
          </button>
        </header>
      }
      cta={cta}
      contentClassName="pt-6"
    >
      {children}
    </Screen>
  )
}
