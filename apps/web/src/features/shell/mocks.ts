import type { AckTripEventsRequest, LeaveGroupResponse, MemberSummary } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import { db, findUser, memberSummary } from '../../mocks/data'
import { api, mockError, noContent, requireMember, type NoContent } from '../../mocks/utils'

const tripOfGroup = (groupId: string) => db.trips.find((t) => t.groupId === groupId)

export const handlers: HttpHandler[] = [
  // FR-206
  api.get<MemberSummary[]>('/api/groups/:groupId/members', ({ params, request }) => {
    const trip = tripOfGroup(String(params.groupId))
    if (!trip) return mockError('NOT_FOUND', 404)
    const { denied } = requireMember(trip.tripId)
    if (denied) return denied
    const includeLeft = new URL(request.url).searchParams.get('includeLeft') === 'true'
    const members = db.memberships
      .filter((m) => m.tripId === trip.tripId && (includeLeft || m.leftAt === null))
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((m) => memberSummary(m))
    return HttpResponse.json(members)
  }),

  // FR-207 강퇴
  api.delete<NoContent>('/api/groups/:groupId/members/:membershipId', ({ params }) => {
    const trip = tripOfGroup(String(params.groupId))
    if (!trip) return mockError('NOT_FOUND', 404)
    const { denied, membership } = requireMember(trip.tripId)
    if (denied) return denied
    if (membership.role !== 'LEADER') return mockError('NOT_LEADER', 403, undefined, '그룹장만 할 수 있어요')
    if (membership.membershipId === params.membershipId) return mockError('CANNOT_KICK_SELF', 400, undefined, '나를 내보낼 수는 없어요')
    if (trip.status === 'ENDED') return mockError('TRIP_PHASE_INVALID', 409, undefined, '종료된 여정이에요')
    const target = db.memberships.find((m) => m.membershipId === params.membershipId && m.tripId === trip.tripId)
    if (!target || target.leftAt !== null) return mockError('NOT_FOUND', 404)
    target.leftAt = new Date().toISOString()
    return noContent()
  }),

  // FR-208 나가기 + 그룹장 승계
  api.post<LeaveGroupResponse>('/api/groups/:groupId/leave', ({ params }) => {
    const trip = tripOfGroup(String(params.groupId))
    if (!trip) return mockError('NOT_FOUND', 404)
    const { denied, membership } = requireMember(trip.tripId)
    if (denied) return denied
    membership.leftAt = new Date().toISOString()
    if (membership.role !== 'LEADER') return HttpResponse.json({ newLeader: null, groupDeleted: false })
    membership.role = 'MEMBER'
    const next = db.memberships
      .filter((m) => m.tripId === trip.tripId && m.leftAt === null)
      .sort((a, b) => a.joinOrder - b.joinOrder)[0]
    if (!next) return HttpResponse.json({ newLeader: null, groupDeleted: true })
    next.role = 'LEADER'
    db.tripEvents.push({
      id: `evt-${db.tripEvents.length + 1}`,
      tripId: trip.tripId,
      type: 'LEADER_CHANGED',
      payload: { nickname: findUser(next.userId)?.nickname ?? '' },
      actorUserId: db.meUserId,
      seenBy: [],
    })
    return HttpResponse.json({ newLeader: memberSummary(next), groupDeleted: false })
  }),

  // FR-004 1회성 이벤트 확인
  api.post<NoContent, AckTripEventsRequest>('/api/trips/:tripId/events/ack', async ({ params, request }) => {
    const tripId = String(params.tripId)
    const { denied } = requireMember(tripId)
    if (denied) return denied
    const { lastEventId } = await request.json()
    const events = db.tripEvents.filter((e) => e.tripId === tripId)
    const upTo = events.findIndex((e) => e.id === lastEventId)
    for (const event of events.slice(0, upTo + 1)) if (!event.seenBy.includes(db.meUserId)) event.seenBy.push(db.meUserId)
    return noContent()
  }),
]
