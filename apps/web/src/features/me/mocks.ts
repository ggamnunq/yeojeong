import { HttpResponse, type HttpHandler } from 'msw'
import type { Me, UpdateMeRequest } from '@yeojeong/shared'
import { db, findUser, meOf } from '../../mocks/data'
import { api, denyUnlessAuthenticated, mockError, noContent, type NoContent } from '../../mocks/utils'
import { nicknameProblem } from '../auth/mocks'

// 마이페이지·탈퇴 목. GET /users/me는 core 목, POST /auth/logout은 auth 목이 준다.
// 이메일 탈퇴(로그인할 수 없는 회원)는 운영자가 관리자 페이지로 처리해 앱 API가 없다.
export const handlers: HttpHandler[] = [
  // 내 정보 수정(FR-902, HF-63): 닉네임만. 규칙은 가입과 같고 중복 허용. 멤버 목록은 users를 읽으므로 다른 화면에도 바로 반영된다
  api.patch<Me, UpdateMeRequest>('/api/users/me', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const body = (await request.json().catch(() => null)) as Partial<UpdateMeRequest> | null
    const problem = nicknameProblem(body?.nickname)
    if (problem) return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'nickname', ...problem }] })
    const user = findUser(db.meUserId)
    if (!user) return mockError('UNAUTHENTICATED', 401)
    user.nickname = String(body?.nickname).trim()
    const me: Me = { ...meOf(), walletEntryCount: db.walletEntries.filter((w) => w.userId === db.meUserId).length }
    return HttpResponse.json(me)
  }),
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
