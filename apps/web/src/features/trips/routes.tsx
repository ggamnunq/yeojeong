import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { layout: 'auth', path: '/trips', Component: lazy(() => import('./pages/NoTripPage')) },
  { layout: 'auth', path: '/trips/new', Component: lazy(() => import('./pages/NewTripPage')) },
  { layout: 'auth', path: '/join', Component: lazy(() => import('./pages/JoinPage')) },
  { layout: 'trip-page', path: '/trips/:tripId/edit', Component: lazy(() => import('./pages/EditTripPage')) },
  { layout: 'trip-page', path: '/trips/:tripId/created', Component: lazy(() => import('./pages/CreatedPage')) },
]
