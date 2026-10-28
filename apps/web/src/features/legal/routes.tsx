import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { AppRoute } from '../../app/routes'

// TODO(셸 2단계): 로그인 없이 열리는 공개 문서(FR-903)
export const routes: AppRoute[] = [
  { layout: 'public', path: '/terms', element: <PlaceholderPage title="서비스 이용약관" /> },
  { layout: 'public', path: '/terms/fin-link', element: <PlaceholderPage title="금융정보 연동 약관" /> },
  { layout: 'public', path: '/privacy', element: <PlaceholderPage title="개인정보처리방침" /> },
  { layout: 'public', path: '/consents/:consentId', element: <PlaceholderPage title="동의서" /> },
  { layout: 'public', path: '/licenses', element: <PlaceholderPage title="오픈소스 라이선스" /> },
]
