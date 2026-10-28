// Route/Progress의 순수 로직: 단계(phase) → 날짜 노드·구간 모양. 컴포넌트와 나눠 테스트한다.
export type RouteProgressPhase = 'upcoming' | 'ongoing' | 'ended'

/**
 * 노드 모양(Figma Route/Progress의 day 레이어)
 * - start: 출발 빈 링(보라 300) · passed: 지난 날 점(보라 300) · now: 지금(보라 500 + 흰 점)
 * - future: 아직 안 온 날 점(회색) · end: 도착 빈 링(노을 300) · arrived: 도착 채움(노을 500, Ended에서만)
 */
export type RouteNode = 'start' | 'passed' | 'now' | 'future' | 'end' | 'arrived'
/** 구간 색: idle = border/default · walked = 보라 300(진행 중 지난 길) · done = 보라 200(도착 후) */
export type RouteSegment = 'idle' | 'walked' | 'done'

/** Figma 세트는 4일(3박 4일) · 진행 중 Day 2로 고정이다. 코드에서는 날 수와 오늘을 받는다. */
export const ROUTE_DEFAULT_DAYS = 4
export const ROUTE_DEFAULT_CURRENT = 2

export function routeLayout(phase: RouteProgressPhase, days = ROUTE_DEFAULT_DAYS, current = ROUTE_DEFAULT_CURRENT) {
  const n = Math.max(2, Math.trunc(days))
  const today = Math.min(n, Math.max(1, Math.trunc(current)))
  const nodes: RouteNode[] = []
  const segments: RouteSegment[] = []

  for (let day = 1; day <= n; day++) {
    const last = day === n
    if (phase === 'ended') nodes.push(last ? 'arrived' : 'passed')
    else if (phase === 'upcoming') nodes.push(day === 1 ? 'start' : last ? 'end' : 'future')
    else if (day === today) nodes.push('now')
    else if (day < today) nodes.push('passed')
    else nodes.push(last ? 'end' : 'future')
  }
  for (let day = 1; day < n; day++) {
    segments.push(phase === 'ended' ? 'done' : phase === 'ongoing' && day < today ? 'walked' : 'idle')
  }
  return { nodes, segments, days: n, current: today }
}

/** 레일의 접근성 이름. 날짜는 옆에 글자로 보이니 단계만 말한다. */
export function routeLabel(phase: RouteProgressPhase, days = ROUTE_DEFAULT_DAYS, current = ROUTE_DEFAULT_CURRENT) {
  const { days: n, current: today } = routeLayout(phase, days, current)
  if (phase === 'upcoming') return '출발 전'
  if (phase === 'ended') return '도착'
  return `${n}일 중 ${today}일차`
}
