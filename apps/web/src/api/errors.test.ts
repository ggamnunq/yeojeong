import { CancelledError } from '@tanstack/react-query'
import { ERRORS, type ErrorCode } from '@yeojeong/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toastStore } from '../notifications/store'
import { ApiError, type ApiErrorInit } from './client'
import { fieldErrorPaths, fieldErrors, handleApiError, onUnauthenticated, resetUnauthenticated } from './errors'

const REQUEST_ID = '05c8d730-1b2c-4d5e-8f90-123456789abc'

function apiError(code: ErrorCode, init: Partial<ApiErrorInit> = {}) {
  const definition = ERRORS[code]
  return new ApiError({ code, message: definition.message, status: definition.status, requestId: REQUEST_ID, ...init })
}

const toasts = () => toastStore.getSnapshot().map(({ type, message, action }) => ({ type, message, action: action?.label }))

beforeEach(() => {
  toastStore.clear()
})

afterEach(() => {
  toastStore.clear()
  vi.restoreAllMocks()
})

describe('handleApiError', () => {
  it('취소된 요청(AbortError·TanStack CancelledError)은 아무것도 하지 않는다', () => {
    handleApiError(new DOMException('aborted', 'AbortError'))
    handleApiError(new CancelledError())
    expect(toasts()).toEqual([])
  })

  it('UNAUTHENTICATED는 토스트 없이 처리기를 한 번만 부르고, reset 뒤에는 다시 부른다', () => {
    const handler = vi.fn()
    const off = onUnauthenticated(handler)
    try {
      const error = apiError('UNAUTHENTICATED')
      handleApiError(error)
      handleApiError(error)
      handleApiError(apiError('UNAUTHENTICATED'), { silent: true })
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(error)
      expect(toasts()).toEqual([])

      resetUnauthenticated()
      handleApiError(error, { silent: true })
      expect(handler).toHaveBeenCalledTimes(2)
    } finally {
      off()
    }
  })

  it('VALIDATION_FAILED는 폼에 맡기고 토스트를 띄우지 않는다', () => {
    handleApiError(apiError('VALIDATION_FAILED', { details: { fields: [{ path: 'title', message: '필수예요' }] } }))
    expect(toasts()).toEqual([])
  })

  it('RATE_LIMITED는 Retry-After가 있으면 기다릴 시간을 넣는다', () => {
    handleApiError(apiError('RATE_LIMITED', { retryAfterSec: 30 }))
    expect(toasts()).toEqual([{ type: 'error', message: '요청이 너무 많아요. 30초 뒤에 다시 시도해 주세요', action: undefined }])

    toastStore.clear()
    handleApiError(apiError('RATE_LIMITED', { retryAfterSec: 90 }))
    expect(toasts()[0].message).toBe('요청이 너무 많아요. 2분 뒤에 다시 시도해 주세요')

    toastStore.clear()
    handleApiError(apiError('RATE_LIMITED'))
    expect(toasts()[0].message).toBe(ERRORS.RATE_LIMITED.message)
  })

  it.each(['NETWORK_ERROR', 'TIMEOUT', 'UPSTREAM_UNAVAILABLE'] as const)(
    '%s는 오류 토스트 + retry가 있으면 「다시 시도」',
    (code) => {
      const retry = vi.fn()
      handleApiError(apiError(code, { status: 0, requestId: undefined }), { retry })
      expect(toasts()).toEqual([{ type: 'error', message: ERRORS[code].message, action: '다시 시도' }])

      toastStore.act(toastStore.getSnapshot()[0].id)
      expect(retry).toHaveBeenCalledTimes(1)
      expect(toasts()).toEqual([])
    },
  )

  it('retry가 없으면 액션 없이 띄운다', () => {
    handleApiError(apiError('NETWORK_ERROR', { status: 0 }))
    expect(toasts()).toEqual([{ type: 'error', message: ERRORS.NETWORK_ERROR.message, action: undefined }])
  })

  it('NOT_FOUND·CONFLICT는 서버 문구로 안내 토스트, FORBIDDEN은 오류 토스트', () => {
    handleApiError(apiError('NOT_FOUND', { message: '여정을 찾을 수 없어요' }))
    handleApiError(apiError('CONFLICT', { message: '이미 정산이 끝난 여정이에요' }))
    expect(toasts()).toEqual([
      { type: 'info', message: '여정을 찾을 수 없어요', action: undefined },
      { type: 'info', message: '이미 정산이 끝난 여정이에요', action: undefined },
    ])

    toastStore.clear()
    handleApiError(apiError('FORBIDDEN', { message: '이 여정의 멤버만 볼 수 있어요' }))
    expect(toasts()).toEqual([{ type: 'error', message: '이 여정의 멤버만 볼 수 있어요', action: undefined }])
  })

  it('모르는 도메인 코드는 status로 나눈다(404 → 안내)', () => {
    handleApiError(apiError('NOT_FOUND', { code: 'TRIP_NOT_FOUND' as ErrorCode, message: '여정이 없어요' }))
    expect(toasts()).toEqual([{ type: 'info', message: '여정이 없어요', action: undefined }])
  })

  it('INTERNAL_ERROR는 문의 번호(요청 ID 앞 8자)를 붙인다', () => {
    handleApiError(apiError('INTERNAL_ERROR'))
    expect(toasts()).toEqual([
      { type: 'error', message: `${ERRORS.INTERNAL_ERROR.message} (문의 번호 05c8d730)`, action: undefined },
    ])
  })

  it('INVALID_RESPONSE는 요청 ID가 없으면 문구만', () => {
    handleApiError(apiError('INVALID_RESPONSE', { status: 404, requestId: undefined }))
    expect(toasts()).toEqual([{ type: 'error', message: ERRORS.INVALID_RESPONSE.message, action: undefined }])
  })

  it('ApiError가 아닌 에러는 공통 문구', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    handleApiError(new TypeError('x is undefined'))
    expect(toasts()).toEqual([
      { type: 'error', message: '문제가 생겼어요. 잠시 후 다시 시도해 주세요', action: undefined },
    ])
  })

  it('silent면 토스트를 띄우지 않는다', () => {
    handleApiError(apiError('INTERNAL_ERROR'), { silent: true })
    handleApiError(apiError('NETWORK_ERROR'), { silent: true, retry: () => {} })
    expect(toasts()).toEqual([])
  })

  it('같은 코드·문구가 연달아 오면 하나만 띄운다', () => {
    handleApiError(apiError('TIMEOUT', { status: 0 }), { retry: () => {} })
    handleApiError(apiError('TIMEOUT', { status: 0 }), { retry: () => {} })
    handleApiError(apiError('INTERNAL_ERROR'))
    handleApiError(apiError('INTERNAL_ERROR'))
    expect(toasts().map((t) => t.message)).toEqual([
      ERRORS.TIMEOUT.message,
      `${ERRORS.INTERNAL_ERROR.message} (문의 번호 05c8d730)`,
    ])
  })
})

describe('fieldErrors', () => {
  const error = apiError('VALIDATION_FAILED', {
    details: {
      fields: [
        { path: 'title', code: 'isNotEmpty', message: '제목을 적어 주세요' },
        { path: 'title', code: 'maxLength', message: '20자 이하로 적어 주세요' },
        { path: 'items.0.amount', code: 'isPositive', message: '0보다 커야 해요' },
        { path: '2', code: 'isString', message: '문자여야 해요' },
      ],
    },
  })

  it('필드마다 첫 메시지만 담는다', () => {
    expect(fieldErrors(error)).toEqual({
      title: '제목을 적어 주세요',
      'items.0.amount': '0보다 커야 해요',
      2: '문자여야 해요',
    })
  })

  it('경로 순서는 서버가 보낸 순서 그대로(숫자 경로 포함)', () => {
    expect(fieldErrorPaths(error)).toEqual(['title', 'items.0.amount', '2'])
  })

  it('검증 실패가 아니거나 fields가 없으면 비어 있다', () => {
    expect(fieldErrors(apiError('NOT_FOUND'))).toEqual({})
    expect(fieldErrors(apiError('VALIDATION_FAILED'))).toEqual({})
    expect(fieldErrors(new Error('x'))).toEqual({})
    expect(fieldErrorPaths(undefined)).toEqual([])
  })
})
