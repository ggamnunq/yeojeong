import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

// Figma Progress/Steps(24:61316) · Step=1/2/3/4. 온보딩 4단계 진행 막대(100×4) — 이어진 막대 하나(끊긴 막대는 점선처럼 보여 쓰지 않는다).
// 트랙 bg/muted, 채움 bg/brand(25px × 단계). Shell/Onboarding의 Progress 자리에 들어간다.
export type ProgressStepsStep = 1 | 2 | 3 | 4

export type ProgressStepsProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> & {
  /** Figma Step */
  step: ProgressStepsStep
  children?: never
}

const TOTAL = 4

const FILL = { 1: 'w-1/4', 2: 'w-1/2', 3: 'w-3/4', 4: 'w-full' } satisfies Record<ProgressStepsStep, string>

export function ProgressSteps({ step, className, 'aria-label': ariaLabel = '진행 단계', ...rest }: ProgressStepsProps) {
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={1}
      aria-valuemax={TOTAL}
      aria-valuenow={step}
      aria-valuetext={`${TOTAL}단계 중 ${step}단계`}
      className={clsx('h-1 w-25 shrink-0 overflow-hidden rounded-full bg-muted', className)}
      {...rest}
    >
      <div className={clsx('h-full rounded-full bg-brand', FILL[step])} />
    </div>
  )
}
