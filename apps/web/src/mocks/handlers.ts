import type { HttpHandler } from 'msw'

// 플로우별 목 핸들러는 features/<flow>/mocks.ts의 `handlers`를 모은다. 이 파일은 고치지 않는다.
const modules = import.meta.glob<{ handlers: HttpHandler[] }>('../features/*/mocks.ts', { eager: true })

export const handlers: HttpHandler[] = Object.keys(modules)
  .sort()
  .flatMap((file) => modules[file].handlers)
