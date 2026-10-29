import type { ExpenseListItem, MemberSummary } from '../../api'
import {
  activeMembership,
  db,
  expenseListItem,
  meFirst as meFirstBy,
  memberSummaryById,
  type MockExpense,
  type MockMembership,
} from '../../mocks/data'
import { computeLedger, splitShares, type LedgerResult } from './mockLedger'
import type { SettlementDirection } from './types'

// 현황·정산 목이 db에서 장부를 만드는 헬퍼. 제주(종료) 정산 샘플은 src/mocks/seeds.ts.

// ── db → 장부 ────────────────────────────────────────────────────

/** 그 여정의 모든 멤버십(나간 멤버 포함), 가입 순 */
function tripMemberships(tripId: string): MockMembership[] {
  return db.memberships.filter((m) => m.tripId === tripId).sort((a, b) => a.joinOrder - b.joinOrder)
}

/** 개인 결제로 치는 상태. 종료 후에는 남은 미확정도 개인으로 처리된다(FR-306) */
const isPersonal = (e: MockExpense, ended: boolean) => e.status === 'PERSONAL' || (ended && e.status === 'PENDING')

/** SHARED 결제 + 부담 인원 몫으로 4-4 장부를 만든다. 개인 건수는 ended면 미확정까지 센다 */
export function ledgerOf(tripId: string, { ended = false } = {}): LedgerResult {
  const memberships = tripMemberships(tripId)
  const joinOrder = new Map(memberships.map((m) => [m.membershipId, m.joinOrder]))
  const expenses = db.expenses.filter((e) => e.tripId === tripId)
  return computeLedger(
    memberships.map((m) => ({
      membershipId: m.membershipId,
      joinOrder: m.joinOrder,
      isLeft: m.leftAt !== null,
      personalCount: expenses.filter((e) => e.payerMembershipId === m.membershipId && isPersonal(e, ended)).length,
    })),
    expenses
      .filter((e) => e.status === 'SHARED')
      .map((e) => {
        const participants = [...(e.participantMembershipIds ?? [])].sort(
          (a, b) => (joinOrder.get(a) ?? 0) - (joinOrder.get(b) ?? 0),
        )
        return {
          payerMembershipId: e.payerMembershipId,
          netKrw: e.krwAmount,
          shares: splitShares(e.krwAmount, participants, e.payerMembershipId),
        }
      }),
  )
}

/** 내 개인 결제 순액 합(미확정 제외, 4-9 "내 지출") */
export function personalTotal(tripId: string, membershipId: string) {
  return db.expenses
    .filter((e) => e.tripId === tripId && e.payerMembershipId === membershipId && e.status === 'PERSONAL')
    .reduce((sum, e) => sum + e.krwAmount, 0)
}

export const direction = (netKrw: number): SettlementDirection => (netKrw > 0 ? 'RECEIVE' : netKrw < 0 ? 'SEND' : 'EVEN')

export const summaryOf = (membershipId: string): MemberSummary => memberSummaryById(membershipId)

/** 사람 행 정렬: 나 먼저 → 가입 순(C-05) */
export function meFirst<T extends { member: MemberSummary }>(items: T[]): T[] {
  return meFirstBy(items.map((item) => ({ item, isMe: item.member.isMe, joinOrder: item.member.joinOrder }))).map(({ item }) => item)
}

export function myMembershipId(tripId: string) {
  return activeMembership(tripId, db.meUserId)?.membershipId
}

/** 멤버별 내역의 결제 행. occurredAt 오름차순 */
export function expenseItems(tripId: string, payerMembershipId: string, kind: 'shared' | 'personal'): ExpenseListItem[] {
  return db.expenses
    .filter(
      (e) =>
        e.tripId === tripId &&
        e.payerMembershipId === payerMembershipId &&
        (kind === 'shared' ? e.status === 'SHARED' : isPersonal(e, true)),
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
    .map((e) => ({ ...expenseListItem(e), status: kind === 'shared' ? 'SHARED' : 'PERSONAL' }))
}
