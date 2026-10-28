import { Suspense } from 'react'
import { Outlet, ScrollRestoration, useMatches } from 'react-router'
import { ToastHost } from '../notifications'
import { SessionBridge } from './session'
import { LoadingScreen } from './states'

export type RouteHandle = {
  /** 하단 내비가 있는 레이아웃(AppShell). 토스트를 내비 위로 올린다 */
  nav?: boolean
}

/** 라우터 맨 바깥. 화면이 실패해도 토스트는 남도록 errorElement는 한 단계 아래에 있다 */
export function RootLayout() {
  const matches = useMatches()
  const aboveNav = matches.some((m) => (m.handle as RouteHandle | undefined)?.nav === true)
  return (
    <>
      <SessionBridge />
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
      <ToastHost aboveNav={aboveNav} />
      <ScrollRestoration />
    </>
  )
}
