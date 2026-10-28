import { http, HttpResponse, type HttpHandler } from 'msw'
import { findTrip, TRIP, type MockTrip } from '../../mocks/data'
import { mockError, requireMember } from '../../mocks/utils'
import { direction, expenseItems, ledgerOf, meFirst, myMembershipId, seedJejuSettlement, summaryOf } from './mockData'
import type { SettlementMemberExpenses, SettlementMemberView, SettlementView } from './types'

// GET …/settlement · GET …/settlement/members/:membershipId/expenses (기능명세 6-3, FR-702~705).
// 서버는 종료 시 스냅샷을 저장하지만 목은 db에서 매번 같은 식(4-4)으로 계산한다(종료 후에는 결제가 잠겨 값이 같다).

// 개발 서버(브라우저)에서는 처음부터 제주 정산 샘플을 넣는다. 테스트는 정산·현황 API가 불릴 때 넣는다(다른 플로우 테스트에 영향 없음)
if (import.meta.env.MODE !== 'test') seedJejuSettlement()

const phaseInvalid = () => mockError('TRIP_PHASE_INVALID', 409, undefined, '지금 단계에서는 할 수 없어요')

/** 여정 API 공통: 로그인·멤버·종료 확인. 통과면 여정 */
function endedTrip(tripId: string): { denied: Response; trip?: undefined } | { denied?: undefined; trip: MockTrip } {
  if (tripId === TRIP.jeju) seedJejuSettlement()
  const { denied } = requireMember(tripId)
  if (denied) return { denied }
  const trip = findTrip(tripId)
  if (!trip) return { denied: mockError('NOT_FOUND', 404) }
  if (trip.status !== 'ENDED') return { denied: phaseInvalid() }
  return { trip }
}

function memberViews(tripId: string) {
  const ledger = ledgerOf(tripId, { ended: true })
  const rows: (SettlementMemberView & { personalCount: number })[] = ledger.members.map((m) => ({
    member: summaryOf(m.membershipId),
    paidKrw: m.paidKrw,
    paidCount: m.paidCount,
    burdenKrw: m.burdenKrw,
    netKrw: m.netKrw,
    direction: direction(m.netKrw),
    isLeft: m.isLeft,
    personalCount: m.personalCount,
  }))
  return { ledger, rows }
}

export const handlers: HttpHandler[] = [
  http.get('/api/trips/:tripId/settlement', ({ params }) => {
    const tripId = String(params.tripId)
    const { denied, trip } = endedTrip(tripId)
    if (denied) return denied
    const { ledger, rows } = memberViews(tripId)
    const body: SettlementView = {
      settlementId: `settlement-${tripId}`,
      settledAt: `${trip.endDate}T23:59:59+09:00`,
      fxPolicy: trip.fxPolicy,
      algorithmVersion: 'v1',
      totalSharedKrw: ledger.totalSharedKrw,
      sharedCount: ledger.sharedCount,
      memberCount: ledger.memberCount,
      perCapitaKrw: ledger.perCapitaKrw,
      members: meFirst(rows).map(({ personalCount: _personalCount, ...row }) => row),
      transfers: ledger.transfers.map((t) => ({
        seq: t.seq,
        from: summaryOf(t.fromMembershipId),
        to: summaryOf(t.toMembershipId),
        amountKrw: t.amountKrw,
      })),
    }
    return HttpResponse.json(body)
  }),

  http.get('/api/trips/:tripId/settlement/members/:membershipId/expenses', ({ params }) => {
    const tripId = String(params.tripId)
    const membershipId = String(params.membershipId)
    const { denied } = endedTrip(tripId)
    if (denied) return denied
    const row = memberViews(tripId).rows.find((r) => r.member.membershipId === membershipId)
    // 정산 대상(M)이 아닌 멤버십은 없는 것으로 본다
    if (!row) return mockError('NOT_FOUND', 404)
    const isMe = membershipId === myMembershipId(tripId)
    const body: SettlementMemberExpenses = {
      ...row,
      sharedPayments: expenseItems(tripId, membershipId, 'shared'),
      personalCount: row.personalCount,
      // 남의 개인 결제는 건수만(4-2, C-02). 가맹점·금액·날짜는 응답에 없다
      personalPayments: isMe ? expenseItems(tripId, membershipId, 'personal') : null,
    }
    return HttpResponse.json(body)
  }),
]
