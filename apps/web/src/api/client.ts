import { ERRORS, isApiErrorBody, type ApiErrorDetails, type ClientErrorCode, type ErrorCode } from '@yeojeong/shared'

// 화면에서 API를 부르는 유일한 통로. 운영은 같은 origin의 Cloudflare Worker가, 로컬은 Vite 프록시가 /api를 API 서버로 넘긴다.
// 성공은 데이터 그대로, 실패는 어떤 경우든 ApiError 하나로 던진다(사용자가 취소한 abort만 예외 — isAbort).

export const API_BASE = '/api'
export const DEFAULT_TIMEOUT_MS = 15_000
const REQUEST_ID_HEADER = 'x-request-id'

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiFetchOptions = {
  /** 기본: body가 없으면 GET, 있으면 POST */
  method?: HttpMethod
  /** JSON으로 보낼 값. GET·HEAD에는 넣을 수 없다 */
  body?: unknown
  /** 호출한 쪽의 취소 신호(TanStack Query의 queryFn signal 등). 취소되면 abort 에러를 그대로 던진다 */
  signal?: AbortSignal
  /** 응답 본문까지 다 받는 제한 시간. 넘으면 TIMEOUT. 기본 15초 */
  timeoutMs?: number
}

export type ApiErrorInit = {
  code: ErrorCode
  message: string
  status: number
  details?: ApiErrorDetails
  requestId?: string
  retryAfterSec?: number
  cause?: unknown
}

/**
 * API 호출 실패. 서버 형식 응답이면 code·message·details·requestId를 그대로 담고,
 * 화면이 만든 실패(NETWORK_ERROR·TIMEOUT·INVALID_RESPONSE·UPSTREAM_UNAVAILABLE)는 shared의 고정 문구를 담는다.
 * message는 언제나 화면에 그대로 보여도 되는 한국어 한 문장이다.
 */
export class ApiError extends Error {
  /** 분기용 코드. 웹 배포가 늦어 모르는 도메인 코드가 올 수도 있으니 default 분기를 둔다 */
  readonly code: ErrorCode
  /** HTTP status. 응답을 받지 못했으면(네트워크·시간 초과) 0 */
  readonly status: number
  readonly details?: ApiErrorDetails
  /** 서버 로그를 찾는 ID(응답 본문 또는 x-request-id 헤더). 응답이 없으면 undefined */
  readonly requestId?: string
  /** 429의 Retry-After(초) */
  readonly retryAfterSec?: number

  constructor({ code, message, status, details, requestId, retryAfterSec, cause }: ApiErrorInit) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
    this.requestId = requestId
    this.retryAfterSec = retryAfterSec
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * 호출한 쪽이 스스로 취소한 요청(AbortController.abort, 화면 이탈로 TanStack Query가 넘긴 signal의 취소).
 * 사용자에게 알릴 실패가 아니므로 토스트·에러 화면에서 걸러 낸다.
 * (TanStack Query 자체의 CancelledError는 handleApiError가 따로 거른다)
 */
export function isAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { name?: unknown }).name === 'AbortError'
}

function clientError(code: ClientErrorCode, init: Omit<ApiErrorInit, 'code' | 'message'>) {
  return new ApiError({ code, message: ERRORS[code].message, ...init })
}

/** Retry-After: 초(정수) 또는 HTTP 날짜 → 남은 초 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, Math.ceil((at - now) / 1000))
}

function apiUrl(path: string) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/**
 * `/api` + path로 JSON 요청을 보내고 JSON 응답을 돌려준다. 204·빈 본문이면 undefined.
 * 예: apiFetch<HealthResponse>('/health', { signal })
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const method = options.method ?? (body === undefined ? 'GET' : 'POST')
  const hasBody = body !== undefined
  if (hasBody && (method === 'GET' || method === 'HEAD')) {
    throw new TypeError(`${method} 요청에는 body를 넣을 수 없습니다`)
  }

  // 시간 초과와 호출한 쪽의 취소를 한 신호로 묶는다(AbortSignal.any는 구형 iOS Safari에 없어 직접 잇는다)
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('요청 시간이 초과되었습니다', 'TimeoutError'))
  }, timeoutMs)
  const forwardAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) forwardAbort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (hasBody) headers['Content-Type'] = 'application/json'

  let response: Response
  let text: string
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal: controller.signal,
    })
    // 본문을 다 읽을 때까지 같은 신호와 타이머가 걸려 있다
    text = await response.text()
  } catch (error) {
    if (timedOut) throw clientError('TIMEOUT', { status: 0, cause: error })
    if (signal?.aborted) throw error
    throw clientError('NETWORK_ERROR', { status: 0, cause: error })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }

  const status = response.status
  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined
  const parsed = text === '' ? undefined : parseJson(text)

  if (response.ok) {
    if (parsed === undefined || method === 'HEAD') return undefined as T
    if (!parsed.ok) throw clientError('INVALID_RESPONSE', { status, requestId })
    return parsed.value as T
  }

  const retryAfterSec = parseRetryAfter(response.headers.get('retry-after'))
  if (parsed?.ok && isApiErrorBody(parsed.value)) {
    const { code, message, details, requestId: bodyRequestId } = parsed.value
    throw new ApiError({ code, message, details, status, requestId: bodyRequestId || requestId, retryAfterSec })
  }

  // 약속한 형식이 아닌 실패: Cloudflare 오류 페이지(1xxx·502 HTML), Cloud Run 프런트엔드 503, 프록시 오류 등
  if (status === 429) {
    // Cloudflare rate limit 규칙(Free 플랜)은 응답을 바꿀 수 없어 HTML 429가 온다. 서버 429와 똑같이 다룬다.
    throw new ApiError({ code: 'RATE_LIMITED', message: ERRORS.RATE_LIMITED.message, status, requestId, retryAfterSec })
  }
  throw clientError(status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'INVALID_RESPONSE', { status, requestId, retryAfterSec })
}
