import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { ERRORS, type ErrorCode } from '@yeojeong/shared'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toastStore } from '../notifications/store'
import { ApiProvider } from './ApiProvider'
import { ApiError } from './client'
import { createQueryClient, queryRetryDelay, shouldRetryQuery } from './query'

function apiError(code: ErrorCode, status: number = ERRORS[code].status) {
  return new ApiError({ code, message: ERRORS[code].message, status })
}

describe('재시도 정책', () => {
  it.each([
    ['NETWORK_ERROR', 0],
    ['TIMEOUT', 0],
    ['UPSTREAM_UNAVAILABLE', 502],
    ['INTERNAL_ERROR', 500],
  ] as const)('%s(%i)는 두 번까지 다시 시도한다', (code, status) => {
    const error = apiError(code, status)
    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(1, error)).toBe(true)
    expect(shouldRetryQuery(2, error)).toBe(false)
  })

  it.each([
    ['UNAUTHENTICATED', 401],
    ['VALIDATION_FAILED', 400],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['RATE_LIMITED', 429],
    ['INVALID_RESPONSE', 404],
  ] as const)('%s(%i)는 다시 시도하지 않는다', (code, status) => {
    expect(shouldRetryQuery(0, apiError(code, status))).toBe(false)
  })

  it('ApiError가 아닌 에러(코드 버그)는 다시 시도하지 않는다', () => {
    expect(shouldRetryQuery(0, new TypeError('x'))).toBe(false)
  })

  it('지수 백오프: 1초 → 2초 → … 최대 10초', () => {
    expect([0, 1, 2, 3, 4, 5].map(queryRetryDelay)).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000])
  })
})

describe('createQueryClient', () => {
  let client: QueryClient
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider client={client}>{children}</ApiProvider>
  const toasts = () => toastStore.getSnapshot()

  beforeEach(() => {
    vi.useFakeTimers()
    toastStore.clear()
    client = createQueryClient()
  })

  afterEach(() => {
    client.clear()
    toastStore.clear()
    vi.useRealTimers()
  })

  it('연결 실패는 1초·2초 뒤 두 번 더 시도하고, 그래도 실패하면 「다시 시도」 토스트를 한 번 띄운다', async () => {
    const queryFn = vi.fn().mockRejectedValue(apiError('NETWORK_ERROR', 0))
    const { result } = renderHook(() => useQuery({ queryKey: ['trips'], queryFn }), { wrapper })

    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(queryFn).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(toasts()).toHaveLength(0)
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(queryFn).toHaveBeenCalledTimes(3)
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(result.current.isError).toBe(true)
    expect(toasts()).toMatchObject([{ type: 'error', message: ERRORS.NETWORK_ERROR.message, action: { label: '다시 시도' } }])

    // 다시 시도: 실패한 쿼리를 다시 받는다
    queryFn.mockResolvedValue(['도쿄'])
    await act(async () => {
      toastStore.act(toasts()[0].id)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(queryFn).toHaveBeenCalledTimes(4)
    expect(result.current.data).toEqual(['도쿄'])
    expect(toasts()).toHaveLength(0)
  })

  it('4xx는 바로 실패하고 다시 시도하지 않는다', async () => {
    const queryFn = vi.fn().mockRejectedValue(apiError('FORBIDDEN'))
    const { result } = renderHook(() => useQuery({ queryKey: ['trip', 't1'], queryFn }), { wrapper })

    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(result.current.isError).toBe(true)
    expect(toasts()).toMatchObject([{ type: 'error', message: ERRORS.FORBIDDEN.message }])
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('meta.silent면 전역 토스트를 띄우지 않는다', async () => {
    const queryFn = vi.fn().mockRejectedValue(apiError('NOT_FOUND'))
    const { result } = renderHook(() => useQuery({ queryKey: ['quiet'], queryFn, meta: { silent: true } }), {
      wrapper,
    })

    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(result.current.isError).toBe(true)
    expect(toasts()).toHaveLength(0)
  })

  it('뮤테이션은 자동으로 다시 보내지 않고, 실패하면 전역 토스트(다시 시도 액션 없음)', async () => {
    const mutationFn = vi.fn().mockRejectedValue(apiError('TIMEOUT', 0))
    const { result } = renderHook(() => useMutation({ mutationFn }), { wrapper })

    await act(async () => {
      result.current.mutate(undefined)
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(result.current.isError).toBe(true)
    expect(toasts()).toMatchObject([{ type: 'error', message: ERRORS.TIMEOUT.message, action: undefined }])
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(mutationFn).toHaveBeenCalledTimes(1)
  })

  it('뮤테이션 meta.silent', async () => {
    const mutationFn = vi.fn().mockRejectedValue(apiError('CONFLICT'))
    const { result } = renderHook(() => useMutation({ mutationFn, meta: { silent: true } }), { wrapper })

    await act(async () => {
      result.current.mutate(undefined)
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(result.current.isError).toBe(true)
    expect(toasts()).toHaveLength(0)
  })
})
