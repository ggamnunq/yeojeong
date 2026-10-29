import { infiniteQueryOptions, queryOptions, type QueryClient } from '@tanstack/react-query'
import type { FxRateView } from '@yeojeong/shared'
import { apiFetch, keys } from '../../api'
import { isOutOfPeriodKey } from '../payments/api'
import type { PaymentDetail } from '../payments/types'
import type {
  CreateTripExpenseRequest,
  CreateWalletEntryRequest,
  UpdateTripExpenseRequest,
  UpdateWalletEntryRequest,
  WalletEntriesPage,
  WalletEntryMutationResponse,
  WalletTripCandidatesResponse,
} from './types'

// 수동 결제(직접 입력) 쿼리·뮤테이션(서버 S7 계약). 지갑 키는 keys.wallet.all(['wallet'])로 시작한다.

export const WALLET_PAGE_SIZE = 50

export const walletKeys = {
  entries: [...keys.wallet.all, 'entries'] as const,
  candidates: (at: string) => [...keys.wallet.all, 'trip-candidates', at] as const,
}

/** GET /wallet/entries — 최신순 커서 목록(HF-49) */
export const walletEntriesQuery = () =>
  infiniteQueryOptions({
    queryKey: walletKeys.entries,
    queryFn: ({ signal, pageParam }) =>
      apiFetch<WalletEntriesPage>(
        `/wallet/entries?limit=${WALLET_PAGE_SIZE}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // 화면이 「불러오지 못했어요 · 다시 시도」를 보여 준다
    meta: { silent: true },
  })

/** GET /wallet/trip-candidates?at= — 실패하면 화면은 조용히 "추가 안 함"으로 둔다 */
export const tripCandidatesQuery = (at: string) =>
  queryOptions({
    queryKey: walletKeys.candidates(at),
    queryFn: ({ signal }) =>
      apiFetch<WalletTripCandidatesResponse>(`/wallet/trip-candidates?at=${encodeURIComponent(at)}`, { signal }),
    staleTime: 60_000,
    meta: { silent: true },
  })

/** GET /fx?base= — 연결 여정이 없는 외화 미리보기(서버 최신 고시, Q-43) */
export const latestFxQuery = (currency: string) =>
  queryOptions({
    queryKey: ['fx', currency] as const,
    queryFn: ({ signal }) => apiFetch<FxRateView>(`/fx?base=${encodeURIComponent(currency)}`, { signal }),
    staleTime: 10 * 60_000,
    meta: { silent: true },
  })

export const createWalletEntry = (body: CreateWalletEntryRequest) =>
  apiFetch<WalletEntryMutationResponse>('/wallet/entries', { body })

export const updateWalletEntry = (entryId: string, body: UpdateWalletEntryRequest) =>
  apiFetch<WalletEntryMutationResponse>(`/wallet/entries/${entryId}`, { method: 'PATCH', body })

export const deleteWalletEntry = (entryId: string, includeShared: boolean) =>
  apiFetch<void>(`/wallet/entries/${entryId}${includeShared ? '?includeShared=true' : ''}`, { method: 'DELETE' })

export const createTripExpense = (tripId: string, body: CreateTripExpenseRequest) =>
  apiFetch<PaymentDetail>(`/trips/${tripId}/expenses`, { body })

export const updateTripExpense = (tripId: string, expenseId: string, body: UpdateTripExpenseRequest) =>
  apiFetch<PaymentDetail>(`/trips/${tripId}/expenses/${expenseId}`, { method: 'PATCH', body })

export const deleteTripExpense = (tripId: string, expenseId: string, version: number) =>
  apiFetch<void>(`/trips/${tripId}/expenses/${expenseId}?version=${version}`, { method: 'DELETE' })

/**
 * 수동 결제를 바꾼 뒤: 여정 결제·현황·정산(모든 여정 — 지갑 항목은 어느 여정에든 연결될 수 있다)·지갑·내 정보(결제 N건)를 다시 받는다.
 * 기간 외 후보(제공자 조회)는 빼고, 지운 결제 상세는 다시 받지 않는다(404 안내가 뜨지 않게)
 */
export function invalidateManual(client: QueryClient, gone?: { tripId: string; expenseId: string }) {
  const goneKey = gone ? keys.trips.expense(gone.tripId, gone.expenseId).join('/') : null
  return Promise.all([
    client.invalidateQueries({
      queryKey: keys.trips.all,
      predicate: (q) => !isOutOfPeriodKey(q.queryKey) && q.queryKey.join('/') !== goneKey,
    }),
    client.invalidateQueries({ queryKey: keys.wallet.all }),
    client.invalidateQueries({ queryKey: keys.me }),
  ])
}
