import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// TODO(현황 플로우): WF-22
export const routes: AppRoute[] = [
  { layout: 'trip', path: '/trips/:tripId/stats', element: <PlaceholderPage inShell title="현황" /> },
]
