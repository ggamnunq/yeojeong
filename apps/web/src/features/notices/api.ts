import { queryOptions } from '@tanstack/react-query'
import type { ActiveNoticesResponse } from '@yeojeong/shared'
import { apiFetch } from '../../api'

/** GET /api/notices/active — 공개. 서버도 5분 캐시(private)라 화면도 5분 동안 다시 묻지 않는다. 실패해도 배너만 안 보인다 */
export const activeNoticesQuery = () =>
  queryOptions({
    queryKey: ['notices', 'active'] as const,
    queryFn: ({ signal }) => apiFetch<ActiveNoticesResponse>('/notices/active', { signal }),
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  })
