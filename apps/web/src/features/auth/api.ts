import { queryOptions } from '@tanstack/react-query'
import type { SignupResponse } from '@yeojeong/shared'
import { apiFetch, keys, type ConsentStage } from '../../api'
import { safeReturnTo } from '../../app/paths'
import type {
  ConsentDocument,
  ConsentStatusResponse,
  FinConsentRequest,
  MockKakaoResponse,
  ReconsentRequest,
  SignupRequest,
  StartConnectionRequest,
  StartConnectionResponse,
} from './types'

/** GET /api/consents/documents?stage= — 공개. 숨김(MARKETING)도 오니 화면이 거른다 */
export const consentDocumentsQuery = (stage: ConsentStage) =>
  queryOptions({
    queryKey: keys.consents.documents(stage),
    queryFn: ({ signal }) => apiFetch<ConsentDocument[]>(`/consents/documents?stage=${stage}`, { signal }),
    staleTime: 5 * 60_000,
  })

/** 화면에 보일 동의 행: 숨김 제외, 서버 순서 그대로 */
export const visibleConsents = (docs: readonly ConsentDocument[] | undefined) => (docs ?? []).filter((d) => !d.hidden)

/** 전문 링크. 서버 docUrl이 같은 origin 경로일 때만 쓴다 */
export const consentDocHref = (doc: ConsentDocument) => (doc.hasDetail ? safeReturnTo(doc.docUrl) : null)

/** POST /api/auth/signup. 응답 returnTo = 가입을 마친 뒤 갈 곳(없으면 null → 진입 라우팅) */
export const postSignup = (body: SignupRequest) => apiFetch<SignupResponse>('/auth/signup', { body })

export const postReconsent = (body: ReconsentRequest) => apiFetch<void>('/auth/reconsent', { body })

export const postLogout = () => apiFetch<void>('/auth/logout', { method: 'POST' })

export const postFinConsent = (body: FinConsentRequest) => apiFetch<ConsentStatusResponse>('/consents', { body })

export const postConnection = (body: StartConnectionRequest) =>
  apiFetch<StartConnectionResponse>('/payment-connections', { body })

/** 카카오 로그인 시작 주소(서버가 카카오 인가 페이지로 302). returnTo는 같은 origin 경로만 */
export function kakaoStartUrl(returnTo: string | null) {
  const safe = safeReturnTo(returnTo)
  return `/api/auth/kakao${safe ? `?returnTo=${encodeURIComponent(safe)}` : ''}`
}

/** 목 모드 전용. MSW는 최상위 이동(302)을 받지 못하니 같은 주소를 fetch로 불러 로그인·콜백을 흉내 낸다 */
export const mockKakaoLogin = (returnTo: string | null) =>
  apiFetch<MockKakaoResponse>(kakaoStartUrl(returnTo).replace(/^\/api/, ''))

/** 개발 서버 + VITE_MOCK_API=1일 때만 true. 운영 빌드에서는 상수 false라 목 분기가 빠진다 */
export const isMockApi = () => import.meta.env.DEV && import.meta.env.VITE_MOCK_API === '1'
