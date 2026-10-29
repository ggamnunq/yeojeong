import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import {
  isValidCardNumber,
  isValidCardPassword,
  type CardImportTwoWayInput,
  type FetchCardApprovalsRequest,
  type ImportWalletEntriesResponse,
  type ImportWalletEntryItem,
  type RevocableConsentId,
} from '@yeojeong/shared'
import { handleApiError, type SessionResponse } from '../../api'
import { sessionQuery } from '../../app/session'
import { invalidateManual } from '../manual/api'
import {
  ackCardLockout,
  cardImportConfigQuery,
  cardImportKeys,
  fetchCardApprovals,
  importWalletEntries,
  revocableConsentsQuery,
  submitCardImportConsent,
  withdrawConsent,
} from './api'
import { cardNumberDigits, CardLoginInputError, type CardLoginRule } from './cardLogin'
import { encryptCardPassword, pinPolicy } from './crypto'

// 카드 승인내역 불러오기(S8) TanStack Query hooks. 화면(W7 pages/)이 쓴다.

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

/**
 * 화면 입력. password·cardPassword는 buildFetchRequest 안에서만 쓰고 돌려주는 요청에는 암호문만 있다.
 * 현대·하나(rule.requiresCardNo)는 cardNumber·cardPassword가 필요하고, 그 밖 카드사에 넣으면 CardLoginInputError(보내지 않는다)
 */
export interface CardLoginInput {
  /** config.publicKey */
  publicKey: string
  organization: string
  loginId: string
  password: string
  from: string
  to: string
  /** 고른 카드사 규칙(config.organizations 항목). 없으면 카드번호 로그인이 아닌 것으로 본다 */
  rule?: CardLoginRule
  /** requiresCardNo 카드사만: 카드번호(공백·하이픈 허용 — 숫자만 보낸다) */
  cardNumber?: string
  /** requiresCardNo 카드사만: 카드 비밀번호(rule.cardPasswordDigits자리) */
  cardPassword?: string
  /**
   * requiresCardNo 카드사만: 409 CARD_LOCK_RISK_CONFIRM_REQUIRED 뒤 화면이 "한 번 더 틀리면 잠길 수 있어요"를 확인받았으면 true.
   * 다른 카드사는 요청에 넣지 않는다
   */
  acknowledgeLockRisk?: boolean
}

/**
 * 화면 입력 → 서버 요청(비밀번호·카드 비밀번호는 암호문으로, 카드번호는 숫자 원문으로). 공개키 지문을 먼저 확인한다(다르면 CardImportKeyPinError).
 * 형식이 틀리면 암호화·전송 전에 CardLoginInputError. 화면은 이 함수를 부르기 전에 입력 state를 비운다(useCardSecrets.take)
 */
export async function buildFetchRequest({
  publicKey,
  password,
  rule,
  cardNumber,
  cardPassword,
  acknowledgeLockRisk,
  ...rest
}: CardLoginInput): Promise<FetchCardApprovalsRequest> {
  const card = cardFields(rule, cardNumber, cardPassword)
  // 공개키 지문 확인은 encryptCardPassword 안에서 한다(우회 불가)
  const encryptedPassword = await encryptCardPassword(publicKey, password)
  if (!card) return { ...rest, encryptedPassword }
  return {
    ...rest,
    encryptedPassword,
    loginCardNo: card.loginCardNo,
    encryptedCardPassword: await encryptCardPassword(publicKey, card.cardPassword),
    ...(acknowledgeLockRisk === true ? { acknowledgeLockRisk: true } : {}),
  }
}

/** 카드번호 로그인 입력 검사(값은 에러에 담지 않는다). 카드번호 로그인이 아니면 null */
function cardFields(rule: CardLoginRule | undefined, cardNumber: string | undefined, cardPassword: string | undefined) {
  if (!rule?.requiresCardNo) {
    if (cardNumber || cardPassword) throw new CardLoginInputError(cardNumber ? 'cardNumber' : 'cardPassword')
    return null
  }
  const loginCardNo = cardNumberDigits(cardNumber ?? '')
  if (!isValidCardNumber(loginCardNo)) throw new CardLoginInputError('cardNumber')
  if (!rule.cardPasswordDigits || !isValidCardPassword(cardPassword ?? '', rule.cardPasswordDigits)) {
    throw new CardLoginInputError('cardPassword')
  }
  return { loginCardNo, cardPassword: cardPassword as string }
}

/**
 * POST /card-import/fetch. TanStack 뮤테이션을 쓰지 않는다 — 뮤테이션 캐시(variables)에 아이디·암호문·인증번호가 남기 때문이다.
 * 요청은 fetchCardApprovals를 바로 부르고, 대기 상태만 useState로 둔다. 결과(OK | TWO_WAY_REQUIRED)는 화면 state로만 든다.
 * - start(request): 화면이 buildFetchRequest로 먼저 암호화한 요청(암호문)만 받는다. 이 hook은 평문 비밀번호를 보지 않는다.
 * - 추가 인증 동안만 처음 요청(아이디·암호문·기간, 현대·하나는 카드번호 원문·카드 비밀번호 암호문)을 ref에 둔다(서버가 무상태라 같은 본문을
 *   다시 보내야 한다). 결과(OK)·실패 응답이면 바로 버리고, 추가 인증(TWO_WAY_REQUIRED)일 때만 남긴다. reset으로도 버린다.
 * - 취소: signal(AbortController)로 진행 중 요청을 끊는다. 서버 쪽 CODEF 호출은 끝까지 갈 수 있고, 화면은 응답을 버린다.
 * 에러 안내는 화면이 한다(토스트 없음, 403 CONSENT_REQUIRED도 화면이 WF-51로). 401만 전역 처리기로 넘긴다. 자동 재시도 없음(카드사 잠금 위험)
 */
export function useFetchCardApprovals() {
  const last = useRef<FetchCardApprovalsRequest | null>(null)
  const [isPending, setPending] = useState(false)
  const send = useCallback(async (request: FetchCardApprovalsRequest, signal?: AbortSignal) => {
    setPending(true)
    try {
      return await fetchCardApprovals(request, signal)
    } catch (error) {
      handleApiError(error, { silent: true, consentHandled: true })
      throw error
    } finally {
      setPending(false)
    }
  }, [])
  /** 새 조회: 암호화된 요청만 보낸다. 추가 인증이 필요할 때만 요청을 기억한다 */
  const start = useCallback(
    async (request: FetchCardApprovalsRequest, signal?: AbortSignal) => {
      last.current = null
      const res = await send(request, signal)
      if (res.status === 'TWO_WAY_REQUIRED') last.current = request
      return res
    },
    [send],
  )
  /** 추가 인증 이어가기: 처음 요청(같은 암호문) + twoWay. 결과를 받으면 기억한 요청을 버린다 */
  const continueTwoWay = useCallback(
    async (twoWay: CardImportTwoWayInput, signal?: AbortSignal) => {
      const request = last.current
      if (!request) throw new Error('처음부터 다시 불러와 주세요')
      const res = await send({ ...request, twoWay }, signal)
      if (res.status === 'OK' && last.current === request) last.current = null
      return res
    },
    [send],
  )
  /** 결과·실패·이탈: 들고 있던 요청(아이디·암호문)을 버린다 */
  const reset = useCallback(() => {
    last.current = null
  }, [])
  return { isPending, start, continueTwoWay, reset }
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

/**
 * HF-57h "확인했어요": 잠김 해제 확인(POST /card-import/lockout/ack, 변수 = 기관 코드만 — 카드 정보 없음).
 * 실패 안내(TOO_EARLY · DAILY_LIMIT · NOT_NEEDED)는 화면이 classifyLockoutAckError로 나눠 보인다. 성공하면 남은 횟수 등 config를 다시 받는다
 */
export function useAckCardLockout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (organization: string) => ackCardLockout(organization),
    meta: { silent: true },
    gcTime: 0,
    onSuccess: () => client.invalidateQueries({ queryKey: cardImportKeys.config }),
  })
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
