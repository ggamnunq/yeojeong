import { ERRORS, isErrorCode } from '@yeojeong/shared'
import { isApiError } from './client'

// 에러를 사용자 문구로 바꾸는 곳. 서버 message가 있으면 그것을 쓰고, 없으면 코드별 기본 문구를 쓴다.
// 화면 전용 코드(NETWORK_ERROR·TIMEOUT·INVALID_RESPONSE·UPSTREAM_UNAVAILABLE)의 고정 문구는
// shared의 CLIENT_ERRORS에 한 번만 적는다. Worker의 502 응답도 같은 문구를 쓰고, apiFetch가 ApiError.message에 넣어 준다.

export const COPY = {
  /** 코드도 메시지도 모를 때 */
  fallback: '문제가 생겼어요. 잠시 후 다시 시도해 주세요',
  retry: '다시 시도',
  rateLimitedWithWait: (wait: string) => `요청이 너무 많아요. ${wait} 뒤에 다시 시도해 주세요`,
  requestId: (shortId: string) => `문의 번호 ${shortId}`,
  boundaryTitle: '문제가 생겼어요',
  boundaryMessage: '잠시 후 다시 시도해 주세요',
  chunkTitle: '새 버전이 나왔어요',
  chunkMessage: '화면을 새로 불러오면 이어서 쓸 수 있어요',
  reload: '새로고침',
} as const

/** 화면에 보여 줄 한 문장. ApiError면 서버(또는 화면 전용 코드의 고정) 문구, 아니면 공통 문구 */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.message) return error.message
    if (isErrorCode(error.code)) return ERRORS[error.code].message
  }
  return COPY.fallback
}

/** 요청 ID 앞 8자(UUID 첫 묶음). 문의할 때 읽어 주기 쉬운 길이 */
export function shortRequestId(requestId: string): string {
  return requestId.slice(0, 8)
}

/** "메시지 (문의 번호 05c8d730)" */
export function withRequestId(message: string, requestId: string | undefined): string {
  return requestId ? `${message} (${COPY.requestId(shortRequestId(requestId))})` : message
}

/** 30 → "30초", 90 → "2분" */
export function formatWait(seconds: number): string {
  return seconds < 60 ? `${Math.max(1, Math.ceil(seconds))}초` : `${Math.ceil(seconds / 60)}분`
}

/** RATE_LIMITED 문구. Retry-After가 있으면 기다릴 시간을 넣는다 */
export function rateLimitMessage(error: unknown): string {
  if (isApiError(error) && error.retryAfterSec !== undefined && error.retryAfterSec > 0) {
    return COPY.rateLimitedWithWait(formatWait(error.retryAfterSec))
  }
  return isApiError(error) && error.message ? error.message : ERRORS.RATE_LIMITED.message
}
