import { INVITE_CODE_INPUT_MAX_LENGTH, normalizeInviteCode } from '@yeojeong/shared'

// QR·공유 링크(/join?code=…)로 들어온 초대(W8 · HF-62). 앱이 뜨기 전에 코드를 이 탭의 sessionStorage에 옮기고 주소에서 지운다.
// - 주소창·기록·로그인 returnTo(→ 서버 /api/auth/kakao?returnTo=)에 코드가 남지 않는다. 코드는 그룹 참여 권한이다.
// - 카카오 OAuth 왕복·가입 2단계(토스 외부 인증 포함)를 거쳐도 같은 탭이면 남는다(가입 returnTo와 같은 방식).
// - 30분 지나면 버린다. 첫 화면에서 응답 시트를 띄울 때 꺼내면서 바로 지운다(한 번만 쓴다).

const KEY = 'yj:invite:pending'
/** 보관 수명. 로그인·가입을 마치기에 넉넉하고, 같은 기기 다른 사람에게 오래 남지 않을 만큼 */
export const PENDING_INVITE_TTL_MS = 30 * 60_000

type Stored = { code: string; at: number }

/** 응답 시트가 뜨는 첫 화면: 여정 없음(HF-09) 또는 여정 탭(진입 라우팅이 보내는 결제내역·여정 정보 등) */
const LANDING = /^\/trips(?:\/[^/]+\/(?:payments|stats|settlement|info))?\/?$/

export const isInviteLandingPath = (pathname: string) => LANDING.test(pathname)

/** 링크 쿼리 값 → 보관할 글자(대문자 영숫자만, 길이 제한). 형식 검사(6자·문자 집합)는 꺼낼 때 normalizeInviteCode로 */
export function inviteCodeFromLink(raw: string | null | undefined): string | null {
  if (!raw) return null
  const chars = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, INVITE_CODE_INPUT_MAX_LENGTH)
  return chars || null
}

function read(now: number): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Stored> | null
    const code = inviteCodeFromLink(typeof value?.code === 'string' ? value.code : null)
    const at = typeof value?.at === 'number' ? value.at : Number.NaN
    // 만료·깨진 값·미래 시각(시계가 바뀐 경우)은 지운다
    if (!code || !(now - at < PENDING_INVITE_TTL_MS) || at > now + 60_000) {
      sessionStorage.removeItem(KEY)
      return null
    }
    return { code, at }
  } catch {
    return null
  }
}

/** 링크로 받은 코드를 보관한다. 이미 있으면 새 코드로 바꾼다 */
export function rememberPendingInvite(raw: string, now = Date.now()): boolean {
  const code = inviteCodeFromLink(raw)
  if (!code) return false
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ code, at: now } satisfies Stored))
    return true
  } catch {
    return false
  }
}

/** 보관 중인 초대가 있는지(지우지 않는다) — 로그인 화면 안내 한 줄(HF-62b) */
export function hasPendingInvite(now = Date.now()): boolean {
  return read(now) !== null
}

/** 꺼내고 바로 지운다. 없거나 만료면 null */
export function takePendingInvite(now = Date.now()): string | null {
  const value = read(now)
  clearPendingInvite()
  return value?.code ?? null
}

export function clearPendingInvite() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // 저장소를 못 쓰면 남은 것도 없다
  }
}

/**
 * 앱 시작 때 한 번(라우터를 만들기 전): 주소가 /join?code=…면 코드를 보관하고 주소를 /(진입 라우팅)로 바꾼다.
 * 로그인 상태면 첫 화면 위에 응답 시트, 아니면 로그인 → (가입) → 첫 화면에서 같은 시트. 코드가 없거나 /join이 아니면 아무것도 하지 않는다
 */
export function captureInviteLink(
  location: Pick<Location, 'pathname' | 'search'> = window.location,
  history: Pick<History, 'replaceState' | 'state'> = window.history,
  now = Date.now(),
): boolean {
  if (location.pathname.replace(/\/+$/, '') !== '/join') return false
  const params = new URLSearchParams(location.search)
  if (!params.has('code')) return false
  const code = inviteCodeFromLink(params.get('code'))
  // 형식이 틀린 코드도 보관해 첫 화면에서 "초대코드를 다시 확인해 주세요"로 안내한다. 글자가 하나도 없으면 손으로 넣는 화면으로
  if (code) rememberPendingInvite(code, now)
  history.replaceState(null, '', code ? '/' : '/join')
  return true
}

// ── 응답 중인 초대(메모리) ──────────────────────────────────────────
// 첫 화면에서 보관함(sessionStorage)에서 꺼낸 코드를 시트가 닫힐 때까지 여기 둔다. 화면(HF-62 흐름)은 useSyncExternalStore로 읽는다.

let active: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export const activeInvite = {
  get: (): string | null => active,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /**
   * 보관한 코드를 꺼내(보관함에서는 바로 지운다) 응답 중으로 옮긴다. 이미 응답 중이면 그대로.
   * 결과: opened = 형식이 맞는 코드, invalid = 형식이 틀린 코드(버렸다), none = 보관한 것 없음
   */
  activate(now = Date.now()): 'opened' | 'invalid' | 'none' {
    if (active !== null) return 'opened'
    const taken = takePendingInvite(now)
    if (taken === null) return 'none'
    const code = normalizeInviteCode(taken)
    if (!code) return 'invalid'
    active = code
    emit()
    return 'opened'
  },
  clear() {
    if (active === null) return
    active = null
    emit()
  },
}
