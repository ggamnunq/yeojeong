import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

// WF-06~08은 가입·추가·재연결 공용(?attempt=…&returnTo=…, connect.ts)
export const routes: AppRoute[] = [
  { layout: 'auth', path: '/wallet', Component: lazy(() => import('./pages/WalletPage')) },
  { layout: 'auth', path: '/wallet/connect/toss', Component: lazy(() => import('./pages/TossAuthPage')) },
  { layout: 'auth', path: '/wallet/connect/select', Component: lazy(() => import('./pages/SelectMethodsPage')) },
  { layout: 'auth', path: '/wallet/connect/done', Component: lazy(() => import('./pages/ConnectDonePage')) },
  { layout: 'trip-page', path: '/trips/:tripId/fx', Component: lazy(() => import('./pages/FxPage')) },
]
