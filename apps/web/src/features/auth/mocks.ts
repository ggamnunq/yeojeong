import {
  CONSENT_DEFINITIONS,
  CONSENT_ID_VALUES,
  FIN_LINK_REQUIRED_CONSENTS,
  SIGNUP_REQUIRED_CONSENTS,
  type ConsentId,
} from '@yeojeong/shared'
import { http, HttpResponse, type HttpHandler } from 'msw'
import type { Me } from '../../api'
import { db, findUser } from '../../mocks/data'
import { denyUnlessAuthenticated, mockError } from '../../mocks/utils'
import { graphemeLength, NICKNAME_MAX_LENGTH } from './nickname'
import type {
  ConsentAgreement,
  ConsentDocument,
  FinConsentRequest,
  MockKakaoResponse,
  ReconsentRequest,
  SignupRequest,
  StartConnectionRequest,
  StartConnectionResponse,
} from './types'

// 인증·동의 목. 세션 단계: ANONYMOUS → (카카오) SIGNUP_REQUIRED(닉네임 WF-03 → 약관 WF-04는 화면 상태) → (가입) AUTHENTICATED.
// 개발 서버에서 상태를 새로고침 뒤에도 이어 가도록 localStorage('yj:mock:session')에 남긴다(src/mocks/browser.ts가 읽는다).
// 개발 편의:
//   localStorage.setItem('yj:mock:kakao', 'existing') → 카카오 로그인이 기존 회원(바로 AUTHENTICATED)
//   localStorage.setItem('yj:mock:reconsent', 'TOS,PRIVACY') 후 새로고침 → 세션이 403 CONSENT_REQUIRED(재동의 화면)

export const MOCK_CONSENT_VERSION = '0.1-draft'

/** consents.md 1절 "한 줄 요약"(재동의 화면 제목 아래 한 줄로 쓰는 ConsentDocument.summary) */
const SUMMARY: Partial<Record<ConsentId, string>> = {
  TOS: '서비스 이용 조건, 송금 없음, 정산은 참고 정보',
  PRIVACY: '카카오 회원번호·닉네임·프사로 회원 식별, 그룹 기능 제공',
}

export function mockConsentDocuments(stage: 'SIGNUP' | 'FIN_LINK'): ConsentDocument[] {
  return CONSENT_ID_VALUES.filter((id) => CONSENT_DEFINITIONS[id].stage === stage).map((id) => {
    const def = CONSENT_DEFINITIONS[id]
    return {
      consentId: id,
      title: def.title,
      required: def.required,
      version: MOCK_CONSENT_VERSION,
      docUrl: def.docUrl,
      hasDetail: def.docUrl !== null,
      hidden: def.hidden,
      summary: SUMMARY[id] ?? null,
      isDraft: true,
    }
  })
}

const SESSION_KEY = 'yj:mock:session'

function persistSession() {
  try {
    localStorage.setItem(SESSION_KEY, db.session)
  } catch {
    // 저장소가 없는 환경
  }
}

try {
  const reconsent = localStorage.getItem('yj:mock:reconsent')
  if (reconsent) db.consentRequired = reconsent.split(',').filter(Boolean)
} catch {
  // 저장소가 없는 환경
}

/** 필수 항목이 모두 현재 버전으로 agreed=true인가 */
function agreedAll(agreements: ConsentAgreement[] | undefined, ids: readonly string[]) {
  return ids.every((id) =>
    agreements?.some((a) => a.consentId === id && a.agreed === true && a.version === MOCK_CONSENT_VERSION),
  )
}

/** 서버 normalizeNickname과 같은 규칙(FR-103) */
function nicknameProblem(input: unknown) {
  if (typeof input !== 'string') return { code: 'EMPTY', message: '닉네임을 입력해 주세요' }
  const value = input.trim()
  if (/[\p{Cc}\u2028\u2029]/u.test(value)) return { code: 'INVALID_CHARACTER', message: '닉네임에 쓸 수 없는 문자가 있어요' }
  if (value.length === 0) return { code: 'EMPTY', message: '닉네임을 입력해 주세요' }
  if (graphemeLength(value) > NICKNAME_MAX_LENGTH) return { code: 'TOO_LONG', message: '닉네임은 10자까지 쓸 수 있어요' }
  return null
}

function meOf(userId: string): Me {
  const user = findUser(userId)!
  const methods = db.paymentMethods.filter((p) => p.userId === userId && p.status !== 'REMOVED')
  return {
    id: user.id,
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl,
    paymentMethodCount: methods.length,
    hasExpiredConnection: methods.some((p) => p.status === 'EXPIRED'),
  }
}

let attemptSeq = 0

export const handlers: HttpHandler[] = [
  http.get('/api/consents/documents', ({ request }) => {
    const stage = new URL(request.url).searchParams.get('stage')
    if (stage !== 'SIGNUP' && stage !== 'FIN_LINK') {
      return mockError('VALIDATION_FAILED', 400, {
        fields: [{ path: 'stage', code: 'isIn', message: '동의 단계가 올바르지 않아요' }],
      })
    }
    return HttpResponse.json(mockConsentDocuments(stage))
  }),

  // 실제 서버는 302로 카카오 인가 페이지에 보낸다. 목 모드 화면은 fetch로 불러 로그인 + 콜백 결과만 받는다
  http.get('/api/auth/kakao', ({ request }) => {
    let existing = false
    try {
      existing = localStorage.getItem('yj:mock:kakao') === 'existing'
    } catch {
      // 저장소가 없는 환경
    }
    const returnTo = new URL(request.url).searchParams.get('returnTo')
    db.session = existing ? 'AUTHENTICATED' : 'SIGNUP_REQUIRED'
    persistSession()
    const body: MockKakaoResponse = { redirect: existing ? (returnTo ?? '/') : '/signup/nickname' }
    return HttpResponse.json(body)
  }),

  http.post('/api/auth/signup', async ({ request }) => {
    if (db.session !== 'SIGNUP_REQUIRED') {
      return mockError('UNAUTHENTICATED', 401, undefined, '가입 시간이 지났어요. 다시 로그인해 주세요')
    }
    const body = (await request.json()) as Partial<SignupRequest>
    const problem = nicknameProblem(body.nickname)
    if (problem) return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'nickname', ...problem }] })
    if (!agreedAll(body.agreements, SIGNUP_REQUIRED_CONSENTS)) return mockError('TERMS_REQUIRED', 400)

    const id = `user-new-${db.users.length + 1}`
    db.users.push({ id, nickname: String(body.nickname).trim(), profileImageUrl: null })
    db.meUserId = id
    db.lastViewedTripId = null
    db.session = 'AUTHENTICATED'
    persistSession()
    return HttpResponse.json(meOf(id), { status: 201 })
  }),

  http.post('/api/auth/reconsent', async ({ request }) => {
    if (db.session !== 'AUTHENTICATED') return mockError('UNAUTHENTICATED', 401)
    const body = (await request.json()) as Partial<ReconsentRequest>
    const required = db.consentRequired?.length ? db.consentRequired : SIGNUP_REQUIRED_CONSENTS
    if (!agreedAll(body.agreements, required)) return mockError('TERMS_REQUIRED', 400)
    db.consentRequired = null
    try {
      localStorage.removeItem('yj:mock:reconsent')
    } catch {
      // 저장소가 없는 환경
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/auth/logout', () => {
    db.session = 'ANONYMOUS'
    db.consentRequired = null
    persistSession()
    return new HttpResponse(null, { status: 204 })
  }),

  // 연동 동의 저장(FR-809). 가입 직후 시트(screen WF-05)만 여기서 받고, 지갑(WF-28·42)은 지갑 목으로 넘긴다
  http.post('/api/consents', async ({ request }) => {
    const body = (await request.clone().json()) as Partial<FinConsentRequest>
    if (body.screen !== 'WF-05') return
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    if (body.stage !== 'FIN_LINK' || !agreedAll(body.agreements, FIN_LINK_REQUIRED_CONSENTS)) {
      return mockError('TERMS_REQUIRED', 400)
    }
    return HttpResponse.json({ valid: true, missing: [], required: [] }, { status: 201 })
  }),

  // 토스 연결 시작(FR-801). 가입 흐름(purpose SIGNUP)만 여기서 받고 나머지는 지갑 목으로 넘긴다
  http.post('/api/payment-connections', async ({ request }) => {
    const body = (await request.clone().json()) as Partial<StartConnectionRequest>
    if (body.purpose !== 'SIGNUP') return
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    attemptSeq += 1
    const response: StartConnectionResponse = {
      attemptId: `attempt-signup-${attemptSeq}`,
      authUrl: 'about:blank',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }
    return HttpResponse.json(response, { status: 201 })
  }),
]
