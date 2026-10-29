import { queryOptions } from '@tanstack/react-query'
import { apiFetch, CONSENT_REQUIRED, isApiError, keys } from '../../api'
import {
  FIN_CONSENT_IDS,
  type ConfirmConnectionRequest,
  type ConfirmConnectionResponse,
  type ConnectionAttemptView,
  type ConnectionCandidate,
  type ConsentDocumentSummary,
  type ConsentStatusResponse,
  type FinConsentId,
  type ManualSyncResponse,
  type PaymentMethodsResponse,
  type SaveConsentsRequest,
  type StartConnectionRequest,
  type StartConnectionResponse,
  type TripFxView,
  type UpdateFxPolicyRequest,
  type UpdateFxPolicyResponse,
} from './types'

// 지갑 플로우 쿼리·뮤테이션. 키는 src/api/keys.ts의 keys.wallet·keys.trips.fx를 쓴다.

/** WF-06 상태 폴링 간격(기능명세 FR-801) */
export const ATTEMPT_POLL_MS = 2000

export const paymentMethodsQuery = () =>
  queryOptions({
    queryKey: keys.wallet.methods,
    queryFn: ({ signal }) => apiFetch<PaymentMethodsResponse>('/payment-methods', { signal }),
  })

export const attemptQuery = (attemptId: string) =>
  queryOptions({
    queryKey: keys.wallet.attempt(attemptId),
    queryFn: ({ signal }) => apiFetch<ConnectionAttemptView>(`/payment-connections/attempts/${attemptId}`, { signal }),
    // 404·410은 화면이 진입 화면으로 돌려보내며 안내한다
    meta: { silent: true },
    staleTime: 0,
  })

export const candidatesQuery = (attemptId: string) =>
  queryOptions({
    queryKey: keys.wallet.candidates(attemptId),
    queryFn: ({ signal }) =>
      apiFetch<ConnectionCandidate[]>(`/payment-connections/attempts/${attemptId}/candidates`, { signal }),
    meta: { silent: true },
    staleTime: Infinity,
  })

/** 환율 화면·지갑 환율 카드. 서버 S2C 계약은 /fx-policy(기능명세 6-3 초안의 /fx와 같은 내용) */
export const tripFxQuery = (tripId: string) =>
  queryOptions({
    queryKey: keys.trips.fx(tripId),
    queryFn: ({ signal }) => apiFetch<TripFxView>(`/trips/${tripId}/fx-policy`, { signal }),
  })

export const finConsentDocumentsQuery = () =>
  queryOptions({
    queryKey: keys.consents.documents('FIN_LINK'),
    queryFn: ({ signal }) => apiFetch<ConsentDocumentSummary[]>('/consents/documents?stage=FIN_LINK', { signal }),
    staleTime: 10 * 60_000,
  })

export const startConnection = (body: StartConnectionRequest) =>
  apiFetch<StartConnectionResponse>('/payment-connections', { body })

export const confirmConnection = (attemptId: string, body: ConfirmConnectionRequest) =>
  apiFetch<ConfirmConnectionResponse>(`/payment-connections/attempts/${attemptId}/confirm`, { body })

export const requestSync = () => apiFetch<ManualSyncResponse>('/payment-methods/sync', { method: 'POST' })

export const removePaymentMethod = (paymentMethodId: string, purgeImported: boolean) =>
  apiFetch<void>(`/payment-methods/${paymentMethodId}${purgeImported ? '?purgeImported=true' : ''}`, { method: 'DELETE' })

export const saveFinConsents = (body: SaveConsentsRequest) => apiFetch<ConsentStatusResponse>('/consents', { body })

export const updateFxPolicy = (tripId: string, body: UpdateFxPolicyRequest) =>
  apiFetch<UpdateFxPolicyResponse>(`/trips/${tripId}/fx-policy`, { method: 'PATCH', body })

/**
 * 403 CONSENT_REQUIRED 중 금융정보 연동 동의(FIN_*)만 빠진 경우 그 ID 목록, 아니면 null.
 * 서버는 details.missing(ConsentId[]) + details.required({ id, version }[])를 준다. missing을 먼저 읽고, 없으면 required의 id.
 * (src/api consentRequiredIds는 required를 문자열 배열로만 읽는다 → 보고서 "중앙 수정 요청")
 */
export function finConsentIds(error: unknown): FinConsentId[] | null {
  if (!isApiError(error) || (error.code as string) !== CONSENT_REQUIRED) return null
  const raw = error.details?.missing ?? error.details?.required
  const ids = (Array.isArray(raw) ? raw : [])
    .map((item: unknown) =>
      typeof item === 'string' ? item : typeof item === 'object' && item !== null ? (item as { id?: unknown }).id : null,
    )
    .filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return [...FIN_CONSENT_IDS]
  const fin = ids.filter((id): id is FinConsentId => (FIN_CONSENT_IDS as readonly string[]).includes(id))
  return fin.length === ids.length ? fin : null
}
