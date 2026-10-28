import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

// 여정 정보 탭: 시작 전(HF-16·17) · 진행 중(HF-23·24) · 종료 후(읽기 전용)
export const routes: AppRoute[] = [
  { layout: 'trip', path: '/trips/:tripId/info', Component: lazy(() => import('./pages/TripInfoPage')) },
]
