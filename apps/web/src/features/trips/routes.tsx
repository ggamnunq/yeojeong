import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// TODO(여정 생성·참여 플로우): 자리 화면을 lazy 페이지로 바꾼다
export const routes: AppRoute[] = [
  { layout: 'auth', path: '/trips', element: <PlaceholderPage title="참여한 여정이 없어요" /> },
  { layout: 'auth', path: '/trips/new', element: <PlaceholderPage title="새 여정" /> },
  { layout: 'auth', path: '/join', element: <PlaceholderPage title="초대코드로 참여" /> },
  { layout: 'trip-page', path: '/trips/:tripId/edit', element: <PlaceholderPage title="여정 수정" /> },
  { layout: 'trip-page', path: '/trips/:tripId/created', element: <PlaceholderPage title="여정을 만들었어요" /> },
]
