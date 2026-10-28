import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { layout: 'public', path: '/', Component: lazy(() => import('./pages/SplashPage')) },
  { layout: 'public', path: '/__health', Component: lazy(() => import('./pages/HealthPage')) },
]
