import type {
  AdminCodefUsage,
  AdminCreateFeatureGrantRequest,
  AdminFeatureGrantList,
  AdminFeatureGrantRow,
  AdminLoginRequest,
  AdminSessionView,
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserSort,
  AdminWithdrawUserRequest,
  AdminWithdrawUserResponse,
  FeatureKey,
} from '@yeojeong/shared'
import { apiFetch, isApiError } from '../../api'

// 관리자 API(/api/admin/*). 전송은 apiFetch를 같이 쓰지만, 쿼리는 앱 QueryClient가 아니라 AdminLayout의 전용 QueryClient에서 돈다
// (앱 전역 처리기의 401 → 카카오 로그인 이동·토스트를 타지 않게). 서버 계약: apps/api/src/admin/README.md

export type AdminUserListParams = { q?: string; sort: AdminUserSort; cursor?: string }

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const adminApi = {
  session: (signal?: AbortSignal) => apiFetch<AdminSessionView>('/admin/session', { signal }),
  login: (body: AdminLoginRequest) => apiFetch<AdminSessionView>('/admin/login', { method: 'POST', body }),
  logout: () => apiFetch<undefined>('/admin/logout', { method: 'POST' }),
  users: ({ q, sort, cursor }: AdminUserListParams, signal?: AbortSignal) =>
    apiFetch<AdminUserListResponse>(`/admin/users${query({ q, sort, cursor })}`, { signal }),
  user: (userId: string, signal?: AbortSignal) =>
    apiFetch<AdminUserDetail>(`/admin/users/${encodeURIComponent(userId)}`, { signal }),
  withdraw: (userId: string, body: AdminWithdrawUserRequest) =>
    apiFetch<AdminWithdrawUserResponse>(`/admin/users/${encodeURIComponent(userId)}/withdraw`, { method: 'POST', body }),
  codefUsage: (signal?: AbortSignal) => apiFetch<AdminCodefUsage>('/admin/codef-usage', { signal }),
  featureGrants: (q: string, signal?: AbortSignal) => apiFetch<AdminFeatureGrantList>(`/admin/feature-grants${query({ q })}`, { signal }),
  grantFeature: (body: AdminCreateFeatureGrantRequest) => apiFetch<AdminFeatureGrantRow>('/admin/feature-grants', { method: 'POST', body }),
  revokeFeature: ({ userId, feature }: { userId: string; feature: FeatureKey }) =>
    apiFetch<undefined>(`/admin/feature-grants/${encodeURIComponent(userId)}/${encodeURIComponent(feature)}`, { method: 'DELETE' }),
}

/** 관리자 쿼리 키. 모두 ['admin']으로 시작한다(로그아웃 때 전용 클라이언트를 통째로 비운다) */
export const adminKeys = {
  all: ['admin'] as const,
  session: ['admin', 'session'] as const,
  users: (q: string, sort: AdminUserSort) => ['admin', 'users', { q, sort }] as const,
  usersAll: ['admin', 'users'] as const,
  user: (userId: string) => ['admin', 'user', userId] as const,
  codef: ['admin', 'codef'] as const,
  /** q = 검색어(빈 문자열이면 권한 있는 회원 전부, 회원 상세는 사용자 ID) */
  featureGrants: (q: string) => ['admin', 'feature-grants', { q }] as const,
  featureGrantsAll: ['admin', 'feature-grants'] as const,
}

/** 관리자 세션이 없거나 만료됐다(서버 401 ADMIN_UNAUTHENTICATED) */
export function isAdminUnauthenticated(error: unknown): boolean {
  return isApiError(error) && error.code === 'ADMIN_UNAUTHENTICATED'
}
