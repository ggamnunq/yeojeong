import { ERRORS, type ApiErrorBody, type ConsentRequiredDetails, type ErrorCode } from '@yeojeong/shared'
import { http, HttpResponse, type DefaultBodyType, type HttpHandler, type HttpResponseResolver, type PathParams } from 'msw'
import { activeMembership, db, type MockMembership } from './data'

/**
 * 에러 응답. 본문 타입을 never로 두어 어느 계약 핸들러(api.*)에서든 돌려줄 수 있다.
 * 성공 응답은 핸들러의 Res 타입 검사를 받고, 에러는 이 함수로만 만든다.
 */
export type MockErrorResponse = HttpResponse<never>

/** 서버 에러 형식({ code, message, details, requestId })으로 응답한다. status·message는 shared ERRORS의 값이 기본 */
export function mockError(
  code: ErrorCode,
  status?: number,
  details?: ApiErrorBody['details'],
  message?: string,
): MockErrorResponse {
  const known = ERRORS[code]
  const body: ApiErrorBody = {
    code,
    message: message ?? known.message,
    ...(details && { details }),
    requestId: crypto.randomUUID(),
  }
  return HttpResponse.json(body, { status: status ?? known.status }) as unknown as MockErrorResponse
}

/** 본문 없는 성공(204). 계약 핸들러의 Res는 NoContent로 둔다 */
export type NoContent = undefined
export const noContent = () => new HttpResponse(null, { status: 204 })

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

declare const contractMissing: unique symbol
/** Res를 빼먹었을 때의 기본값. 어떤 응답 본문도 이 타입이 될 수 없어 컴파일 에러가 난다 */
type ContractTypeRequired = { readonly [contractMissing]: true }

function contract<M extends Method>(method: M) {
  return <Res extends DefaultBodyType = ContractTypeRequired, Req extends DefaultBodyType = DefaultBodyType>(
    path: string,
    resolver: HttpResponseResolver<PathParams, Req, NoInfer<Res>>,
  ): HttpHandler => http[method]<PathParams, Req, Res>(path, resolver)
}

/**
 * 응답 본문을 @yeojeong/shared 계약 타입으로 고정한 MSW 핸들러(목과 서버가 다시 어긋나지 않게).
 * `api.get<TripDetailResponse>('/api/trips/:tripId', …)` — 성공 응답 HttpResponse.json(…)이 Res와 다르면 컴파일 에러.
 * Res를 빼먹으면 성공 응답을 돌려줄 수 없다. 요청 본문 타입은 두 번째 인자(Req), 204는 Res = NoContent.
 * 목 핸들러는 http.* 대신 반드시 이것을 쓴다(mocks.test.ts가 검사).
 */
export const api = {
  get: contract('get'),
  post: contract('post'),
  put: contract('put'),
  patch: contract('patch'),
  delete: contract('delete'),
}

/** 로그인 API 앞에서 부른다. 막혀야 하면 에러 응답, 통과면 null */
export function denyUnlessAuthenticated(): MockErrorResponse | null {
  if (db.session !== 'AUTHENTICATED') return mockError('UNAUTHENTICATED', 401)
  if (db.consentRequired) {
    const details: ConsentRequiredDetails = {
      missing: db.consentRequired,
      required: db.consentRequired.map((id) => ({ id, version: '0.1-draft' })),
    }
    return mockError('CONSENT_REQUIRED', 403, details, '약관 동의가 필요해요')
  }
  return null
}

type MemberCheck = { denied: MockErrorResponse; membership?: undefined } | { denied?: undefined; membership: MockMembership }

/** 여정 API 앞에서 부른다. 로그인·활성 멤버가 아니면 에러 응답(비멤버는 404), 통과면 내 멤버십 */
export function requireMember(tripId: string): MemberCheck {
  const denied = denyUnlessAuthenticated()
  if (denied) return { denied }
  const membership = activeMembership(tripId, db.meUserId)
  if (!membership) return { denied: mockError('NOT_FOUND', 404) }
  return { membership }
}
