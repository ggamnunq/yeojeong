import { lazy } from 'react'
import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// 결제 상세는 목록 위 바텀시트라 목록의 하위 라우트다(목록 페이지가 <Outlet />을 그린다).
export const routes: AppRoute[] = [
  {
    layout: 'trip',
    path: '/trips/:tripId/payments',
    Component: lazy(() => import('./pages/PaymentsPage')),
    children: [{ path: '/trips/:tripId/payments/:expenseId', element: null }],
  },
  { layout: 'trip-page', path: '/trips/:tripId/payments/out-of-period', element: <PlaceholderPage title="기간 외 결제 추가" /> },
]
