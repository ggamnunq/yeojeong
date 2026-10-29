import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CardImportTwoWayInput,
  FetchCardApprovalsResponse,
  ImportWalletEntriesResponse,
  ImportWalletEntryItem,
  RevocableConsentId,
} from '@yeojeong/shared'
import type { SessionResponse } from '../../api'
import { sessionQuery } from '../../app/session'
import { invalidateManual } from '../manual/api'
import {
  cardImportConfigQuery,
  cardImportKeys,
  fetchCardApprovals,
  importWalletEntries,
  revocableConsentsQuery,
  submitCardImportConsent,
  withdrawConsent,
} from './api'
import { encryptCardPassword } from './crypto'

// 카드 승인내역 불러오기(S8) TanStack Query hooks. 화면 없이 데이터 계층만 둔다.

/** features.cardImport(GET /auth/session). 값이 없거나 true가 아니면 false(fail closed) */
export function cardImportOf(session: SessionResponse | undefined | null): boolean {
  return session?.features?.cardImport === true
}

/** 지갑의 "카드 내역 불러오기" 진입점을 보일지. 세션 쿼리 캐시만 읽는다 */
export function useCardImportEnabled(): boolean {
  const { data } = useQuery({ ...sessionQuery(), enabled: false })
  return cardImportOf(data)
}

/** GET /card-import/config. 기능이 꺼져 있으면 부르지 않는다 */
export function useCardImportConfig() {
  const enabled = useCardImportEnabled()
  return useQuery({ ...cardImportConfigQuery(), enabled })
}

/** 화면 입력 그대로. 평문 비밀번호는 mutationFn 안에서 암호화하고 버린다(캐시·상태에 남기지 않는다) */
export interface FetchCardApprovalsInput {
  /** config.publicKey */
  publicKey: string
  organization: string
  loginId: string
  password: string
  from: string
  to: string
  /** TWO_WAY_REQUIRED 뒤 이어서 보낼 때 */
  twoWay?: CardImportTwoWayInput
}

/**
 * POST /card-import/fetch. 결과(status OK | TWO_WAY_REQUIRED)는 화면 상태로만 들고, 쿼리 캐시에 넣지 않는다.
 * 에러 안내(로그인 실패·잠김·점검·인증 만료)는 화면이 직접 한다(meta.silent). 자동 재시도 없음(카드사 잠금 위험)
 */
export function useFetchCardApprovals() {
  return useMutation<FetchCardApprovalsResponse, Error, FetchCardApprovalsInput>({
    mutationFn: async ({ publicKey, password, ...rest }) => {
      const encryptedPassword = await encryptCardPassword(publicKey, password)
      return fetchCardApprovals({ ...rest, encryptedPassword })
    },
    meta: { silent: true },
    // 실패한 변수(비밀번호 포함)가 뮤테이션 캐시에 오래 남지 않게 바로 치운다
    gcTime: 0,
  })
}

/** POST /wallet/entries/import → 지갑·여정 결제·내 정보(결제 N건)를 다시 받는다(직접 입력과 같은 무효화) */
export function useImportWalletEntries() {
  const client = useQueryClient()
  return useMutation<ImportWalletEntriesResponse, Error, ImportWalletEntryItem[]>({
    mutationFn: (items) => importWalletEntries({ items }),
    onSuccess: () => invalidateManual(client),
  })
}

/** CARD_IMPORT 동의(config.consent.required[0].version) → config를 다시 받는다 */
export function useCardImportConsent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (version: string) => submitCardImportConsent(version),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cardImportKeys.config }),
        client.invalidateQueries({ queryKey: cardImportKeys.revocableConsents }),
      ]),
  })
}

/** HF-58 동의 관리 목록 */
export function useRevocableConsents() {
  return useQuery(revocableConsentsQuery())
}

/** HF-58 철회 → 목록·config(동의 상태)를 다시 받는다 */
export function useWithdrawConsent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (consentId: RevocableConsentId) => withdrawConsent(consentId),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cardImportKeys.revocableConsents }),
        client.invalidateQueries({ queryKey: cardImportKeys.config }),
      ]),
  })
}
