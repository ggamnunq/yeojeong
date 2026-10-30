import { lazy } from 'react'
import { Navigate } from 'react-router'
import type { AppRoute } from '../../app/routes'

// 운영자 관리자 페이지. 모든 화면을 지연 로딩해 일반 앱 번들에 들어가지 않게 한다(이 파일은 앱이 바로 읽으니 가볍게 둔다).
// /admin 자체는 AdminLayout이 /admin/users로 보낸다.
export const routes: AppRoute[] = [
  {
    layout: 'public',
    path: '/admin',
    Component: lazy(() => import('./AdminLayout')),
    children: [
      { path: '/admin/login', Component: lazy(() => import('./pages/AdminLoginPage')) },
      {
        Component: lazy(() => import('./AdminShell')),
        children: [
          { path: '/admin/users', Component: lazy(() => import('./pages/AdminUsersPage')) },
          { path: '/admin/users/:userId', Component: lazy(() => import('./pages/AdminUserDetailPage')) },
          { path: '/admin/codef', Component: lazy(() => import('./pages/AdminCodefPage')) },
          { path: '/admin/features', Component: lazy(() => import('./pages/AdminFeaturesPage')) },
          // 옛 카드 불러오기 권한 탭(ADMIN2) 주소는 기능 권한으로
          { path: '/admin/card-import', element: <Navigate to="/admin/features" replace /> },
        ],
      },
    ],
  },
]

