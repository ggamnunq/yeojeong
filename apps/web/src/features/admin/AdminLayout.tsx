import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useOutlet } from 'react-router'
import { isRetryableError } from '../../api'
import { LoadingScreen } from '../../app/states'
import { isAdminUnauthenticated } from './api'
import { adminPaths } from './paths'

/** 관리자 전용 QueryClient. 전역 onError 처리기가 없다(실패는 화면이 직접 보여 준다) */
function createAdminQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => failureCount < 1 && isRetryableError(error),
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}

/**
 * 관리자 화면 맨 바깥(/admin/*).
 * - 전용 QueryClient: 앱 QueryClient의 전역 처리기(401 → 카카오 로그인 이동, 실패 토스트)를 타지 않는다.
 *   관리자 세션 만료면 캐시를 비우고 /admin/login?returnTo=지금 주소로 보낸다.
 * - 검색 엔진 색인 금지(robots meta, 정적 응답은 public/_headers의 X-Robots-Tag).
 */
export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutlet()
  const [client] = useState(createAdminQueryClient)
  const here = `${location.pathname}${location.search}`

  // 어느 쿼리·뮤테이션이든 관리자 세션 만료(401 ADMIN_UNAUTHENTICATED)를 받으면 캐시를 비우고 로그인으로
  useEffect(() => {
    const expired = () => {
      client.clear()
      if (location.pathname !== adminPaths.login()) navigate(adminPaths.login(here), { replace: true })
    }
    const offQueries = client.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error' && isAdminUnauthenticated(event.action.error)) expired()
    })
    const offMutations = client.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error' && isAdminUnauthenticated(event.action.error)) expired()
    })
    return () => {
      offQueries()
      offMutations()
    }
  }, [client, navigate, here, location.pathname])

  return (
    <QueryClientProvider client={client}>
      <meta name="robots" content="noindex, nofollow" />
      <title>여정 관리자</title>
      <Suspense fallback={<LoadingScreen />}>{outlet ?? <Navigate to={adminPaths.users()} replace />}</Suspense>
    </QueryClientProvider>
  )
}
