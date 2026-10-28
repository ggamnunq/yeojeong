import { infiniteQueryOptions, queryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { apiFetch, keys, type ExpenseListItem, type ExpenseListParams, type ExpenseListResponse } from '../../api'
import type { ClassificationInput, OutOfPeriodAddResponse, OutOfPeriodCandidate, PaymentDetail, PeriodSide } from './types'

// 결제 플로우의 쿼리·뮤테이션(기능명세 6-3 expenses). 키는 모두 keys.trips.detail(tripId)로 시작하므로
// 뮤테이션 뒤 invalidateQueries({ queryKey: keys.trips.detail(tripId) })로 목록·상세·현황이 함께 새로 받아진다.

/** 한 번에 받는 결제 수(커서 페이지) */
export const PAGE_SIZE = 50

const search = (params: Record<string, string | number | null | undefined>) => {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value != null && value !== '') q.set(key, String(value))
  const text = q.toString()
  return text ? `?${text}` : ''
}

/** GET /trips/:tripId/expenses — 커서 무한 스크롤. 리스트는 order=desc, 타임라인은 day=N&order=asc */
export const expensesQuery = (tripId: string, params: ExpenseListParams) =>
  infiniteQueryOptions({
    queryKey: [...keys.trips.expenses(tripId, params), 'pages'],
    queryFn: ({ signal, pageParam }) =>
      apiFetch<ExpenseListResponse>(
        `/trips/${tripId}/expenses${search({ ...params, cursor: pageParam, limit: PAGE_SIZE })}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // 화면이 「불러오지 못했어요 · 다시 시도」를 직접 보여 준다
    meta: { silent: true },
  })

/** GET /trips/:tripId/expenses/:expenseId */
export const expenseQuery = (tripId: string, expenseId: string) =>
  queryOptions({
    queryKey: keys.trips.expense(tripId, expenseId),
    queryFn: ({ signal }) => apiFetch<PaymentDetail>(`/trips/${tripId}/expenses/${expenseId}`, { signal }),
  })

/** GET /trips/:tripId/out-of-period-candidates?side= */
export const outOfPeriodQuery = (tripId: string, side: PeriodSide) =>
  queryOptions({
    queryKey: keys.trips.outOfPeriod(tripId, side),
    queryFn: async ({ signal }) => {
      const res = await apiFetch<OutOfPeriodCandidate[] | { items: OutOfPeriodCandidate[] }>(
        `/trips/${tripId}/out-of-period-candidates${search({ side })}`,
        { signal },
      )
      // 명세는 배열이다. 서버가 { items }로 감싸도 받는다(S2B-2 확정 후 한쪽으로)
      return Array.isArray(res) ? res : res.items
    },
    // 연결 만료(409 CONNECTION_EXPIRED)는 화면이 Callout으로 보여 준다
    meta: { silent: true },
  })

export const classifyExpense = (tripId: string, expenseId: string, input: ClassificationInput) =>
  apiFetch<PaymentDetail>(`/trips/${tripId}/expenses/${expenseId}/classification`, { method: 'PUT', body: input })

export const dismissDuplicate = (tripId: string, expenseId: string, version: number) =>
  apiFetch<PaymentDetail>(`/trips/${tripId}/expenses/${expenseId}/duplicate-dismissal`, { body: { version } })

export const addOutOfPeriod = (tripId: string, candidateIds: string[]) =>
  apiFetch<OutOfPeriodAddResponse>(`/trips/${tripId}/out-of-period-expenses`, { body: { candidateIds } })

/** 이미 받아 둔 목록에서 결제 하나를 찾는다(시트 머리를 상세 응답 전에 그린다) */
export function findCachedExpense(client: QueryClient, tripId: string, expenseId: string): ExpenseListItem | undefined {
  const cached = client.getQueriesData<InfiniteData<ExpenseListResponse>>({ queryKey: [...keys.trips.detail(tripId), 'expenses'] })
  for (const [, data] of cached) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((item) => item.id === expenseId)
      if (hit) return hit
    }
  }
  return undefined
}
