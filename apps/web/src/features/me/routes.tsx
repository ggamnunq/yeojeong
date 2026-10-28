import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// TODO(마이페이지 플로우): WF-30
export const routes: AppRoute[] = [{ layout: 'auth', path: '/me', element: <PlaceholderPage title="마이페이지" /> }]
