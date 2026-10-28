import type { ExpenseListItem, MemberSummary } from '../../api'
import {
  activeMembership,
  db,
  expenseListItem,
  findTrip,
  memberSummary,
  TRIP,
  USER,
  type MockExpense,
  type MockMembership,
  type MockTrip,
} from '../../mocks/data'
import { computeLedger, splitShares, type LedgerResult } from './mockLedger'
import type { SettlementDirection } from './types'

// 현황·정산 목이 db에서 장부를 만드는 헬퍼와 제주(종료) 여정 정산 샘플.
// 중앙 샘플(src/mocks/data.ts)을 고치지 않으려고 제주 샘플은 이 파일에서 db에 넣는다(seedJejuSettlement).

/** 제주 여정 멤버십. 준용·태현은 중앙 샘플, 민지·수빈(나간 멤버)은 이 파일이 넣는다 */
export const JEJU = {
  junyong: 'mem-jeju-junyong',
  taehyeon: 'mem-jeju-taehyeon',
  minji: 'mem-jeju-minji',
  subin: 'mem-jeju-subin',
} as const

const jejuMemberships: MockMembership[] = [
  { membershipId: JEJU.minji, tripId: TRIP.jeju, userId: USER.minji, role: 'MEMBER', joinOrder: 3, leftAt: null },
  // 마지막 날 저녁에 나감. 결제·부담은 정산에 그대로 남는다(WF-44)
  { membershipId: JEJU.subin, tripId: TRIP.jeju, userId: USER.subin, role: 'MEMBER', joinOrder: 4, leftAt: '2026-08-23T18:00:00+09:00' },
]

const ALL = [JEJU.junyong, JEJU.taehyeon, JEJU.minji, JEJU.subin]

function jejuExpense(
  id: string,
  at: string,
  merchantName: string,
  payerMembershipId: string,
  krwAmount: number,
  participants: readonly string[] | null = ALL,
): MockExpense {
  return {
    id,
    tripId: TRIP.jeju,
    occurredAt: `2026-08-${at}:00+09:00`,
    merchantName,
    payerMembershipId,
    status: participants ? 'SHARED' : 'PERSONAL',
    krwAmount,
    grossKrwAmount: krwAmount,
    originalAmount: String(krwAmount),
    originalCurrency: 'KRW',
    participantMembershipIds: participants ? [...participants] : null,
    changed: false,
    duplicateGroupId: null,
    refunds: [],
    origin: 'AUTO',
    paymentMethodId: payerMembershipId === JEJU.junyong ? 'pm-toss-check' : 'pm-other',
    version: 1,
  }
}

/**
 * 기능명세 4-4 종료 샘플과 같은 수치(공동 11건 ₩826,910, N빵 1인 ₩206,728)를 제주 가맹점으로 옮긴 것.
 * 준용 +₩103,090 · 민지 −₩26,340 · 태현 −₩8,955 · 수빈(나간 멤버) −₩67,795. 개인 결제: 준용 2 · 민지 3 · 태현 0 · 수빈 1.
 */
const jejuExpenses: MockExpense[] = [
  jejuExpense('jeju-rentcar', '21T11:20', '제주 렌터카 공항점', JEJU.minji, 54_780),
  jejuExpense('jeju-dosaedon', '21T13:10', '돈사돈 본점', JEJU.junyong, 36_400),
  jejuExpense('jeju-stay', '21T15:00', '애월 오션스테이', JEJU.junyong, 227_960),
  jejuExpense('jeju-ecoland', '21T16:30', '에코랜드 테마파크', JEJU.subin, 44_120),
  jejuExpense('jeju-haenyeo', '21T19:30', '성산 해녀의집', JEJU.taehyeon, 117_660),
  jejuExpense('jeju-taxi', '22T10:20', '카카오T 택시', JEJU.junyong, 26_290, [JEJU.junyong, JEJU.minji]),
  jejuExpense('jeju-aqua', '22T11:40', '아쿠아플라넷 제주', JEJU.taehyeon, 73_540),
  jejuExpense('jeju-osulloc', '22T14:30', '오설록 티뮤지엄', JEJU.junyong, 25_740),
  jejuExpense('jeju-udo', '22T16:40', '우도 도항선', JEJU.minji, 73_540),
  jejuExpense('jeju-hyeopjae', '22T19:20', '협재 횟집', JEJU.subin, 88_240),
  jejuExpense('jeju-market', '23T12:10', '동문재래시장', JEJU.minji, 58_640),
  jejuExpense('jeju-souvenir', '22T17:40', '기념품 숍 바람', JEJU.junyong, 79_420, null),
  jejuExpense('jeju-cu', '23T08:50', 'CU 제주공항점', JEJU.junyong, 11_770, null),
  jejuExpense('jeju-minji-oliveyoung', '21T18:10', '올리브영 제주탑동점', JEJU.minji, 32_000, null),
  jejuExpense('jeju-minji-cafe', '22T09:30', '카페 델문도', JEJU.minji, 6_500, null),
  jejuExpense('jeju-minji-goods', '22T12:20', '아쿠아플라넷 기념품', JEJU.minji, 18_900, null),
  jejuExpense('jeju-subin-starbucks', '22T08:40', '스타벅스 제주용담점', JEJU.subin, 12_400, null),
]

// db는 테스트마다 새 객체로 바뀐다(resetMockDb). 여정 객체 단위로 한 번만 넣는다
const seeded = new WeakSet<MockTrip>()

/** 제주(종료) 여정에 정산 샘플을 넣는다. 같은 db에는 한 번만(테스트가 지운 결제를 되살리지 않는다) */
export function seedJejuSettlement() {
  const trip = findTrip(TRIP.jeju)
  if (!trip || seeded.has(trip)) return
  seeded.add(trip)
  for (const m of jejuMemberships) {
    if (!db.memberships.some((x) => x.membershipId === m.membershipId)) db.memberships.push(structuredClone(m))
  }
  for (const e of jejuExpenses) {
    if (!db.expenses.some((x) => x.id === e.id)) db.expenses.push(structuredClone(e))
  }
}

// ── db → 장부 ────────────────────────────────────────────────────

/** 그 여정의 모든 멤버십(나간 멤버 포함), 가입 순 */
export function tripMemberships(tripId: string): MockMembership[] {
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

export function summaryOf(membershipId: string): MemberSummary {
  return memberSummary(db.memberships.find((m) => m.membershipId === membershipId)!)
}

/** 나 먼저 → 가입 순(C-05) */
export function meFirst<T extends { member: MemberSummary }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.member.isMe) - Number(a.member.isMe) || a.member.joinOrder - b.member.joinOrder)
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
