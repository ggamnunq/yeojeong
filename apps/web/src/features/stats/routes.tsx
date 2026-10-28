import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

// WF-22 / HF-22 현황. 시작 전 잠금 · 종료 후 정산 전환은 셸(tripTabs)이 처리한다
export const routes: AppRoute[] = [
  { layout: 'trip', path: '/trips/:tripId/stats', Component: lazy(() => import('./pages/StatsPage')) },
]
