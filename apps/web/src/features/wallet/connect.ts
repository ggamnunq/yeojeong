import { paths, safeReturnTo } from '../../app/paths'
import { TOSS_AUTH_WINDOW_NAME } from '../auth/browser'
import type { AttemptPurpose, ConfirmConnectionResponse } from './types'

// 토스 연결 흐름(WF-06 → 07 → 08)이 화면 사이에 넘기는 값. 가입(SIGNUP)·추가(WALLET_ADD)·재연결(RECONNECT) 공용.
//
// 다른 플로우에서 연결을 시작할 때(예: 결제내역 만료 배너):
//   const connect = useTossConnect()                                        // useTossConnect.ts
//   connect.start({ purpose: 'RECONNECT', reconnectConnectionId, from: '/trips/…/payments', returnTo: '/trips/…/payments' })
// 직접 POST /payment-connections를 부른다면(W3A 가입 시트처럼) WF-06으로 location.state = ConnectHandoffState를 넘긴다.
//   navigate(connectPath('toss', attemptId, { returnTo }), { state: { authUrl, purpose, from } })

/** 토스 인증 창 이름. 인증이 끝나 우리 주소로 돌아온 창이 스스로 닫는 데 쓴다 */
export const TOSS_WINDOW_NAME = TOSS_AUTH_WINDOW_NAME

export type ConnectStep = 'toss' | 'select' | 'done'

const STEP_PATH = {
  toss: paths.walletConnectToss,
  select: paths.walletConnectSelect,
  done: paths.walletConnectDone,
} satisfies Record<ConnectStep, (attemptId: string) => string>

/** /wallet/connect/{step}?attempt=…(&returnTo=…) */
export function connectPath(step: ConnectStep, attemptId: string, options: { returnTo?: string | null } = {}) {
  const returnTo = safeReturnTo(options.returnTo)
  const base = STEP_PATH[step](attemptId)
  return returnTo ? `${base}&returnTo=${encodeURIComponent(returnTo)}` : base
}

/** WF-05b·지갑 → WF-06 location.state(W3A ConnectHandoffState와 같은 모양) */
export type ConnectHandoffState = { authUrl: string; purpose: AttemptPurpose; from: string }

export function readHandoff(state: unknown): ConnectHandoffState | null {
  if (typeof state !== 'object' || state === null) return null
  const { authUrl, purpose, from } = state as Partial<ConnectHandoffState>
  if (typeof authUrl !== 'string' || typeof purpose !== 'string' || typeof from !== 'string') return null
  return { authUrl, purpose, from: safeReturnTo(from) ?? originPath(purpose) }
}

/** 연결을 시작한 화면(✕ · 실패 때 돌아갈 곳). from을 모르면 가입은 /signup/wallet, 나머지는 /wallet */
export const originPath = (purpose: AttemptPurpose | undefined, from?: string | null) =>
  safeReturnTo(from) ?? (purpose === 'SIGNUP' ? paths.signupWallet() : paths.wallet())

/** 연결이 끝난 뒤 갈 곳. 가입은 진입 라우팅(/), 나머지는 지갑 */
export const finishPath = (purpose: AttemptPurpose | undefined, returnTo: string | null) =>
  returnTo ?? (purpose === 'SIGNUP' ? paths.splash() : paths.wallet())

// ── 시도 문맥(이 탭 sessionStorage) ─────────────────────────────

export type AttemptContext = {
  purpose?: AttemptPurpose
  authUrl?: string
  /** ✕ · 실패 때 돌아갈 화면 */
  from?: string
  /** RECONNECT "다시 연결"에 다시 쓴다 */
  reconnectConnectionId?: string
  /** 인증 창을 이미 한 번 열었다(다시 열기는 버튼으로만) */
  opened?: boolean
  /** WF-08 "계좌 1 · 카드 2" */
  result?: ConfirmConnectionResponse
}

const contextKey = (attemptId: string) => `yj:wallet:attempt:${attemptId}`

export function readAttemptContext(attemptId: string): AttemptContext {
  try {
    const raw = sessionStorage.getItem(contextKey(attemptId))
    return raw ? (JSON.parse(raw) as AttemptContext) : {}
  } catch {
    return {}
  }
}

export function writeAttemptContext(attemptId: string, patch: AttemptContext) {
  try {
    sessionStorage.setItem(contextKey(attemptId), JSON.stringify({ ...readAttemptContext(attemptId), ...patch }))
  } catch {
    // 저장소를 못 쓰면 화면 사이 값만 잃는다(다시 열기 버튼·완료 개수 숨김)
  }
}

// ── 바깥 창 ──────────────────────────────────────────────────────

/** 테스트에서 바꿔 끼운다(vi.spyOn(external, 'openWindow')) */
export const external = {
  /** 새 창으로 연다. 팝업이 막히면 false */
  openWindow(url: string, name: string): boolean {
    return window.open(url, name) !== null
  },
  /** 지금 창을 옮긴다(팝업이 막혔을 때 · mailto) */
  assign(url: string) {
    window.location.assign(url)
  },
  /** 우리가 연 인증 창이면 닫는다. 닫았으면 true */
  closeIfAuthWindow(): boolean {
    if (window.name !== TOSS_WINDOW_NAME) return false
    window.name = ''
    window.close()
    return window.closed
  },
}

/** 인증 주소를 새 창으로, 막히면 지금 창으로 연다(「토스 다시 열기」 등 사용자 동작 안에서) */
export function openTossAuth(authUrl: string) {
  if (!external.openWindow(authUrl, TOSS_WINDOW_NAME)) external.assign(authUrl)
}

/** 동의 시트(UserConsent.screen)는 목적에 따라 */
export const consentScreenOf = (purpose: AttemptPurpose) =>
  purpose === 'SIGNUP' ? 'WF-05' : purpose === 'RECONNECT' ? 'WF-42' : 'WF-28'
