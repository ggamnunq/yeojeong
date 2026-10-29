import { safeReturnTo } from '../../app/paths'

// 관리자 화면 주소. 일반 화면(app/paths.ts)과 섞지 않는다 — 일반 화면 어디서도 관리자 화면으로 링크하지 않는다.

export const ADMIN_BASE = '/admin'

const q = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const adminPaths = {
  home: () => ADMIN_BASE,
  login: (returnTo?: string) => `${ADMIN_BASE}/login${q({ returnTo })}`,
  users: () => `${ADMIN_BASE}/users`,
  user: (userId: string) => `${ADMIN_BASE}/users/${encodeURIComponent(userId)}`,
  codef: () => `${ADMIN_BASE}/codef`,
  cardImport: () => `${ADMIN_BASE}/card-import`,
} as const

/**
 * 관리자 로그인 뒤 돌아갈 주소. 같은 origin의 /admin/… 화면만 받는다(로그인 화면 자신·일반 화면·/api는 막는다).
 */
export function safeAdminReturnTo(value: string | null | undefined): string | null {
  const safe = safeReturnTo(value)
  if (!safe) return null
  const pathname = safe.split(/[?#]/)[0]
  if (!pathname.startsWith(`${ADMIN_BASE}/`)) return null
  if (pathname === `${ADMIN_BASE}/login` || pathname.startsWith(`${ADMIN_BASE}/login/`)) return null
  return safe
}
