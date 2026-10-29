import { HttpResponse, type HttpHandler } from 'msw'
import { findTrip, MOCK_NOW, TRIP } from '../../mocks/data'
import { api, mockError, requireMember } from '../../mocks/utils'
import { budgetRatio, budgetState, spendingSplit } from '../settlement/mockLedger'
import { ledgerOf, meFirst, personalTotal, seedJejuSettlement, summaryOf } from '../settlement/mockData'
import type { TripSummary } from '../settlement/types'

// GET /api/trips/:tripId/summary (FR-601~604). 지금 SHARED 결제로 즉석 계산(기능명세 4-6·4-9). 미확정은 모든 수치에서 뺀다.
export const handlers: HttpHandler[] = [
  api.get<TripSummary>('/api/trips/:tripId/summary', ({ params }) => {
    const tripId = String(params.tripId)
    if (tripId === TRIP.jeju) seedJejuSettlement()
    const { denied, membership } = requireMember(tripId)
    if (denied) return denied
    const trip = findTrip(tripId)
    if (!trip) return mockError('NOT_FOUND', 404)
    if (trip.status === 'UPCOMING') return mockError('TRIP_PHASE_INVALID')

    const ledger = ledgerOf(tripId)
    const mine = ledger.members.find((m) => m.membershipId === membership.membershipId)
    const netKrw = mine?.netKrw ?? 0
    const sharedBurdenKrw = mine?.burdenKrw ?? 0
    const personalKrw = personalTotal(tripId, membership.membershipId)
    const spent = ledger.totalSharedKrw
    const body: TripSummary = {
      asOf: MOCK_NOW,
      me: {
        membershipId: membership.membershipId,
        netKrw,
        toPayKrw: netKrw < 0 ? -netKrw : 0,
        toReceiveKrw: netKrw > 0 ? netKrw : 0,
      },
      sharedTotalKrw: spent,
      budgetKrw: trip.budgetKrw,
      budgetRatio: budgetRatio(spent, trip.budgetKrw),
      budgetState: budgetState(spent, trip.budgetKrw),
      overBudgetKrw: Math.max(0, spent - trip.budgetKrw),
      mySpending: { sharedBurdenKrw, personalKrw, ...spendingSplit(sharedBurdenKrw, personalKrw) },
      burdens: meFirst(ledger.members.map((m) => ({ member: summaryOf(m.membershipId), burdenKrw: m.burdenKrw }))),
    }
    return HttpResponse.json(body)
  }),
]
