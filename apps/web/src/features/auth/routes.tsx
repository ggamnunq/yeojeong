import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// TODO(플로우 A): 자리 화면을 lazy 페이지로 바꾼다
export const routes: AppRoute[] = [
  { layout: 'guest', path: '/login', element: <PlaceholderPage title="로그인" /> },
  { layout: 'signup', path: '/signup/nickname', element: <PlaceholderPage title="닉네임" /> },
  { layout: 'signup', path: '/signup/terms', element: <PlaceholderPage title="약관 동의" /> },
  { layout: 'auth', path: '/signup/wallet', element: <PlaceholderPage title="토스 지갑 연결" /> },
  { layout: 'public', path: '/reconsent', element: <PlaceholderPage title="재동의" /> },
]
