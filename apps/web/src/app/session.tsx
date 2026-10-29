import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import {
  apiFetch,
  consentRequiredIds,
  isNoActivePaymentMethod,
  keys,
  onConsentRequired,
  onUnauthenticated,
  resetUnauthenticated,
  type ConsentId,
  type Me,
  type SessionResponse,
} from '../api'
import { connectPrompt } from './connectPrompt'
import { paths, safeReturnTo } from './paths'
import { readSignupReturnTo } from './signupReturnTo'
import { ErrorScreen, LoadingScreen } from './states'

/** 가입 동의(WF-04) 항목. 이 중 하나라도 다시 받아야 하면 /reconsent로 보낸다. 연동 3건은 지갑 화면이 시트로 받는다 */
export const SIGNUP_CONSENTS: readonly ConsentId[] = ['TOS', 'PRIVACY', 'AGE14']

export const sessionQuery = () =>
  queryOptions({
    queryKey: keys.session,
    queryFn: ({ signal }) => apiFetch<SessionResponse>('/auth/session', { signal }),
    staleTime: 5 * 60_000,
    // 가드가 오류 화면을 직접 그린다
    meta: { silent: true },
  })

export type Session = {
  /** 응답 전·실패면 undefined */
  data: SessionResponse | undefined
  isPending: boolean
  error: unknown
  refetch: () => void
  isAuthenticated: boolean
  signupRequired: boolean
  user: Me | null
  /** 세션 확인이 403 CONSENT_REQUIRED면 다시 받아야 할 동의 ID, 아니면 null */
  reconsentRequired: string[] | null
}

export function useSession(): Session {
  const query = useQuery(sessionQuery())
  const legacyRequired = consentRequiredIds(query.error)
  const responseRequired = query.data?.reconsentRequired?.map((requirement) => requirement.id) ?? null
  const reconsentRequired = responseRequired?.length ? responseRequired : legacyRequired
  return {
    data: query.data,
    isPending: query.isPending,
    error: reconsentRequired ? null : query.error,
    refetch: () => void query.refetch(),
    isAuthenticated: query.data?.status === 'AUTHENTICATED' || legacyRequired !== null,
    signupRequired: query.data?.status === 'SIGNUP_REQUIRED',
    user: query.data?.user ?? null,
    reconsentRequired,
  }
}

const currentPath = (location: { pathname: string; search: string }) => `${location.pathname}${location.search}`

function SessionGate({ children }: { children: (session: Session) => ReactNode }) {
  const session = useSession()
  if (session.isPending) return <LoadingScreen />
  if (session.error) return <ErrorScreen error={session.error} onRetry={session.refetch} />
  return children(session)
}

/** 재동의 전에도 열리는 화면: 탈퇴(약관 제3조⑤ — 개정 약관에 동의하지 않아도 로그아웃·탈퇴는 할 수 있다) */
const RECONSENT_FREE_PATHS: readonly string[] = [paths.meWithdraw()]

/** 로그인 필수. 미로그인 → /login?returnTo, 가입 중 → /signup/nickname, 재동의 필요 → /reconsent(탈퇴 화면은 예외) */
export function RequireAuth() {
  const location = useLocation()
  return (
    <SessionGate>
      {(session) => {
        const here = currentPath(location)
        if (session.reconsentRequired && !RECONSENT_FREE_PATHS.includes(location.pathname)) {
          return <Navigate replace to={paths.reconsent(session.reconsentRequired, here)} />
        }
        if (session.signupRequired) return <Navigate replace to={paths.signupNickname()} />
        if (!session.isAuthenticated) return <Navigate replace to={paths.login(here)} />
        return <Outlet />
      }}
    </SessionGate>
  )
}

/** 로그인 안 한 사람만. 로그인 상태면 returnTo 또는 / */
export function RequireGuest() {
  const location = useLocation()
  return (
    <SessionGate>
      {(session) => {
        if (session.signupRequired) return <Navigate replace to={paths.signupNickname()} />
        if (session.isAuthenticated) {
          const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'))
          return <Navigate replace to={returnTo ?? paths.splash()} />
        }
        return <Outlet />
      }}
    </SessionGate>
  )
}

/**
 * 가입 티켓이 있는 사람만(WF-03·04). 미로그인 → /login, 가입 끝남 → /.
 * 가입을 그만두고(WF-03 ‹ = 로그아웃) 로그인으로 가면 돌아올 경로를 다시 붙인다(화면명세 A 머리 v0.5.8)
 */
export function RequireSignup() {
  return (
    <SessionGate>
      {(session) => {
        if (session.signupRequired) return <Outlet />
        if (session.isAuthenticated) return <Navigate replace to={paths.splash()} />
        return <Navigate replace to={paths.login(readSignupReturnTo() ?? undefined)} />
      }}
    </SessionGate>
  )
}

const AUTH_FREE_PATHS = ['/login', '/signup/', '/reconsent']

/**
 * 전역 API 실패를 화면 이동으로 잇는다. 라우터 루트에 하나.
 * - 401: 캐시를 비우고 /login?returnTo=지금 경로
 * - 403 CONSENT_REQUIRED(가입 동의 항목): /reconsent?required=…&returnTo=…
 */
export function SessionBridge() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const session = useQuery({ ...sessionQuery(), enabled: false })
  // 처리기는 한 번만 달고(401 중복 방지 상태가 풀리지 않게) 최신 주소·navigate는 ref로 읽는다
  const latest = useRef({ navigate, location })
  useLayoutEffect(() => {
    latest.current = { navigate, location }
  })

  useEffect(() => {
    const here = () => currentPath(latest.current.location)
    const offAuth = onUnauthenticated(() => {
      queryClient.clear()
      if (AUTH_FREE_PATHS.some((p) => latest.current.location.pathname.startsWith(p))) return
      latest.current.navigate(paths.login(here()), { replace: true })
    })
    const offConsent = onConsentRequired((error, required) => {
      // 재동의 화면은 가입 약관(TOS 등)만. 연동 동의(FIN_*) 누락·결제수단 0개(NO_ACTIVE_PAYMENT_METHOD)는
      // 화면을 그대로 두고 지갑 연결 흐름(동의 시트 또는 계좌·카드 추가)으로 잇는다(화면명세 0-6, v0.5.7)
      const signup = required.some((id) => (SIGNUP_CONSENTS as readonly string[]).includes(id))
      if (!signup && (required.length > 0 || isNoActivePaymentMethod(error))) {
        connectPrompt.open(required)
        return
      }
      const path = latest.current.location.pathname
      if (path === '/reconsent' || RECONSENT_FREE_PATHS.includes(path)) return
      latest.current.navigate(paths.reconsent(required, here()))
    })
    return () => {
      offAuth()
      offConsent()
    }
  }, [queryClient])

  // 다시 로그인했으면 다음 401도 처리한다
  const authenticated = session.data?.status === 'AUTHENTICATED'
  useEffect(() => {
    if (authenticated) resetUnauthenticated()
  }, [authenticated])

  return null
}
