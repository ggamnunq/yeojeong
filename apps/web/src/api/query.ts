import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from './client'
import { handleApiError } from './errors'

// TanStack Query 기본값. 실패는 QueryCache·MutationCache의 onError에서 전역 처리기(handleApiError)로 모은다.

export type ApiQueryMeta = {
  /** true면 실패해도 전역 토스트를 띄우지 않는다(화면이 직접 보여 줄 때). 401 처리는 그대로 한다 */
  silent?: boolean
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: ApiQueryMeta
    mutationMeta: ApiQueryMeta
  }
}

/** 첫 실패 뒤 최대 몇 번 더 시도하나 */
export const MAX_QUERY_RETRIES = 2
/** 이 시간 동안은 같은 쿼리를 다시 받지 않는다 */
export const DEFAULT_STALE_TIME_MS = 30_000

/** 다시 시도해서 나아질 수 있는 실패: 연결 실패·시간 초과·5xx. 4xx(401·검증 실패·429 포함)는 다시 해도 같다 */
export function isRetryableError(error: unknown): boolean {
  if (!isApiError(error)) return false
  if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') return true
  return error.status >= 500
}

/** TanStack Query retry. failureCount는 지금까지 실패한 횟수(첫 실패 때 0) */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error)
}

/** 1초 → 2초 → … 최대 10초 */
export function queryRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 10_000)
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        handleApiError(error, {
          silent: query.meta?.silent === true,
          // 토스트는 중복 제거되므로, 다시 시도는 실패해 있는 화면 위 쿼리를 모두 다시 받는다
          retry: () => void client.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' }),
        }),
    }),
    mutationCache: new MutationCache({
      // 뮤테이션은 서버에서 이미 처리됐을 수도 있어(시간 초과 등) 자동으로 다시 보내지 않는다. 다시 시도는 화면이 정한다.
      onError: (error, _variables, _context, mutation) =>
        handleApiError(error, { silent: mutation.meta?.silent === true }),
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
        staleTime: DEFAULT_STALE_TIME_MS,
      },
      mutations: {
        retry: false,
      },
    },
  })
  return client
}
