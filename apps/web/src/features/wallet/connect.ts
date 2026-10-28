import { paths, safeReturnTo } from '../../app/paths'
import type { AttemptPurpose, ConfirmConnectionResponse } from './types'

// 토스 연결 흐름(WF-06 → 07 → 08)이 화면 사이에 넘기는 값. 가입(SIGNUP)·추가(WALLET_ADD)·재연결(RECONNECT) 공용.
//
// 다른 플로우에서 연결을 시작할 때(예: 가입 /signup/wallet, 결제내역 만료 배너):
//   const connect = useTossConnect({ screen: 'WF-05' })   // useTossConnect.tsx
//   connect.start({ purpose: 'SIGNUP', returnTo: '/' })    // 끝나면 returnTo로(없으면 SIGNUP은 진입 라우팅, 나머지는 /wallet)
// 직접 POST /payment-connections를 부른다면 connectPath('toss', attemptId, { returnTo })로 보내면 된다.

/** 토스 인증 창 이름. 인증이 끝나 우리 주소로 돌아온 창이 스스로 닫는 데 쓴다 */
export const TOSS_WINDOW_NAME = 'yj-toss-auth'

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

/** 연결을 시작한 화면(✕ · 실패 · 만료 때 돌아갈 곳) */
export const originPath = (purpose: AttemptPurpose | undefined) =>
  purpose === 'SIGNUP' ? paths.signupWallet() : paths.wallet()

/** 연결이 끝난 뒤 갈 곳. 가입은 진입 라우팅(/), 나머지는 지갑 */
export const finishPath = (purpose: AttemptPurpose | undefined, returnTo: string | null) =>
  returnTo ?? (purpose === 'SIGNUP' ? paths.splash() : paths.wallet())

// ── 시도 문맥(이 탭 sessionStorage) ─────────────────────────────

export type AttemptContext = {
  purpose?: AttemptPurpose
  authUrl?: string
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

/** 인증 주소를 새 창으로, 막히면 지금 창으로 연다 */
export function openTossAuth(authUrl: string) {
  if (!external.openWindow(authUrl, TOSS_WINDOW_NAME)) external.assign(authUrl)
}
