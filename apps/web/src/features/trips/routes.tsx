import { lazy } from 'react'
import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { layout: 'auth', path: '/trips', Component: lazy(() => import('./pages/NoTripPage')) },
  { layout: 'auth', path: '/trips/new', element: <PlaceholderPage title="새 여정" /> },
  { layout: 'auth', path: '/join', element: <PlaceholderPage title="초대코드로 참여" /> },
  { layout: 'trip-page', path: '/trips/:tripId/edit', element: <PlaceholderPage title="여정 수정" /> },
  { layout: 'trip-page', path: '/trips/:tripId/created', element: <PlaceholderPage title="여정을 만들었어요" /> },
]
