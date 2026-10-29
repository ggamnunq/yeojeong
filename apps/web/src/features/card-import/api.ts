import { queryOptions } from '@tanstack/react-query'
import {
  CARD_IMPORT_FETCH_TIMEOUT_MS,
  type CardImportConfig,
  type ConsentStatusResponse,
  type ConsentSubmitRequest,
  type FetchCardApprovalsRequest,
  type FetchCardApprovalsResponse,
  type ImportWalletEntriesRequest,
  type ImportWalletEntriesResponse,
  type RevocableConsent,
  type RevocableConsentId,
} from '@yeojeong/shared'
import { apiFetch, keys } from '../../api'

// 카드 승인내역 불러오기(S8) API 클라이언트. 화면(W7)은 routes.tsx · pages/ · steps.tsx.
// 서버 계약: apps/api/src/card-import/README.md. 키는 keys.wallet.all 아래(지갑을 바꾸면 같이 무효화된다).

export const cardImportKeys = {
  /** GET /card-import/config */
  config: [...keys.wallet.all, 'card-import', 'config'] as const,
  /** GET /consents/revocable(HF-58 동의 관리) */
  revocableConsents: ['consents', 'revocable'] as const,
}

/** GET /card-import/config — 공개키·카드사·기간 상한·기본 기간·동의 상태. 꺼진 사용자는 404(화면은 진입점을 숨겨 두므로 조용히) */
export const cardImportConfigQuery = () =>
  queryOptions({
    queryKey: cardImportKeys.config,
    queryFn: ({ signal }) => apiFetch<CardImportConfig>('/card-import/config', { signal }),
    meta: { silent: true },
    // 기본 기간(진행 중 여정)·동의 상태가 바뀔 수 있어 오래 두지 않는다
    staleTime: 60_000,
  })

/**
 * POST /card-import/fetch — 저장하지 않는 조회. 카드사 조회가 오래 걸려 제한 시간을 늘린다.
 * 본문(아이디·암호문)은 이 호출의 인자로만 쓰고 어디에도 남기지 않는다
 */
export const fetchCardApprovals = (body: FetchCardApprovalsRequest, signal?: AbortSignal) =>
  apiFetch<FetchCardApprovalsResponse>('/card-import/fetch', {
    body,
    signal,
    timeoutMs: CARD_IMPORT_FETCH_TIMEOUT_MS,
  })

/** POST /wallet/entries/import — 고른 것만 지갑에 저장. importKey 기준이라 다시 보내도 안전하다 */
export const importWalletEntries = (body: ImportWalletEntriesRequest) =>
  apiFetch<ImportWalletEntriesResponse>('/wallet/entries/import', { body })

/** POST /consents (stage CARD_IMPORT, 화면 HF-51) — 불러오기 전 최초 1회 동의 */
export const submitCardImportConsent = (version: string) => {
  const body: ConsentSubmitRequest = {
    stage: 'CARD_IMPORT',
    screen: 'HF-51',
    method: 'INDIVIDUAL',
    agreements: [{ consentId: 'CARD_IMPORT', version, agreed: true }],
  }
  return apiFetch<ConsentStatusResponse>('/consents', { body })
}

/** GET /consents/revocable — 철회할 수 있는(지금 유효하게 동의한) 항목 */
export const revocableConsentsQuery = () =>
  queryOptions({
    queryKey: cardImportKeys.revocableConsents,
    queryFn: ({ signal }) => apiFetch<RevocableConsent[]>('/consents/revocable', { signal }),
  })

/** POST /consents/:consentId/withdraw — 204. 저장한 지갑 항목은 그대로 남는다 */
export const withdrawConsent = (consentId: RevocableConsentId) =>
  apiFetch<void>(`/consents/${consentId}/withdraw`, { method: 'POST' })
