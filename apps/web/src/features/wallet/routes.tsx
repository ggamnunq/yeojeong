import { lazy } from 'react'
import { accountLinkOnly } from '../../app/features'
import { paths } from '../../app/paths'
import type { AppRoute } from '../../app/routes'

// 토스 인증·선택·완료는 연결 기능이 켜져 있을 때만(FR-006). 꺼져 있으면 지갑(HF-49)으로
const connect = (page: Parameters<typeof accountLinkOnly>[0]) => accountLinkOnly(page, () => paths.wallet())

// WF-06~08은 가입·추가·재연결 공용(?attempt=…&returnTo=…, connect.ts)
export const routes: AppRoute[] = [
  { layout: 'auth', path: '/wallet', Component: lazy(() => import('./pages/WalletPage')) },
  { layout: 'auth', path: '/wallet/connect/toss', Component: connect(lazy(() => import('./pages/TossAuthPage'))) },
  { layout: 'auth', path: '/wallet/connect/select', Component: connect(lazy(() => import('./pages/SelectMethodsPage'))) },
  { layout: 'auth', path: '/wallet/connect/done', Component: connect(lazy(() => import('./pages/ConnectDonePage'))) },
  { layout: 'trip-page', path: '/trips/:tripId/fx', Component: lazy(() => import('./pages/FxPage')) },
]
