import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ layout: 'auth', path: '/me', Component: lazy(() => import('./pages/MePage')) }]
