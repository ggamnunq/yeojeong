import { queryOptions } from '@tanstack/react-query'
import type { UpdateMeRequest } from '@yeojeong/shared'
import { apiFetch, keys, type Me } from '../../api'

export const meQuery = () =>
  queryOptions({
    queryKey: keys.me,
    queryFn: ({ signal }) => apiFetch<Me>('/users/me', { signal }),
  })

/** POST /api/auth/logout (204) */
export const logout = () => apiFetch<void>('/auth/logout', { method: 'POST' })

/** DELETE /api/users/me { confirm: true } — 204. 서버가 세션 쿠키를 지운다(FR-109) */
export const deleteAccount = () => apiFetch<void>('/users/me', { method: 'DELETE', body: { confirm: true } })

/** PATCH /api/users/me { nickname } — 갱신된 Me(FR-902). 규칙은 가입 닉네임과 같다 */
export const updateMe = (body: UpdateMeRequest) => apiFetch<Me>('/users/me', { method: 'PATCH', body })
