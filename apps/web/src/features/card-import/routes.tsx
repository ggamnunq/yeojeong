import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'
import { cardImportOnly } from './flow'

// 카드 내역 불러오기(WF-51~57): features.cardImport가 꺼져 있으면 지갑으로(화면명세 0-11). 동의 관리(WF-58)는 플래그와 무관.
// WF-54~57은 WF-53 주소의 단계 상태다(주소에 민감 값을 넣지 않는다).
export const routes: AppRoute[] = [
  { layout: 'auth', path: '/wallet/import', Component: cardImportOnly(lazy(() => import('./pages/StartPage'))) },
  { layout: 'auth', path: '/wallet/import/issuer', Component: cardImportOnly(lazy(() => import('./pages/IssuerPage')), { requireFlow: true }) },
  { layout: 'auth', path: '/wallet/import/:issuer', Component: cardImportOnly(lazy(() => import('./pages/FlowPage')), { requireFlow: true }) },
  // 동의 관리는 기능 플래그와 무관하다(유효 동의가 0건이면 화면이 HF-30으로 돌려보낸다)
  { layout: 'auth', path: '/me/consents', Component: lazy(() => import('./pages/ConsentsPage')) },
]
