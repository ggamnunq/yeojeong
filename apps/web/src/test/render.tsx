import type { QueryClient } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router'
import { ApiProvider, createQueryClient } from '../api'
import { buildRoutes } from '../app/router'
import { ToastHost } from '../notifications'

/** 앱 기본값과 같되 자동 재시도만 끈 클라이언트(실패 테스트가 기다리지 않게) */
export function createTestQueryClient(): QueryClient {
  const client = createQueryClient()
  const defaults = client.getDefaultOptions()
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } })
  return client
}

export type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  /** 시작 주소. 기본 / */
  route?: string
  /** 주면 이 패턴의 Route로 감싸 useParams가 동작한다. 예: '/trips/:tripId/payments' */
  path?: string
  queryClient?: QueryClient
}

/** 컴포넌트 하나를 QueryClient + MemoryRouter + ToastHost 안에서 그린다 */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const { route = '/', path, queryClient = createTestQueryClient(), ...rest } = options
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {path ? (
          <Routes>
            <Route path={path} element={children} />
          </Routes>
        ) : (
          children
        )}
      </MemoryRouter>
      <ToastHost aboveNav={false} />
    </ApiProvider>
  )
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...rest }) }
}

/** 실제 앱 라우트 전체(가드·셸 포함)를 주소 하나로 연다. router.state.location으로 이동 결과를 본다 */
export function renderApp(route = '/', options: { queryClient?: QueryClient } = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient()
  const router = createMemoryRouter(buildRoutes(), { initialEntries: [route] })
  const result = render(
    <ApiProvider client={queryClient}>
      <RouterProvider router={router} />
    </ApiProvider>,
  )
  return { router, queryClient, ...result }
}
