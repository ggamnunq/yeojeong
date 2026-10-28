import { http, HttpResponse, type HttpHandler } from 'msw'
import type { MyTripsResponse, SessionResponse } from '../../api'
import { db, findTrip, findUser, tripDetail, tripListItem } from '../../mocks/data'
import { denyUnlessAuthenticated, mockError, requireMember } from '../../mocks/utils'

function me() {
  const user = findUser(db.meUserId)!
  const methods = db.paymentMethods.filter((p) => p.userId === user.id && p.status !== 'REMOVED')
  return {
    id: user.id,
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl,
    hasProfileImage: user.profileImageUrl !== null,
    paymentMethodCount: methods.length,
    hasExpiredConnection: methods.some((p) => p.status === 'EXPIRED'),
  }
}

export const handlers: HttpHandler[] = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok', db: 'up' })),

  http.get('/api/auth/session', () => {
    const body: SessionResponse =
      db.session === 'AUTHENTICATED'
        ? {
            status: 'AUTHENTICATED',
            user: me(),
            ...(db.consentRequired?.length && {
              reconsentRequired: db.consentRequired.map((id) => ({ id, version: '0.1-draft' })),
            }),
          }
        : db.session === 'SIGNUP_REQUIRED'
          ? { status: 'SIGNUP_REQUIRED', signupDraft: { kakaoNickname: '준용', profileImageUrl: null } }
          : { status: 'ANONYMOUS' }
    return HttpResponse.json(body)
  }),

  http.get('/api/users/me', () => denyUnlessAuthenticated() ?? HttpResponse.json(me())),

  http.get('/api/me/trips', () => {
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

  http.get('/api/trips/:tripId', ({ params }) => {
    const tripId = String(params.tripId)
    const { denied } = requireMember(tripId)
    if (denied) return denied
    const trip = findTrip(tripId)
    if (!trip) return mockError('NOT_FOUND', 404)
    db.lastViewedTripId = tripId
    return HttpResponse.json(tripDetail(trip))
  }),
]
