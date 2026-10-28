import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from './AppShell'
import { RootLayout, type RouteHandle } from './RootLayout'
import { collectRoutes, toRouteObject, TRIP_BASE, type AppLayout, type AppRoute, type RouteModule } from './routes'
import { RequireAuth, RequireGuest, RequireSignup } from './session'
import { NotFoundScreen, RouteErrorScreen } from './states'
import { RequireTrip, TripIndexRedirect } from './trip'

// 플로우별 라우트는 features/<flow>/routes.tsx의 `routes`를 모은다. 이 파일은 고치지 않는다.
const modules = import.meta.glob<RouteModule>('../features/*/routes.tsx', { eager: true })

export const featureRoutes: AppRoute[] = collectRoutes(modules)

/** 레이아웃별로 나눠 가드 아래에 붙인 전체 라우트 트리 */
export function buildRoutes(routes: AppRoute[] = featureRoutes): RouteObject[] {
  const at = (layout: AppLayout) => routes.filter((r) => r.layout === layout).map(toRouteObject)

  return [
    {
      id: 'root',
      Component: RootLayout,
      ErrorBoundary: RouteErrorScreen,
      children: [
        {
          ErrorBoundary: RouteErrorScreen,
          children: [
            ...at('public'),
            { Component: RequireGuest, children: at('guest') },
            { Component: RequireSignup, children: at('signup') },
            {
              Component: RequireAuth,
              children: [
                ...at('auth'),
                {
                  path: TRIP_BASE,
                  Component: RequireTrip,
                  children: [
                    { index: true, Component: TripIndexRedirect },
                    { Component: AppShell, handle: { nav: true } satisfies RouteHandle, children: at('trip') },
                    ...at('trip-page'),
                  ],
                },
              ],
            },
            { path: '*', Component: NotFoundScreen },
          ],
        },
      ],
    },
  ]
}

export function createAppRouter() {
  return createBrowserRouter(buildRoutes())
}
