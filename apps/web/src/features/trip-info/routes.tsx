import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// TODO(여정 정보 플로우): 시작 전(WF-16)·진행 중·종료 후(WF-23) 여정 정보 탭
export const routes: AppRoute[] = [
  { layout: 'trip', path: '/trips/:tripId/info', element: <PlaceholderPage inShell title="여정 정보" /> },
]
