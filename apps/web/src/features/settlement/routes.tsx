import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

// WF-25·26·44 / HF-25·26·44 정산 요약 · 멤버별 결제 내역(나간 멤버 포함)
export const routes: AppRoute[] = [
  { layout: 'trip', path: '/trips/:tripId/settlement', Component: lazy(() => import('./pages/SettlementPage')) },
  {
    layout: 'trip-page',
    path: '/trips/:tripId/settlement/:membershipId',
    Component: lazy(() => import('./pages/SettlementMemberPage')),
    // HF-26 위 결제 상세 시트(잠금 상세). 닫으면 HF-26 그대로(결제내역 탭으로 가지 않는다)
    children: [
      {
        path: '/trips/:tripId/settlement/:membershipId/payments/:expenseId',
        Component: lazy(() => import('../payments/pages/PaymentSheet')),
      },
    ],
  },
]
