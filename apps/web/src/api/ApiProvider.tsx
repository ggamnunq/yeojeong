import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from './query'

export type ApiProviderProps = {
  children: ReactNode
  /** 테스트에서 따로 만든 클라이언트를 넣을 때. 기본은 createQueryClient() */
  client?: QueryClient
}

/** 앱 맨 바깥(main.tsx)에 한 번 둔다 */
export function ApiProvider({ children, client }: ApiProviderProps) {
  const [queryClient] = useState(() => client ?? createQueryClient())
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
