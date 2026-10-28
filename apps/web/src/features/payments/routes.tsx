import { lazy } from 'react'
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
  { layout: 'trip-page', path: '/trips/:tripId/payments/out-of-period', Component: lazy(() => import('./pages/OutOfPeriodPage')) },
]
