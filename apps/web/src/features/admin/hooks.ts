import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminCreateCardImportGrantRequest, AdminLoginRequest, AdminUserSort, AdminWithdrawUserRequest } from '@yeojeong/shared'
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

export function useAdminCardImportGrants() {
  return useQuery({ queryKey: adminKeys.cardImportGrants, queryFn: ({ signal }) => adminApi.cardImportGrants(signal) })
}

/** 권한이 바뀌면 권한 목록·회원 목록·그 회원 상세를 다시 읽는다 */
function useCardImportGrantRefresh() {
  const client = useQueryClient()
  return (userId: string) => {
    void client.invalidateQueries({ queryKey: adminKeys.cardImportGrants })
    void client.invalidateQueries({ queryKey: adminKeys.usersAll })
    void client.invalidateQueries({ queryKey: adminKeys.user(userId) })
  }
}

export function useAdminGrantCardImport() {
  const refresh = useCardImportGrantRefresh()
  return useMutation({
    mutationFn: (body: AdminCreateCardImportGrantRequest) => adminApi.grantCardImport(body),
    onSettled: (_data, _error, body) => refresh(body.userId),
  })
}

export function useAdminRevokeCardImport() {
  const refresh = useCardImportGrantRefresh()
  return useMutation({
    mutationFn: (userId: string) => adminApi.revokeCardImport(userId),
    onSettled: (_data, _error, userId) => refresh(userId),
  })
}

export function useAdminCodefUsage() {
  return useQuery({ queryKey: adminKeys.codef, queryFn: ({ signal }) => adminApi.codefUsage(signal) })
}
