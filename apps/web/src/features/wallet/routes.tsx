import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// TODO(지갑 플로우): 자리 화면을 lazy 페이지로 바꾼다. WF-06~08은 가입·추가·재연결 공용
export const routes: AppRoute[] = [
  { layout: 'auth', path: '/wallet', element: <PlaceholderPage title="지갑" /> },
  { layout: 'auth', path: '/wallet/connect/toss', element: <PlaceholderPage title="토스 인증" /> },
  { layout: 'auth', path: '/wallet/connect/select', element: <PlaceholderPage title="불러올 계좌·카드" /> },
  { layout: 'auth', path: '/wallet/connect/done', element: <PlaceholderPage title="연결 완료" /> },
  { layout: 'trip-page', path: '/trips/:tripId/fx', element: <PlaceholderPage title="환율" /> },
]
