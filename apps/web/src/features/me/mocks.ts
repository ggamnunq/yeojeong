import type { HttpHandler } from 'msw'
import { db } from '../../mocks/data'
import { api, mockError, noContent, type NoContent } from '../../mocks/utils'

// 마이페이지·탈퇴 목. GET /users/me는 core 목, POST /auth/logout은 auth 목이 준다.
// 이메일 탈퇴(로그인할 수 없는 회원)는 운영자가 관리자 페이지로 처리해 앱 API가 없다.
export const handlers: HttpHandler[] = [
  // 앱 안 탈퇴(FR-109, HF-59). 재동의 전에도 부를 수 있다. 성공하면 세션이 끝난다(서버가 쿠키를 지운다)
  api.delete<NoContent>('/api/users/me', async ({ request }) => {
    if (db.session !== 'AUTHENTICATED') return mockError('UNAUTHENTICATED', 401)
    const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null
    if (body?.confirm !== true) return mockError('VALIDATION_FAILED', 400)
    db.session = 'ANONYMOUS'
    db.consentRequired = null
    return noContent()
  }),
]
