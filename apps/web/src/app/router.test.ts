import { describe, expect, it } from 'vitest'
import { featureRoutes } from './router'
import { validateRoutes, type AppRoute } from './routes'

const fullPaths = (routes: AppRoute[]) =>
  routes.flatMap((r) => [r.path, ...(r.children ?? []).map((c) => c.path ?? '')]).sort()

// 화면명세 0-3 라우트 표
const SPEC_PATHS = [
  '/',
  '/login',
  '/signup/nickname',
  '/signup/terms',
  '/signup/wallet',
  '/wallet/connect/toss',
  '/wallet/connect/select',
  '/wallet/connect/done',
  '/trips',
  '/trips/new',
  '/trips/:tripId/edit',
  '/trips/:tripId/created',
  '/join',
  '/trips/:tripId/info',
  '/trips/:tripId/payments',
  '/trips/:tripId/payments/:expenseId',
  '/trips/:tripId/payments/out-of-period',
  '/trips/:tripId/stats',
  '/trips/:tripId/settlement',
  '/trips/:tripId/settlement/:membershipId',
  '/wallet',
  '/trips/:tripId/fx',
  '/me',
  '/reconsent',
  '/terms',
  '/privacy',
  '/terms/fin-link',
  '/consents/:consentId',
  '/licenses',
]

describe('라우트 수집', () => {
  it('features/*/routes.tsx를 모두 모으고 규칙 위반이 없다', () => {
    expect(validateRoutes(featureRoutes)).toEqual([])
  })

  it('화면명세 라우트 표의 경로가 모두 있다', () => {
    const paths = fullPaths(featureRoutes)
    for (const path of SPEC_PATHS) expect(paths, path).toContain(path)
  })

  it('파일 이름 순으로 모은다(core가 features 맨 앞이 아니어도 순서가 매번 같다)', () => {
    expect(fullPaths(featureRoutes)).toEqual(fullPaths([...featureRoutes]))
  })
})

describe('validateRoutes', () => {
  const page = { element: null }

  it('같은 경로가 두 번이면 알려 준다(하위 라우트 포함)', () => {
    const problems = validateRoutes([
      { layout: 'auth', path: '/me', ...page },
      { layout: 'trip', path: '/trips/:tripId/payments', ...page, children: [{ path: '/me', ...page }] },
    ])
    expect(problems).toEqual(['/me: 2번 정의됨'])
  })

  it('/trips/:tripId/ 아래는 trip·trip-page layout만', () => {
    expect(validateRoutes([{ layout: 'auth', path: '/trips/:tripId/stats', ...page }])).toHaveLength(1)
    expect(validateRoutes([{ layout: 'trip', path: '/wallet', ...page }])).toHaveLength(1)
  })

  it('상대 경로를 막는다', () => {
    expect(validateRoutes([{ layout: 'public', path: 'terms', ...page }])[0]).toContain('/ 로 시작')
  })
})
