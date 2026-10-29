import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isApiError, keys } from '../../api'
import { paymentMethodsQuery, requestSync } from './api'

/** 202 뒤 동기화 완료(결제수단 lastSyncedAt 변화)를 확인하는 간격과 최대 대기(FR-402 "최대 15초 폴링") */
export const SYNC_POLL_MS = 1500
export const SYNC_MAX_MS = 15_000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 수동 동기화(FR-402) — 지갑 새로고침 아이콘(WF-27)·결제내역 당겨서 새로고침(WF-18·19)이 같이 쓴다.
 * POST /payment-methods/sync
 * - 202: 결제수단 lastSyncedAt이 바뀔 때까지 최대 15초 폴링(그동안 isPending = 스피너)
 * - 200 skipped 'NO_ACTIVE_TRIP': 제공자를 부르지 않았으니 기다리지 않는다
 * - 429 SYNC_RATE_LIMITED · 409 CONNECTION_EXPIRED · 제공자 장애: 토스트 없이 재조회만
 * 끝나면(성공·실패 모두) 결제수단과 onSettled(화면 목록 재조회)를 다시 받는다. 401은 전역 처리기로 넘긴다.
 */
export function useManualSync(onSettled?: () => unknown) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const fresh = () => queryClient.fetchQuery({ ...paymentMethodsQuery(), staleTime: 0 })
      let before: string | null
      try {
        before = (await fresh()).lastSyncedAt
        const started = await requestSync()
        if (started.skipped) return
      } catch (error) {
        if (isApiError(error) && error.status === 401) throw error
        return
      }
      const deadline = Date.now() + SYNC_MAX_MS
      while (Date.now() < deadline) {
        await wait(SYNC_POLL_MS)
        const next = await fresh().catch(() => null)
        if (!next || next.lastSyncedAt !== before) return
      }
    },
    onSettled: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.wallet.methods }), onSettled?.()])
    },
    meta: { silent: true },
  })
}
