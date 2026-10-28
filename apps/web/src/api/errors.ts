import { isCancelledError } from '@tanstack/react-query'
import type { ErrorCode } from '@yeojeong/shared'
import { toast } from '../notifications/store'
import { isAbort, isApiError, type ApiError } from './client'
import { COPY, errorMessage, rateLimitMessage, withRequestId } from './messages'

// 전역 에러 처리기. TanStack Query의 QueryCache·MutationCache onError가 부르고, 화면 코드에서 직접 불러도 된다.
// 코드별로 토스트·로그인 연결·폼 위임을 나눈다. 분기표는 src/api/README.md.

export type ApiErrorContext = {
  /** 있으면 연결·시간 초과·서버 연결 실패 토스트에 「다시 시도」 액션을 붙인다 */
  retry?: () => void
  /** true면 토스트를 띄우지 않는다(쿼리·뮤테이션 meta.silent). 로그인 연결은 그대로 한다 */
  silent?: boolean
}

// ── 로그인이 필요할 때(UNAUTHENTICATED) ─────────────────────────────

export type UnauthenticatedHandler = (error: ApiError) => void

const defaultUnauthenticated: UnauthenticatedHandler = (error) => {
  // 로그인 단계(카카오 로그인 + httpOnly 쿠키)에서 onUnauthenticated로 진짜 처리기를 단다
  if (import.meta.env.DEV) console.info('[api] UNAUTHENTICATED — 아직 로그인 처리기가 없어요', error.requestId)
}

let unauthenticatedHandler = defaultUnauthenticated
let unauthenticatedNotified = false

/**
 * 401(UNAUTHENTICATED)을 받았을 때 부를 처리기를 단다(예: 로그인 화면으로 보내기). 해제 함수를 돌려준다.
 * 여러 요청이 한꺼번에 401을 받아도 한 번만 부른다. 로그인을 마치거나 안내를 닫으면 resetUnauthenticated()를 부른다.
 */
export function onUnauthenticated(handler: UnauthenticatedHandler): () => void {
  unauthenticatedHandler = handler
  unauthenticatedNotified = false
  return () => {
    if (unauthenticatedHandler === handler) unauthenticatedHandler = defaultUnauthenticated
    unauthenticatedNotified = false
  }
}

/** 다음 401에서 처리기를 다시 부르도록 한다 */
export function resetUnauthenticated() {
  unauthenticatedNotified = false
}

function notifyUnauthenticated(error: ApiError) {
  if (unauthenticatedNotified) return
  unauthenticatedNotified = true
  unauthenticatedHandler(error)
}

// ── 코드별 반응 ─────────────────────────────────────────────────────

/** 연결 자체가 안 된 경우. 다시 시도하면 될 수 있다 */
const CONNECTIVITY: ReadonlySet<string> = new Set<ErrorCode>(['NETWORK_ERROR', 'TIMEOUT', 'UPSTREAM_UNAVAILABLE'])
/** 사용자가 잘못한 것은 아니고 상황을 알려 주는 경우 */
const INFO_STATUS: ReadonlySet<number> = new Set([404, 409])

export function handleApiError(error: unknown, ctx: ApiErrorContext = {}): void {
  if (isAbort(error) || isCancelledError(error)) return

  if (!isApiError(error)) {
    // 코드 버그(쿼리 select에서 던진 TypeError 등)
    if (import.meta.env.DEV) console.error(error)
    if (!ctx.silent) toast.error(COPY.fallback, { dedupeKey: `UNKNOWN|${COPY.fallback}` })
    return
  }

  const { code, status } = error
  if (code === 'UNAUTHENTICATED') {
    notifyUnauthenticated(error)
    return
  }
  // 폼이 fieldErrors(error)로 필드 옆에 보여 준다
  if (code === 'VALIDATION_FAILED' || ctx.silent) return

  const show = (type: 'info' | 'error', message: string, retry?: () => void) => {
    toast[type](message, {
      dedupeKey: `${code}|${message}`,
      action: retry && { label: COPY.retry, onClick: retry },
    })
  }

  if (code === 'RATE_LIMITED') {
    show('error', rateLimitMessage(error))
  } else if (CONNECTIVITY.has(code)) {
    show('error', errorMessage(error), ctx.retry)
  } else if (status >= 500 || code === 'INTERNAL_ERROR' || code === 'INVALID_RESPONSE') {
    // 서버 결함이거나 응답을 이해하지 못한 경우: 문의할 때 쓸 요청 ID를 붙인다
    show('error', withRequestId(errorMessage(error), error.requestId))
  } else {
    // FORBIDDEN·NOT_FOUND·CONFLICT와 도메인 4xx: 서버 문구 그대로
    show(INFO_STATUS.has(status) ? 'info' : 'error', errorMessage(error))
  }
}

// ── 폼 ────────────────────────────────────────────────────────────

function validationFields(error: unknown) {
  if (!isApiError(error) || error.code !== 'VALIDATION_FAILED') return []
  const fields = error.details?.fields
  return Array.isArray(fields) ? fields : []
}

/**
 * VALIDATION_FAILED의 details.fields → { [path]: 그 필드의 첫 메시지 }. 검증 실패가 아니면 빈 객체.
 * 필드 순서가 필요하면(첫 필드 포커스) fieldErrorPaths를 쓴다. 객체 키 순서는 숫자 경로에서 바뀔 수 있다.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  for (const { path, message } of validationFields(error)) {
    if (!Object.hasOwn(result, path)) result[path] = message
  }
  return result
}

/** 오류가 있는 필드 경로를 서버가 보낸 순서대로(중복 없이). 첫 필드에 포커스를 줄 때 [0]을 쓴다 */
export function fieldErrorPaths(error: unknown): string[] {
  return [...new Set(validationFields(error).map((f) => f.path))]
}
