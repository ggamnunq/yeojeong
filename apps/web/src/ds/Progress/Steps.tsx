import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

// Figma Progress/Steps(24:61316) · Total=4/3/2(v1.6.3) × Step. 온보딩 진행 막대(100×4) — 이어진 막대 하나(끊긴 막대는 점선처럼 보여 쓰지 않는다).
// 트랙 bg/muted, 채움 bg/brand(단계 ÷ 전체). Shell/Onboarding의 Progress 자리에 들어간다.
// v1.6.3(DS18): Total=3 Step 88:13755~59 · Total=2 Step 88:13761·88:13763. 기본 4. 토스 연결을 숨긴 가입(accountLink=false)은 2단계 — 닉네임 1/2(HF-03) · 약관 2/2(HF-04).
export type ProgressStepsStep = 1 | 2 | 3 | 4
/** 전체 단계 수. 기본 4(토스 연결 포함), 가입 2단계는 2 */
export type ProgressStepsTotal = 2 | 3 | 4

export type ProgressStepsProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> & {
  /** Figma Step. total보다 크면 total로 본다 */
  step: ProgressStepsStep
  /** 전체 단계 수(DS18). 기본 4 */
  total?: ProgressStepsTotal
  children?: never
}

// 채움 폭 = step / total. 토큰 밖 임의 폭을 쓰지 않게 분수 유틸로만 고른다.
const FILL: Record<ProgressStepsTotal, Partial<Record<ProgressStepsStep, string>>> = {
  2: { 1: 'w-1/2', 2: 'w-full' },
  3: { 1: 'w-1/3', 2: 'w-2/3', 3: 'w-full' },
  4: { 1: 'w-1/4', 2: 'w-1/2', 3: 'w-3/4', 4: 'w-full' },
}

export function ProgressSteps({ step, total = 4, className, 'aria-label': ariaLabel = '진행 단계', ...rest }: ProgressStepsProps) {
  const now = Math.min(step, total) as ProgressStepsStep
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={now}
      aria-valuetext={`${total}단계 중 ${now}단계`}
      className={clsx('h-1 w-25 shrink-0 overflow-hidden rounded-full bg-muted', className)}
      {...rest}
    >
      <div className={clsx('h-full rounded-full bg-brand', FILL[total][now])} />
    </div>
  )
}
