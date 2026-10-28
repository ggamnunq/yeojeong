import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

// A 인증(WF-02~05b, 재동의). 스플래시(WF-01)는 core, 토스 인증·선택·완료(WF-06~08, /wallet/connect/*)는 wallet 플로우.
export const routes: AppRoute[] = [
  { layout: 'guest', path: '/login', Component: lazy(() => import('./pages/LoginPage')) },
  { layout: 'signup', path: '/signup/nickname', Component: lazy(() => import('./pages/NicknamePage')) },
  // 가입 성공 순간 세션이 로그인으로 바뀌면 RequireSignup이 '/'로 보내 WF-05를 건너뛴다. 그래서 같은 가드를 화면이 직접 한다
  { layout: 'public', path: '/signup/terms', Component: lazy(() => import('./pages/TermsPage')) },
  { layout: 'auth', path: '/signup/wallet', Component: lazy(() => import('./pages/SignupWalletPage')) },
  // 세션 확인이 403 CONSENT_REQUIRED여도 열려야 하므로 가드 없이 두고 화면이 직접 판단한다
  { layout: 'public', path: '/reconsent', Component: lazy(() => import('./pages/ReconsentPage')) },
]
