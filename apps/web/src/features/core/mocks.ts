import type { HealthResponse, Me, TripDetailResponse } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import type { MyTripsResponse, SessionResponse } from '../../api'
import { mockConsentVersion } from '../../mocks/consentVersions'
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
              reconsentRequired: db.consentRequired.map((id) => ({ id, version: mockConsentVersion(id) })),
            }),
          }
        : db.session === 'SIGNUP_REQUIRED'
          ? {
              status: 'SIGNUP_REQUIRED',
              signupDraft: { kakaoNickname: '준용', profileImageUrl: null, returnTo: db.signupReturnTo },
            }
          : { status: 'ANONYMOUS' }
    const body: SessionResponse = { ...status, features: {
        accountLink: db.accountLink,
        cardImport: db.cardImport,
        fileImport: db.fileImport,
        fileImportProviders: db.fileImport ? [...db.fileImportProviders] : [],
      },
    }
    return HttpResponse.json(body)
  }),

  // walletEntryCount = 서버 S7b(지갑 항목 수, HF-30)
  api.get<Me>('/api/users/me', () => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const body: Me = { ...meOf(), walletEntryCount: db.walletEntries.filter((w) => w.userId === db.meUserId).length }
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
