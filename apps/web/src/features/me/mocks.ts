import { HttpResponse, type HttpHandler } from 'msw'
import { db } from '../../mocks/data'
import { api, mockError } from '../../mocks/utils'
import type { DeletionRequestResponse } from './types'

// 탈퇴·삭제 요청 코드(FR-108). GET /users/me는 core 목, POST /auth/logout은 auth 목이 준다.
// 고객센터 주소는 미정(미결 Q-35) — 서버 env SUPPORT_EMAIL 임시값과 같게 둔다.
const SUPPORT_EMAIL = 'support@jinyeojeong.com'

export const handlers: HttpHandler[] = [
  // 재동의 전에도 부를 수 있다(서버 @SkipConsentCheck)
  api.post<DeletionRequestResponse>('/api/users/me/deletion-request', () => {
    if (db.session !== 'AUTHENTICATED') return mockError('UNAUTHENTICATED', 401)
    const code = 'YJD-7K2M-Q9XA-4TRP'
    const subject = '[여정] 탈퇴·삭제 요청'
    const body = `요청 코드: ${code}`
    const response: DeletionRequestResponse = {
      code,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      mail: { to: SUPPORT_EMAIL, subject, body },
      mailto: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    }
    return HttpResponse.json(response, { status: 201 })
  }),
]
