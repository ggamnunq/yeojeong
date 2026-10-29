import {
  CONSENT_DEFINITIONS,
  CONSENT_ID_VALUES,
  normalizeNickname,
  SIGNUP_REQUIRED_CONSENTS,
  type ConsentId,
} from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import type { SignupResponse } from '@yeojeong/shared'
import { safeReturnTo } from '../../app/paths'
import { db, meOf } from '../../mocks/data'
import { api, mockError, noContent, type NoContent } from '../../mocks/utils'
import type {
  ConsentAgreement,
  ConsentDocument,
  MockKakaoResponse,
  ReconsentRequest,
  SignupRequest,
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
const SIGNUP_RETURN_TO_KEY = 'yj:mock:signupReturnTo'

function persistSession() {
  try {
    localStorage.setItem(SESSION_KEY, db.session)
    if (db.signupReturnTo) localStorage.setItem(SIGNUP_RETURN_TO_KEY, db.signupReturnTo)
    else localStorage.removeItem(SIGNUP_RETURN_TO_KEY)
  } catch {
    // 저장소가 없는 환경
  }
}

try {
  const reconsent = localStorage.getItem('yj:mock:reconsent')
  if (reconsent) {
    db.consentRequired = reconsent
      .split(',')
      .filter((id): id is ConsentId => (CONSENT_ID_VALUES as readonly string[]).includes(id))
  }
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
  const result = normalizeNickname(input)
  if (result.ok) return null
  return {
    code: result.reason,
    message:
      result.reason === 'INVALID_CHARACTER'
        ? '닉네임에 쓸 수 없는 문자가 있어요'
        : result.reason === 'TOO_LONG'
          ? '닉네임은 10자까지 쓸 수 있어요'
          : '닉네임을 입력해 주세요',
  }
}

export const handlers: HttpHandler[] = [
  api.get<ConsentDocument[]>('/api/consents/documents', ({ request }) => {
    const stage = new URL(request.url).searchParams.get('stage')
    if (stage !== 'SIGNUP' && stage !== 'FIN_LINK') {
      return mockError('VALIDATION_FAILED', 400, {
        fields: [{ path: 'stage', code: 'isIn', message: '동의 단계가 올바르지 않아요' }],
      })
    }
    return HttpResponse.json(mockConsentDocuments(stage))
  }),

  // 실제 서버는 302로 카카오 인가 페이지에 보낸다. 목 모드 화면은 fetch로 불러 로그인 + 콜백 결과만 받는다
  api.get<MockKakaoResponse>('/api/auth/kakao', ({ request }) => {
    let existing = false
    try {
      existing = localStorage.getItem('yj:mock:kakao') === 'existing'
    } catch {
      // 저장소가 없는 환경
    }
    // 서버와 같다: 로그인 시작 때 받은 returnTo를 거른다. 기존 회원은 그곳으로 302, 신규 회원은 가입 대기에 담고 302 /signup/nickname
    const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'))
    db.session = existing ? 'AUTHENTICATED' : 'SIGNUP_REQUIRED'
    db.signupReturnTo = existing ? null : returnTo
    persistSession()
    const body: MockKakaoResponse = { redirect: existing ? (returnTo ?? '/') : '/signup/nickname' }
    return HttpResponse.json(body)
  }),

  api.post<SignupResponse, SignupRequest>('/api/auth/signup', async ({ request }) => {
    if (db.session !== 'SIGNUP_REQUIRED') {
      return mockError('UNAUTHENTICATED', 401, undefined, '가입 시간이 지났어요. 다시 로그인해 주세요')
    }
    const body: Partial<SignupRequest> = await request.json()
    const problem = nicknameProblem(body.nickname)
    if (problem) return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'nickname', ...problem }] })
    if (!agreedAll(body.agreements, SIGNUP_REQUIRED_CONSENTS)) return mockError('TERMS_REQUIRED', 400)

    const id = `user-new-${db.users.length + 1}`
    db.users.push({ id, nickname: String(body.nickname).trim(), profileImageUrl: null })
    db.meUserId = id
    db.lastViewedTripId = null
    db.session = 'AUTHENTICATED'
    // 가입을 마친 뒤 갈 곳(가입 대기에 담긴 returnTo). 응답에 싣고 가입 대기와 함께 지운다
    const returnTo = db.signupReturnTo
    db.signupReturnTo = null
    persistSession()
    const result: SignupResponse = { ...meOf(id), returnTo }
    return HttpResponse.json(result, { status: 201 })
  }),

  api.post<NoContent, ReconsentRequest>('/api/auth/reconsent', async ({ request }) => {
    if (db.session !== 'AUTHENTICATED') return mockError('UNAUTHENTICATED', 401)
    const body: Partial<ReconsentRequest> = await request.json()
    const required = db.consentRequired?.length ? db.consentRequired : SIGNUP_REQUIRED_CONSENTS
    if (!agreedAll(body.agreements, required)) return mockError('TERMS_REQUIRED', 400)
    db.consentRequired = null
    try {
      localStorage.removeItem('yj:mock:reconsent')
    } catch {
      // 저장소가 없는 환경
    }
    return noContent()
  }),

  api.post<NoContent>('/api/auth/logout', () => {
    db.session = 'ANONYMOUS'
    db.signupReturnTo = null
    db.consentRequired = null
    persistSession()
    return noContent()
  }),

]
