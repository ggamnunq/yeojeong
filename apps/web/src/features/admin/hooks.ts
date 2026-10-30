import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminCreateFeatureGrantRequest, AdminLoginRequest, AdminUserSort, AdminWithdrawUserRequest, FeatureKey } from '@yeojeong/shared'
import { adminApi, adminKeys } from './api'

// 관리자 화면 훅. AdminLayout의 전용 QueryClient 안에서만 쓴다.

export function useAdminSession() {
  return useQuery({ queryKey: adminKeys.session, queryFn: ({ signal }) => adminApi.session(signal), staleTime: 60_000 })
}

export function useAdminLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminLoginRequest) => adminApi.login(body),
    onSuccess: (session) => {
      // 다른 관리자 세션의 캐시가 남지 않게 비우고 새 세션만 넣는다
      client.clear()
      client.setQueryData(adminKeys.session, session)
    },
  })
}

/** 로그아웃. 성공·실패(이미 만료 등)와 무관하게 부르는 쪽이 로그인 화면으로 옮긴 뒤 캐시를 비운다(AdminShell) */
export function useAdminLogout() {
  return useMutation({ mutationFn: () => adminApi.logout() })
}

export function useAdminUsers(q: string, sort: AdminUserSort, { enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    enabled,
    queryKey: adminKeys.users(q, sort),
    queryFn: ({ pageParam, signal }) => adminApi.users({ q: q || undefined, sort, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export function useAdminUser(userId: string) {
  return useQuery({ queryKey: adminKeys.user(userId), queryFn: ({ signal }) => adminApi.user(userId, signal) })
}

export function useAdminWithdraw(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminWithdrawUserRequest) => adminApi.withdraw(userId, body),
    onSuccess: () => {
      client.removeQueries({ queryKey: adminKeys.user(userId) })
      void client.invalidateQueries({ queryKey: adminKeys.usersAll })
      void client.invalidateQueries({ queryKey: adminKeys.codef })
    },
  })
}

/** 기능 권한 표. q가 비면 권한 있는 회원 전부, 닉네임·사용자 ID면 검색 */
export function useAdminFeatureGrants(q: string) {
  return useQuery({ queryKey: adminKeys.featureGrants(q), queryFn: ({ signal }) => adminApi.featureGrants(q, signal) })
}

/** 권한이 바뀌면 권한 표(모든 검색)·회원 목록·그 회원 상세를 다시 읽는다 */
function useFeatureGrantRefresh() {
  const client = useQueryClient()
  return (userId: string) => {
    void client.invalidateQueries({ queryKey: adminKeys.featureGrantsAll })
    void client.invalidateQueries({ queryKey: adminKeys.usersAll })
    void client.invalidateQueries({ queryKey: adminKeys.user(userId) })
  }
}

export function useAdminGrantFeature() {
  const refresh = useFeatureGrantRefresh()
  return useMutation({
    mutationFn: (body: AdminCreateFeatureGrantRequest) => adminApi.grantFeature(body),
    onSettled: (_data, _error, body) => refresh(body.userId),
  })
}

export function useAdminRevokeFeature() {
  const refresh = useFeatureGrantRefresh()
  return useMutation({
    mutationFn: (target: { userId: string; feature: FeatureKey }) => adminApi.revokeFeature(target),
    onSettled: (_data, _error, target) => refresh(target.userId),
  })
}

export function useAdminCodefUsage() {
  return useQuery({ queryKey: adminKeys.codef, queryFn: ({ signal }) => adminApi.codefUsage(signal) })
}
