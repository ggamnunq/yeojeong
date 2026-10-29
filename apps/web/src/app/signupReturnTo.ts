import { safeReturnTo } from './paths'

// 가입 단계 돌아올 경로(화면명세 A 머리 「returnTo 보존」 v0.5.8). 신규 회원도 닉네임 → 약관 → 토스 안내(→ 연결 → 완료)를 모두 거친 뒤
// 로그인 전에 열려던 경로(공유 링크 /join?code=… 등)로 돌아간다.
// 서버가 주는 값: GET /api/auth/session의 signupDraft.returnTo(가입 전) · POST /api/auth/signup 응답 returnTo(가입 직후).
// 토스 외부 인증(WF-06)을 거쳐도 남도록 이 탭의 sessionStorage에 둔다. 같은 origin 상대 경로만 받는다.

const KEY = 'yj:signup:returnTo'

/** 서버 값을 기억한다. null이면 지운다(돌아갈 곳 없음 = 진입 라우팅) */
export function rememberSignupReturnTo(value: string | null | undefined) {
  const safe = safeReturnTo(value)
  try {
    if (safe) sessionStorage.setItem(KEY, safe)
    else sessionStorage.removeItem(KEY)
  } catch {
    // 저장소를 못 쓰면 가입 뒤 진입 라우팅으로 간다
  }
}

/** 기억한 경로(지우지 않는다) */
export function readSignupReturnTo(): string | null {
  try {
    return safeReturnTo(sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}

/** 가입 흐름을 끝낼 때: 꺼내고 지운다 */
export function takeSignupReturnTo(): string | null {
  const value = readSignupReturnTo()
  rememberSignupReturnTo(null)
  return value
}

// ── 가입 흐름 연결 완료 표시(WF-08) ──────────────────────────────
// WF-08에서 브라우저 뒤로 가기를 누르면 그 아래 기록(WF-05 토스 안내)이 나온다. 연결이 끝났다는 표시를 남겨
// WF-05가 다시 열리면 곧바로 「여정으로 가기」와 같은 곳으로 바꾼다(화면명세 WF-08 v0.5.8: 뒤로 가기 = 버튼).

const CONNECTED_KEY = 'yj:signup:connected'

export function markSignupConnected(on: boolean) {
  try {
    if (on) sessionStorage.setItem(CONNECTED_KEY, '1')
    else sessionStorage.removeItem(CONNECTED_KEY)
  } catch {
    // 저장소를 못 쓰면 뒤로 가기가 WF-05로 간다(다시 연결해도 중복으로 생기지 않는다)
  }
}

export function isSignupConnected(): boolean {
  try {
    return sessionStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}
