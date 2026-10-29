import { lazy } from 'react'
import { accountLinkOnly } from '../../app/features'
import { paths } from '../../app/paths'
import type { AppRoute } from '../../app/routes'
import PaymentsRoute from './pages/PaymentsRoute'

// 결제 상세는 목록 위 바텀시트라 목록의 하위 라우트다(목록 페이지가 <Outlet />을 그린다).
export const routes: AppRoute[] = [
  {
    layout: 'trip',
    path: '/trips/:tripId/payments',
    Component: PaymentsRoute,
    children: [{ path: '/trips/:tripId/payments/:expenseId', Component: lazy(() => import('./pages/PaymentSheet')) }],
  },
  // 기간 외 결제 후보는 토스 연결 기능이 켜져 있을 때만(FR-006). 꺼져 있으면 결제내역으로
  {
    layout: 'trip-page',
    path: '/trips/:tripId/payments/out-of-period',
    Component: accountLinkOnly(
      lazy(() => import('./pages/OutOfPeriodPage')),
      ({ tripId = '' }) => paths.payments(tripId),
    ),
  },
]
