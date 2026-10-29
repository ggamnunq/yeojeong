import type { HealthResponse, TripDetailResponse } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import type { MeWithWallet } from '../manual/types'
import type { MyTripsResponse, SessionResponse } from '../../api'
import { db, findTrip, meOf, tripDetail, tripListItem } from '../../mocks/data'
import { api, denyUnlessAuthenticated, mockError, requireMember } from '../../mocks/utils'

export const handlers: HttpHandler[] = [
  api.get<HealthResponse>('/api/health', () => HttpResponse.json({ status: 'ok', db: 'up' })),

  // features(FR-006)는 모든 status에 싣는다
  api.get<SessionResponse>('/api/auth/session', () => {
    const status: SessionResponse =
      db.session === 'AUTHENTICATED'
        ? {
            status: 'AUTHENTICATED',
            user: meOf(),
            ...(db.consentRequired?.length && {
              reconsentRequired: db.consentRequired.map((id) => ({ id, version: '0.1-draft' })),
            }),
          }
        : db.session === 'SIGNUP_REQUIRED'
          ? {
              status: 'SIGNUP_REQUIRED',
              signupDraft: { kakaoNickname: '준용', profileImageUrl: null, returnTo: db.signupReturnTo },
            }
          : { status: 'ANONYMOUS' }
    const body: SessionResponse = { ...status, features: { accountLink: db.accountLink } }
    return HttpResponse.json(body)
  }),

  // walletEntryCount는 서버 S7b 예정 필드(수동 지갑 항목 수, HF-30). shared 타입 전이라 화면은 선택 필드로 읽는다
  api.get<MeWithWallet>('/api/users/me', () => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const body: MeWithWallet = { ...meOf(), walletEntryCount: db.walletEntries.filter((w) => w.userId === db.meUserId).length }
    return HttpResponse.json(body)
  }),

  api.get<MyTripsResponse>('/api/me/trips', () => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const mine = db.trips.filter((t) =>
      db.memberships.some((m) => m.tripId === t.tripId && m.userId === db.meUserId && m.leftAt === null),
    )
    const body: MyTripsResponse = {
      lastViewedTripId: mine.some((t) => t.tripId === db.lastViewedTripId) ? db.lastViewedTripId : null,
      items: mine.map((t) => tripListItem(t)),
    }
    return HttpResponse.json(body)
  }),

  api.get<TripDetailResponse>('/api/trips/:tripId', ({ params }) => {
    const tripId = String(params.tripId)
    const { denied } = requireMember(tripId)
    if (denied) return denied
    const trip = findTrip(tripId)
    if (!trip) return mockError('NOT_FOUND', 404)
    db.lastViewedTripId = tripId
    return HttpResponse.json(tripDetail(trip))
  }),
]
