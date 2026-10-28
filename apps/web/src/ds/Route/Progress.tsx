import { clsx } from 'clsx'
import { Fragment, type HTMLAttributes, type ReactNode } from 'react'
import { routeLabel, routeLayout, type RouteNode, type RouteProgressPhase, type RouteSegment } from './rules'

// Figma Route/Progress(24:61326) · Phase=Upcoming/Ongoing/Ended + Start · End(TEXT).
// 여정의 위치: 출발(보라) → 지금 노드(보라) → 도착(노을, Ended에서만 채움). 실선 레일 + 날짜 노드 — 점선 아님.
// 영웅 카드(톤) 안에서만 쓴다. 폭은 부모를 채운다(Figma 310 = 카드 350 − 패딩 20×2).
export type RouteProgressProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma Phase */
  phase: RouteProgressPhase
  /** Figma Start: "11.12 (목)" */
  start: ReactNode
  /** Figma End: "11.15 (일)" */
  end: ReactNode
  /** 날 수(노드 수). Figma는 4 고정 */
  days?: number
  /** 진행 중일 때 오늘이 몇째 날인지(1부터). Figma는 2 고정 */
  current?: number
  children?: never
}

// 14×14 노드. 링은 r5 · 선 2, 점은 r4, 지금·도착 채움은 r7(지금은 가운데 흰 점 r3).
function Node({ kind }: { kind: RouteNode }) {
  return (
    <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden focusable="false" className="shrink-0">
      {kind === 'start' && <circle cx="7" cy="7" r="5" strokeWidth="2" className="fill-bg-surface stroke-primary-300" />}
      {kind === 'end' && <circle cx="7" cy="7" r="5" strokeWidth="2" className="fill-bg-surface stroke-sunset-300" />}
      {kind === 'passed' && <circle cx="7" cy="7" r="4" className="fill-primary-300" />}
      {kind === 'future' && <circle cx="7" cy="7" r="4" className="fill-neutral-300" />}
      {kind === 'now' && (
        <>
          <circle cx="7" cy="7" r="7" className="fill-primary-500" />
          <circle cx="7" cy="7" r="3" className="fill-bg-surface" />
        </>
      )}
      {kind === 'arrived' && <circle cx="7" cy="7" r="7" className="fill-brand-accent" />}
    </svg>
  )
}

const SEGMENT = {
  idle: 'bg-border-default',
  walked: 'bg-primary-300',
  done: 'bg-primary-200',
} satisfies Record<RouteSegment, string>

export function RouteProgress({ phase, start, end, days, current, className, ...rest }: RouteProgressProps) {
  const { nodes, segments } = routeLayout(phase, days, current)
  return (
    <div className={clsx('flex w-full flex-col gap-2', className)} {...rest}>
      <div role="img" aria-label={routeLabel(phase, days, current)} className="flex h-3.5 items-center">
        {nodes.map((kind, i) => (
          <Fragment key={i}>
            <Node kind={kind} />
            {i < segments.length && <span className={clsx('h-0.5 min-w-0 flex-1', SEGMENT[segments[i]])} />}
          </Fragment>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-caption whitespace-nowrap text-secondary">
        <span>{start}</span>
        <span>{end}</span>
      </div>
    </div>
  )
}
