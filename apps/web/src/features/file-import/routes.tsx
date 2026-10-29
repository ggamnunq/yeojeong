import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

// 거래 내역 파일 가져오기(HF-66~68, W10). features.fileImport가 꺼져 있거나 모르는 공급자면 페이지가 지갑으로 보낸다.
// 66b·66c·67·68·68b는 같은 주소의 단계 상태다(결과를 주소·history state에 넣지 않는다).
export const routes: AppRoute[] = [{ layout: 'auth', path: '/wallet/file-import/:provider', Component: lazy(() => import('./pages/FilePage')) }]
