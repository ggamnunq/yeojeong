import { LEGAL_DOCUMENT_VERSIONS, LEGAL_RELEASES, type ActiveNoticesResponse } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import { api } from '../../mocks/utils'

// 공지 목(서버 src/notices/notices.ts와 같은 값 — 게시일·시행일은 legal-manifest). 서버 순서 = 최신부터, 처리방침 0.3 게시일 기준:
// 이용약관·처리방침 시행 예고를 합친 공지(법정 사전 공지)가 먼저, 처리방침 0.2 정정·카드 불러오기 안내가 다음.
// 게시 기간과 상관없이 늘 준다 — 기간 판정은 서버 테스트가 본다
const published = LEGAL_RELEASES.find((r) => r.dir === 'v0.2')!.published
const published03 = LEGAL_RELEASES.find((r) => r.dir === 'v0.3')!.published
const terms02 = LEGAL_DOCUMENT_VERSIONS['terms.md'].find((v) => v.version === '0.2')!
const privacy03 = LEGAL_DOCUMENT_VERSIONS['privacy.md'].find((v) => v.version === '0.3')!
const mmdd = (date: string) => date.slice(5).replace('-', '.')
const utc = (date: string, days = 0) => {
  const d = new Date(`${date}T00:00:00+09:00`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

export const MOCK_NOTICES: ActiveNoticesResponse = {
  items: [
    {
      id: 'legal-v0.3-combined',
      title: `이용약관(${mmdd(terms02.effectiveDate)})·개인정보처리방침(${mmdd(privacy03.effectiveDate)})이 바뀌어요`,
      url: '/privacy?v=0.3',
      startsAt: utc(published03),
      endsAt: utc(terms02.effectiveDate),
    },
    {
      id: 'legal-v0.2-privacy',
      title: '개인정보처리방침을 바로잡고 카드 불러오기 안내를 더했어요',
      url: '/privacy',
      startsAt: utc(published),
      endsAt: utc(published, 14),
    },
  ],
}

export const handlers: HttpHandler[] = [api.get<ActiveNoticesResponse>('/api/notices/active', () => HttpResponse.json(MOCK_NOTICES))]
