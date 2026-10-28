import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// TODO(정산 플로우): WF-25·26·44
export const routes: AppRoute[] = [
  { layout: 'trip', path: '/trips/:tripId/settlement', element: <PlaceholderPage inShell title="정산" /> },
  { layout: 'trip-page', path: '/trips/:tripId/settlement/:membershipId', element: <PlaceholderPage title="멤버별 결제 내역" /> },
]
