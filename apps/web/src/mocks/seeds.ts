import { db, findTrip, TRIP, USER, type MockExpense, type MockMembership, type MockTrip } from './data'

// data.ts 기본 샘플 밖의 시나리오 픽스처. 필요한 핸들러가 처음 불릴 때 db에 넣는다(다른 플로우 테스트의 기본 수치를 바꾸지 않게).
// - 제주(종료) 정산 샘플 + 탈퇴한 멤버: 결제·현황·정산 목이 같은 장부를 본다
// - 참여용 데모 여정(도쿄·다낭·타이베이): 초대코드 조회·참여 목

// ── 제주 정산 ─────────────────────────────────────────────────────

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
  { membershipId: JEJU.subin, tripId: TRIP.jeju, userId: USER.subin, role: 'MEMBER', joinOrder: 4, leftAt: '2026-08-23T18:00:00+09:00', leaveReason: 'LEFT' },
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

/**
 * 탈퇴한 멤버(FR-109) 케이스: userId NULL · ACCOUNT_DELETED → memberSummary가 "탈퇴한 멤버" · 프사 null · isWithdrawn(서버와 같음).
 * 공동 결제 1건을 5명이 나눠 정산 대상(M)에 남는다. 넣으면 N = 5가 되어 명세 수치(N빵 ₩206,728)와 달라지므로 따로 넣는다.
 */
export const JEJU_WITHDRAWN = 'mem-jeju-withdrawn'

const withdrawnMembership: MockMembership = {
  membershipId: JEJU_WITHDRAWN,
  tripId: TRIP.jeju,
  userId: null,
  role: 'MEMBER',
  joinOrder: 5,
  leftAt: '2026-08-22T21:00:00+09:00',
  leaveReason: 'ACCOUNT_DELETED',
}
const withdrawnExpense = jejuExpense('jeju-hamdeok', '22T15:30', '함덕 카페 델문도', JEJU_WITHDRAWN, 24_000, [...ALL, JEJU_WITHDRAWN])

// db는 테스트마다 새 객체로 바뀐다(resetMockDb). 여정 객체 단위로 한 번만 넣는다
const seeded = new WeakSet<MockTrip>()
const seededWithdrawn = new WeakSet<MockTrip>()

const pushMembership = (m: MockMembership) => {
  if (!db.memberships.some((x) => x.membershipId === m.membershipId)) db.memberships.push(structuredClone(m))
}
const pushExpense = (e: MockExpense) => {
  if (!db.expenses.some((x) => x.id === e.id)) db.expenses.push(structuredClone(e))
}

/**
 * 제주(종료) 여정에 정산 샘플을 넣는다. 같은 db에는 한 번만(테스트가 지운 결제를 되살리지 않는다).
 * withdrawn: 탈퇴한 멤버 케이스도 넣는다(개발 서버 기본값, 테스트는 필요할 때만)
 */
export function seedJejuSettlement({ withdrawn = false } = {}) {
  const trip = findTrip(TRIP.jeju)
  if (!trip) return
  if (!seeded.has(trip)) {
    seeded.add(trip)
    jejuMemberships.forEach(pushMembership)
    jejuExpenses.forEach(pushExpense)
  }
  if (withdrawn && !seededWithdrawn.has(trip)) {
    seededWithdrawn.add(trip)
    pushMembership(withdrawnMembership)
    pushExpense(withdrawnExpense)
  }
}

// ── 참여용 데모 여정 ───────────────────────────────────────────────
// T4K9YP 도쿄 먹방 여행(시작 전, 3명) · D7N3QA 다낭 가족여행(진행 중, 2명) · X2P8RW 타이베이 주말(준용 강퇴 이력 → 403)

type DemoTrip = { trip: MockTrip; members: Omit<MockMembership, 'tripId'>[] }

const demo = (trip: Omit<MockTrip, 'fxPolicy' | 'version'>, members: Omit<MockMembership, 'tripId'>[]): DemoTrip => ({
  trip: { ...trip, fxPolicy: 'SPOT_AT_PAYMENT', version: 0 },
  members,
})

const DEMO_TRIPS: DemoTrip[] = [
  demo(
    { tripId: 'trip-tokyo', groupId: 'group-tokyo', groupName: '도쿄 먹방 여행', placeLabel: '도쿄', countryCode: null, currency: 'JPY', startDate: '2026-12-03', endDate: '2026-12-06', budgetKrw: 1_500_000, status: 'UPCOMING', inviteCode: 'T4K9YP' },
    [
      { membershipId: 'mem-tokyo-taehyeon', userId: USER.taehyeon, role: 'LEADER', joinOrder: 1, leftAt: null },
      { membershipId: 'mem-tokyo-minji', userId: USER.minji, role: 'MEMBER', joinOrder: 2, leftAt: null },
      { membershipId: 'mem-tokyo-subin', userId: USER.subin, role: 'MEMBER', joinOrder: 3, leftAt: null },
    ],
  ),
  demo(
    { tripId: 'trip-danang', groupId: 'group-danang', groupName: '다낭 가족여행', placeLabel: '다낭', countryCode: null, currency: 'VND', startDate: '2026-11-11', endDate: '2026-11-15', budgetKrw: 2_000_000, status: 'ONGOING', inviteCode: 'D7N3QA' },
    [
      { membershipId: 'mem-danang-minji', userId: USER.minji, role: 'LEADER', joinOrder: 1, leftAt: null },
      { membershipId: 'mem-danang-taehyeon', userId: USER.taehyeon, role: 'MEMBER', joinOrder: 2, leftAt: null },
    ],
  ),
  demo(
    { tripId: 'trip-taipei', groupId: 'group-taipei', groupName: '타이베이 주말', placeLabel: '타이베이', countryCode: null, currency: 'TWD', startDate: '2026-12-12', endDate: '2026-12-13', budgetKrw: 500_000, status: 'UPCOMING', inviteCode: 'X2P8RW' },
    [
      { membershipId: 'mem-taipei-subin', userId: USER.subin, role: 'LEADER', joinOrder: 1, leftAt: null },
      { membershipId: 'mem-taipei-junyong', userId: USER.junyong, role: 'MEMBER', joinOrder: 2, leftAt: '2026-11-01T10:00:00+09:00', leaveReason: 'KICKED' },
    ],
  ),
]

/** 삭제한 데모 그룹은 다시 넣지 않는다(resetMockDb가 db.trips 배열을 새로 만들면 같이 풀리도록 그 배열을 키로 기억) */
const deletedGroups = new WeakMap<object, Set<string>>()
export const deletedGroupIds = () => {
  let set = deletedGroups.get(db.trips)
  if (!set) deletedGroups.set(db.trips, (set = new Set()))
  return set
}

/** 참여용 데모 여정(준용은 멤버 아님)을 처음 조회할 때 db에 넣는다 */
export function ensureDemoTrips() {
  for (const { trip, members } of DEMO_TRIPS) {
    if (findTrip(trip.tripId) || deletedGroupIds().has(trip.groupId)) continue
    db.trips.push(structuredClone(trip))
    db.memberships.push(...members.map((m) => ({ ...m, tripId: trip.tripId })))
  }
}

