import { HttpResponse, type HttpHandler } from 'msw'
import { BUILD_ID } from '../../app/buildInfo'
import { api, noContent, type NoContent } from '../../mocks/utils'

// 운영 보조(화면 오류 보고 · 배포된 빌드 확인)의 목. 화면 플로우가 아니라 라우트는 없다.
// - POST /api/client-errors: 받기만 하고 204. 목 E2E는 요청 본문을 Playwright로 본다
// - GET /version.json: localStorage 'yj:mock:buildId'가 있으면 그 값으로(새 버전이 나온 상황), 없으면 이 번들의 빌드 ID
const BUILD_ID_KEY = 'yj:mock:buildId'

function mockLatestBuildId(): string | null {
  try {
    return localStorage.getItem(BUILD_ID_KEY)
  } catch {
    return null
  }
}

export const handlers: HttpHandler[] = [
  api.post<NoContent>('/api/client-errors', () => noContent()),
  api.get<{ buildId: string }>('/version.json', () =>
    HttpResponse.json({ buildId: mockLatestBuildId() ?? BUILD_ID }, { headers: { 'cache-control': 'no-store' } }),
  ),
]
