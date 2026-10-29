import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { layout: 'auth', path: '/me', Component: lazy(() => import('./pages/MePage')) },
  // 내 정보(HF-63): 닉네임 변경(FR-902)
  { layout: 'auth', path: '/me/profile', Component: lazy(() => import('./pages/ProfilePage')) },
  // 탈퇴(HF-59). 재동의 대기 중에도 열린다(app/session RequireAuth)
  { layout: 'auth', path: '/me/withdraw', Component: lazy(() => import('./pages/WithdrawPage')) },
]
