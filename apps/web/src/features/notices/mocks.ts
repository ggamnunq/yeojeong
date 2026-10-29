import type { ActiveNoticesResponse } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import { api } from '../../mocks/utils'

// 공지 목(서버 src/notices/notices.ts의 첫 공지와 같은 값). 게시 기간과 상관없이 늘 준다 — 기간 판정은 서버 테스트가 본다
export const MOCK_NOTICES: ActiveNoticesResponse = {
  items: [
    {
      id: 'legal-v1.0-published',
      title: '서비스 이용약관과 개인정보처리방침을 게시했어요',
      url: '/terms',
      startsAt: '2026-10-29T15:00:00.000Z',
      endsAt: '2026-11-28T15:00:00.000Z',
    },
  ],
}

export const handlers: HttpHandler[] = [api.get<ActiveNoticesResponse>('/api/notices/active', () => HttpResponse.json(MOCK_NOTICES))]
