import { lazy } from 'react'
import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// A 인증(WF-02~05b, 재동의). 스플래시(WF-01)는 core, 토스 인증·선택·완료(WF-06~08, /wallet/connect/*)는 wallet 플로우.
export const routes: AppRoute[] = [
  { layout: 'guest', path: '/login', Component: lazy(() => import('./pages/LoginPage')) },
  { layout: 'signup', path: '/signup/nickname', element: <PlaceholderPage title="닉네임" /> },
  { layout: 'signup', path: '/signup/terms', element: <PlaceholderPage title="약관 동의" /> },
  { layout: 'auth', path: '/signup/wallet', element: <PlaceholderPage title="토스 지갑 연결" /> },
  { layout: 'public', path: '/reconsent', element: <PlaceholderPage title="재동의" /> },
]
