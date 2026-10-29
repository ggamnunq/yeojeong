import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import type {
  CardImportTwoWayInput,
  FetchCardApprovalsRequest,
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
import { encryptCardPassword, pinPolicy } from './crypto'

// 카드 승인내역 불러오기(S8) TanStack Query hooks. 화면 없이 데이터 계층만 둔다.

/** features.cardImport(GET /auth/session). 값이 없거나 true가 아니면 false(fail closed) */
export function cardImportOf(session: SessionResponse | undefined | null): boolean {
  return session?.features?.cardImport === true
}

/**
 * 지갑의 "카드 내역 불러오기" 진입점을 보일지. 세션 쿼리 캐시만 읽는다.
 * 운영 빌드에 공개키 지문(VITE_CODEF_PUBKEY_SHA256)이 없으면 진입을 막는다(로컬·목은 허용)
 */
export function useCardImportEnabled(): boolean {
  const { data } = useQuery({ ...sessionQuery(), enabled: false })
  return cardImportOf(data) && pinPolicy() !== 'blocked'
}

/** GET /card-import/config. 기능이 꺼져 있으면 부르지 않는다 */
export function useCardImportConfig() {
  const enabled = useCardImportEnabled()
  return useQuery({ ...cardImportConfigQuery(), enabled })
}

/** 화면 입력. password는 buildFetchRequest 안에서만 쓰고 돌려주는 요청에는 암호문만 있다 */
export interface CardLoginInput {
  /** config.publicKey */
  publicKey: string
  organization: string
  loginId: string
  password: string
  from: string
  to: string
}

/**
 * 화면 입력 → 서버 요청(비밀번호는 암호문으로). 공개키 지문을 먼저 확인한다(다르면 CardImportKeyPinError).
 * 화면은 이 함수가 끝나면 비밀번호 입력 상태를 바로 비운다
 */
export async function buildFetchRequest({ publicKey, password, ...rest }: CardLoginInput): Promise<FetchCardApprovalsRequest> {
  // 공개키 지문 확인은 encryptCardPassword 안에서 한다(우회 불가)
  const encryptedPassword = await encryptCardPassword(publicKey, password)
  return { ...rest, encryptedPassword }
}

/**
 * POST /card-import/fetch. 결과(status OK | TWO_WAY_REQUIRED)는 화면 상태로만 들고, 쿼리 캐시에 넣지 않는다.
 * 뮤테이션 variables에는 암호문만 들어간다(평문은 start 안에서 암호화한 뒤 버린다). 추가 인증은 같은 암호문을 다시 쓴다.
 * 에러 안내(로그인 실패·잠김·점검·인증 만료)는 화면이 직접 한다(meta.silent). 자동 재시도 없음(카드사 잠금 위험)
 */
export function useFetchCardApprovals() {
  const last = useRef<FetchCardApprovalsRequest | null>(null)
  const mutation = useMutation<FetchCardApprovalsResponse, Error, FetchCardApprovalsRequest>({
    mutationFn: (request) => fetchCardApprovals(request),
    // 403 CONSENT_REQUIRED도 화면이 처리한다(WF-51로) — 전역 재동의 화면으로 보내지 않는다
    meta: { silent: true, consentHandled: true },
    // 요청 변수(암호문)가 뮤테이션 캐시에 오래 남지 않게 바로 치운다
    gcTime: 0,
  })
  const { mutateAsync, reset: resetMutation } = mutation
  /** 새 조회: 먼저 암호화하고(평문은 여기서 끝) 암호문 요청만 보낸다 */
  const start = useCallback(
    async (input: CardLoginInput) => {
      const request = await buildFetchRequest(input)
      last.current = request
      return mutateAsync(request)
    },
    [mutateAsync],
  )
  /** 추가 인증 이어가기: 처음 요청(같은 암호문) + twoWay */
  const continueTwoWay = useCallback(
    (twoWay: CardImportTwoWayInput) => {
      if (!last.current) return Promise.reject(new Error('처음부터 다시 불러와 주세요'))
      return mutateAsync({ ...last.current, twoWay })
    },
    [mutateAsync],
  )
  /** 화면을 떠나거나 끝나면: 암호문도 버린다 */
  const reset = useCallback(() => {
    last.current = null
    resetMutation()
  }, [resetMutation])
  return { ...mutation, start, continueTwoWay, reset }
}

/** POST /wallet/entries/import → 지갑·여정 결제·내 정보(결제 N건)를 다시 받는다(직접 입력과 같은 무효화) */
export function useImportWalletEntries() {
  const client = useQueryClient()
  return useMutation<ImportWalletEntriesResponse, Error, ImportWalletEntryItem[]>({
    mutationFn: (items) => importWalletEntries({ items }),
    // 실패 안내(만료 다이얼로그·토스트)는 화면이 직접 한다. 결과(저장된 항목)는 캐시에 오래 두지 않는다
    meta: { silent: true },
    gcTime: 0,
    onSuccess: () => invalidateManual(client),
  })
}

/** CARD_IMPORT 동의(config.consent.required[0].version) → config를 다시 받는다 */
export function useCardImportConsent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (version: string) => submitCardImportConsent(version),
    meta: { silent: true },
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
    meta: { silent: true },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cardImportKeys.revocableConsents }),
        client.invalidateQueries({ queryKey: cardImportKeys.config }),
      ]),
  })
}
