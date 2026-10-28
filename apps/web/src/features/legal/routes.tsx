import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

// 로그인 없이 열리는 공개 문서(FR-903). 어떤 문서인지는 LegalPage가 주소로 고른다(docs.ts)
export const routes: AppRoute[] = ['/terms', '/terms/fin-link', '/privacy', '/consents/:consentId', '/licenses'].map(
  (path) => ({ layout: 'public', path, Component: lazy(() => import('./pages/LegalPage')) }),
)
