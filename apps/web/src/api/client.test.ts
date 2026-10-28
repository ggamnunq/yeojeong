import { ERRORS } from '@yeojeong/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, isAbort, isApiError, parseRetryAfter } from './client'

const REQUEST_ID = '05c8d730-1b2c-4d5e-8f90-123456789abc'

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  })
}

function html(status: number, headers: Record<string, string> = {}) {
  return new Response('<!doctype html><title>502 Bad Gateway</title><h1>Error 1016</h1>', {
    status,
    headers: { 'content-type': 'text/html', ...headers },
  })
}

/** 신호가 끊기 전까지 끝나지 않는 fetch(타임아웃·취소 시험용). 진짜 fetch처럼 이미 끊긴 신호면 바로 실패한다 */
function hangingFetch() {
  return vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const signal = init.signal!
        if (signal.aborted) reject(signal.reason)
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
  )
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('성공하면 안 된다')
}

async function apiFailure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await failure(promise)
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('apiFetch 요청', () => {
  it('/api를 붙여 JSON으로 묻고 쿠키를 함께 보낸다', async () => {
    fetchMock.mockResolvedValue(json({ status: 'ok', db: 'up' }))

    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok', db: 'up' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/health')
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', body: undefined })
    expect(init.headers).toEqual({ Accept: 'application/json' })
  })

  it('앞의 /를 빠뜨려도 같은 경로로 보낸다', async () => {
    fetchMock.mockResolvedValue(json([]))
    await apiFetch('trips?page=2')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/trips?page=2')
  })

  it('body가 있으면 기본 POST + JSON 본문', async () => {
    fetchMock.mockResolvedValue(json({ id: 't1' }, { status: 201 }))

    await expect(apiFetch('/trips', { body: { title: '도쿄' } })).resolves.toEqual({ id: 't1' })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"title":"도쿄"}')
    expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' })
  })

  it('method를 직접 정할 수 있다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(apiFetch('/trips/t1', { method: 'DELETE' })).resolves.toBeUndefined()
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })

  it('GET에 body를 넣으면 보내기 전에 막는다', async () => {
    await expect(apiFetch('/trips', { method: 'GET', body: {} })).rejects.toThrow(TypeError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('빈 본문 성공은 undefined', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await expect(apiFetch('/ping')).resolves.toBeUndefined()
  })
})

describe('apiFetch 서버 에러 매핑', () => {
  it('공통 에러 형식을 그대로 옮긴다', async () => {
    const details = { fields: [{ path: 'title', code: 'maxLength', message: '20자 이하로 적어 주세요' }] }
    fetchMock.mockResolvedValue(
      json(
        { code: 'VALIDATION_FAILED', message: '입력한 내용을 다시 확인해 주세요', details, requestId: REQUEST_ID },
        { status: 400, headers: { 'x-request-id': REQUEST_ID } },
      ),
    )

    const error = await apiFailure(apiFetch('/trips', { body: { title: 'x'.repeat(30) } }))
    expect(error).toMatchObject({
      name: 'ApiError',
      code: 'VALIDATION_FAILED',
      message: '입력한 내용을 다시 확인해 주세요',
      details,
      requestId: REQUEST_ID,
      status: 400,
      retryAfterSec: undefined,
    })
    expect(isApiError(error)).toBe(true)
  })

  it('429는 Retry-After를 초로 담는다', async () => {
    fetchMock.mockResolvedValue(
      json(
        { code: 'RATE_LIMITED', message: ERRORS.RATE_LIMITED.message, requestId: REQUEST_ID },
        { status: 429, headers: { 'retry-after': '42' } },
      ),
    )
    const error = await apiFailure(apiFetch('/health'))
    expect(error).toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfterSec: 42 })
  })

  it('서버 500(INTERNAL_ERROR)도 형식 그대로', async () => {
    fetchMock.mockResolvedValue(
      json({ code: 'INTERNAL_ERROR', message: ERRORS.INTERNAL_ERROR.message, requestId: REQUEST_ID }, { status: 500 }),
    )
    const error = await apiFailure(apiFetch('/health'))
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', status: 500, requestId: REQUEST_ID })
  })

  it('Worker 502(UPSTREAM_UNAVAILABLE)도 형식 그대로', async () => {
    fetchMock.mockResolvedValue(
      json(
        { code: 'UPSTREAM_UNAVAILABLE', message: ERRORS.UPSTREAM_UNAVAILABLE.message, requestId: REQUEST_ID },
        { status: 502, headers: { 'x-request-id': REQUEST_ID } },
      ),
    )
    const error = await apiFailure(apiFetch('/health'))
    expect(error).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', status: 502, requestId: REQUEST_ID })
  })
})

describe('apiFetch 형식 없는 응답', () => {
  it('5xx HTML(Cloudflare 오류 페이지)은 UPSTREAM_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue(html(502))
    const error = await apiFailure(apiFetch('/health'))
    expect(error).toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      message: ERRORS.UPSTREAM_UNAVAILABLE.message,
      status: 502,
      requestId: undefined,
    })
  })

  it('형식이 다른 JSON 5xx(옛 Worker 응답)도 UPSTREAM_UNAVAILABLE, 헤더의 요청 ID는 살린다', async () => {
    fetchMock.mockResolvedValue(
      json({ statusCode: 503, message: 'Service Unavailable' }, { status: 503, headers: { 'x-request-id': REQUEST_ID } }),
    )
    const error = await apiFailure(apiFetch('/health'))
    expect(error).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', status: 503, requestId: REQUEST_ID })
  })

  it('4xx HTML은 INVALID_RESPONSE', async () => {
    fetchMock.mockResolvedValue(html(404))
    const error = await apiFailure(apiFetch('/nope'))
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE', message: ERRORS.INVALID_RESPONSE.message, status: 404 })
  })

  it('성공인데 JSON이 아니면(SPA index.html 등) INVALID_RESPONSE', async () => {
    fetchMock.mockResolvedValue(new Response('<!doctype html><div id="root"></div>', { status: 200 }))
    const error = await apiFailure(apiFetch('/health'))
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE', status: 200 })
  })

  it('HTML 429(Cloudflare rate limit)는 RATE_LIMITED', async () => {
    fetchMock.mockResolvedValue(html(429, { 'retry-after': '10' }))
    const error = await apiFailure(apiFetch('/health'))
    expect(error).toMatchObject({
      code: 'RATE_LIMITED',
      message: ERRORS.RATE_LIMITED.message,
      status: 429,
      retryAfterSec: 10,
    })
  })
})

describe('apiFetch 연결 실패·시간 초과·취소', () => {
  it('fetch가 실패하면 NETWORK_ERROR(status 0), 원인을 cause에 남긴다', async () => {
    const cause = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(cause)

    const error = await apiFailure(apiFetch('/health'))
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0, message: ERRORS.NETWORK_ERROR.message })
    expect(error.cause).toBe(cause)
  })

  it('본문을 읽다 끊겨도 NETWORK_ERROR', async () => {
    const response = new Response('{}', { status: 200 })
    vi.spyOn(response, 'text').mockRejectedValue(new TypeError('network error'))
    fetchMock.mockResolvedValue(response)
    expect(await apiFailure(apiFetch('/health'))).toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('기본 15초가 지나면 TIMEOUT', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(hangingFetch())

    const pending = failure(apiFetch('/health'))
    await vi.advanceTimersByTimeAsync(14_999)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    const error = (await pending) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'TIMEOUT', status: 0, message: ERRORS.TIMEOUT.message })
  })

  it('timeoutMs로 제한 시간을 바꾼다', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(hangingFetch())
    const pending = failure(apiFetch('/health', { timeoutMs: 500 }))
    await vi.advanceTimersByTimeAsync(500)
    expect(await pending).toMatchObject({ code: 'TIMEOUT' })
  })

  it('호출한 쪽이 취소하면 abort 에러를 그대로 던진다(ApiError 아님)', async () => {
    fetchMock.mockImplementation(hangingFetch())
    const controller = new AbortController()

    const pending = failure(apiFetch('/health', { signal: controller.signal }))
    controller.abort()
    const error = await pending

    expect(error).not.toBeInstanceOf(ApiError)
    expect(isAbort(error)).toBe(true)
  })

  it('이미 취소된 신호면 바로 abort', async () => {
    fetchMock.mockImplementation(hangingFetch())
    const error = await failure(apiFetch('/health', { signal: AbortSignal.abort() }))
    expect(isAbort(error)).toBe(true)
  })

  it('응답을 받은 뒤에는 타이머와 취소 연결을 정리한다', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(json({ ok: true }))
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')

    await apiFetch('/health', { signal: controller.signal })

    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})

describe('isAbort', () => {
  it('AbortError만 취소로 본다', () => {
    expect(isAbort(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbort(new DOMException('timeout', 'TimeoutError'))).toBe(false)
    expect(isAbort(new ApiError({ code: 'TIMEOUT', message: 't', status: 0 }))).toBe(false)
    expect(isAbort(null)).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  it('초와 HTTP 날짜를 남은 초로 바꾼다', () => {
    const now = Date.parse('2026-10-28T09:00:00Z')
    expect(parseRetryAfter('120', now)).toBe(120)
    expect(parseRetryAfter('Wed, 28 Oct 2026 09:00:30 GMT', now)).toBe(30)
    expect(parseRetryAfter('Wed, 28 Oct 2026 08:59:00 GMT', now)).toBe(0)
    expect(parseRetryAfter('soon', now)).toBeUndefined()
    expect(parseRetryAfter(null, now)).toBeUndefined()
  })
})
