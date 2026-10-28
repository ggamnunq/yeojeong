import { queryOptions } from '@tanstack/react-query'
import { apiFetch, keys, type Me } from '../../api'
import type { DeletionRequestResponse } from './types'

export const meQuery = () =>
  queryOptions({
    queryKey: keys.me,
    queryFn: ({ signal }) => apiFetch<Me>('/users/me', { signal }),
  })

/** POST /api/auth/logout (204) */
export const logout = () => apiFetch<void>('/auth/logout', { method: 'POST' })

export const requestDeletion = () => apiFetch<DeletionRequestResponse>('/users/me/deletion-request', { method: 'POST' })
