import { lazy } from 'react'
import { Navigate } from 'react-router'
import type { AppRoute } from '../../app/routes'

// 로그인 없이 열리는 공개 문서(FR-903). 어떤 문서인지는 LegalPage가 주소로 고른다(docs.ts).
// /oss = 오픈소스 고지(약관 제27조②). /licenses는 예전 주소라 /oss로 보낸다
export const routes: AppRoute[] = [
  ...['/terms', '/terms/fin-link', '/privacy', '/privacy/processors', '/consents/:consentId', '/oss'].map(
    (path): AppRoute => ({ layout: 'public', path, Component: lazy(() => import('./pages/LegalPage')) }),
  ),
  { layout: 'public', path: '/licenses', element: <Navigate replace to="/oss" /> },
]
