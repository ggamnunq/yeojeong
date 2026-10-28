import { ERRORS, isErrorCode } from '@yeojeong/shared'
import { HttpResponse } from 'msw'
import { activeMembership, db, type MockMembership } from './data'

/** 서버 에러 형식({ code, message, details, requestId })으로 응답한다. status·message는 shared ERRORS에 있으면 그 값이 기본 */
export function mockError(code: string, status?: number, details?: Record<string, unknown>, message?: string) {
  const known = isErrorCode(code) ? ERRORS[code] : undefined
  return HttpResponse.json(
    {
      code,
      message: message ?? known?.message ?? '요청을 처리하지 못했어요',
      ...(details && { details }),
      requestId: crypto.randomUUID(),
    },
    { status: status ?? known?.status ?? 400 },
  )
}

/** 로그인 API 앞에서 부른다. 막혀야 하면 에러 응답, 통과면 null */
export function denyUnlessAuthenticated() {
  if (db.session !== 'AUTHENTICATED') return mockError('UNAUTHENTICATED', 401)
  if (db.consentRequired) return mockError('CONSENT_REQUIRED', 403, { required: db.consentRequired }, '약관 동의가 필요해요')
  return null
}

type MemberCheck = { denied: Response; membership?: undefined } | { denied?: undefined; membership: MockMembership }

/** 여정 API 앞에서 부른다. 로그인·활성 멤버가 아니면 에러 응답(비멤버는 404), 통과면 내 멤버십 */
export function requireMember(tripId: string): MemberCheck {
  const denied = denyUnlessAuthenticated()
  if (denied) return { denied }
  const membership = activeMembership(tripId, db.meUserId)
  if (!membership) return { denied: mockError('NOT_FOUND', 404) }
  return { membership }
}
