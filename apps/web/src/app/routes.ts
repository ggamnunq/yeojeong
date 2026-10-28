import type { RouteObject } from 'react-router'

/**
 * 라우트가 들어갈 자리(가드·레이아웃).
 * - public: 가드 없음(공개 문서, 스플래시, 재동의)
 * - guest: 로그인 안 한 사람만(/login). 로그인 상태면 / 로 보낸다
 * - signup: 가입 티켓만 있는 사람(SIGNUP_REQUIRED)
 * - auth: 로그인 필수
 * - trip: 로그인 + 여정 활성 멤버 + 앱 셸(헤더·하단 탭)
 * - trip-page: 로그인 + 여정 활성 멤버, 셸 없음(Back 헤더 서브페이지)
 */
export type AppLayout = 'public' | 'guest' | 'signup' | 'auth' | 'trip' | 'trip-page'

/** features/<flow>/routes.tsx가 내보내는 라우트. path는 / 로 시작하는 전체 경로 */
export type AppRoute = RouteObject & { layout: AppLayout; path: string }

export type RouteModule = { routes: AppRoute[] }

export const TRIP_BASE = '/trips/:tripId'

export const LAYOUTS: readonly AppLayout[] = ['public', 'guest', 'signup', 'auth', 'trip', 'trip-page']

/** glob 결과를 파일 이름 순으로 펼친다 */
export function collectRoutes(modules: Record<string, RouteModule>): AppRoute[] {
  return Object.keys(modules)
    .sort()
    .flatMap((file) => modules[file].routes)
}

function fullPaths(route: RouteObject, parent = ''): string[] {
  const own = route.path ? (route.path.startsWith('/') ? route.path : `${parent}/${route.path}`) : parent
  return [...(route.index || route.path ? [own] : []), ...(route.children ?? []).flatMap((c) => fullPaths(c, own))]
}

/** 경로 규칙 위반 목록. 비어 있어야 한다(router.test) */
export function validateRoutes(routes: AppRoute[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, number>()
  for (const route of routes) {
    if (!LAYOUTS.includes(route.layout)) problems.push(`${route.path}: 모르는 layout ${String(route.layout)}`)
    if (!route.path.startsWith('/')) problems.push(`${route.path}: / 로 시작해야 한다`)
    const isTrip = route.layout === 'trip' || route.layout === 'trip-page'
    if (isTrip !== route.path.startsWith(`${TRIP_BASE}/`)) {
      problems.push(`${route.path}: ${TRIP_BASE}/ 아래 경로는 trip·trip-page layout이어야 한다`)
    }
    for (const path of fullPaths(route)) seen.set(path, (seen.get(path) ?? 0) + 1)
  }
  for (const [path, count] of seen) if (count > 1) problems.push(`${path}: ${count}번 정의됨`)
  return problems
}

/** layout 필드를 떼고 react-router RouteObject로 */
export function toRouteObject({ layout: _layout, ...route }: AppRoute): RouteObject {
  return route as RouteObject
}
