import type {
  ConsentId,
  ExpenseListItem,
  ExpenseStatus,
  FxPolicy,
  LeaveReason,
  Me,
  MemberRole,
  MemberSummary,
  TripDetail,
  TripListItem,
  TripEventType,
  TripStatus,
} from '../api'
import { WITHDRAWN_NICKNAME } from '../app/person'

// 명세 샘플 데이터(screens.md 「샘플 데이터 정의」): 오사카 3박 4일, 준용 = 나 · 그룹장, 민지·태현·수빈.
// 시점은 진행 중 11.13 18:34(현황 샘플 기준). 11.14 이후 결제는 아직 없다.
// 엣지 시나리오(주유패스 환불 묶음, 오사카성 중복 의심)는 EDGE_EXPENSE_IDS. 이것을 빼면 명세 수치(공동 ₩352,790 등)와 같다.

export const MOCK_NOW = '2026-11-13T18:34:00+09:00'

export type MockUser = { id: string; nickname: string; profileImageUrl: string | null }

export type MockTrip = {
  tripId: string
  groupId: string
  groupName: string
  placeLabel: string
  countryCode: string
  currency: string
  startDate: string
  endDate: string
  budgetKrw: number
  status: TripStatus
  inviteCode: string
  fxPolicy: FxPolicy
  version: number
}

export type MockMembership = {
  membershipId: string
  tripId: string
  /** 탈퇴(ACCOUNT_DELETED)하면 null(서버 ON DELETE SET NULL) */
  userId: string | null
  role: MemberRole
  joinOrder: number
  leftAt: string | null
  /** 나간 이유(LEFT·KICKED·ACCOUNT_DELETED). 활성 멤버는 생략 */
  leaveReason?: LeaveReason | null
}

export type MockPaymentMethod = {
  id: string
  userId: string
  type: 'ACCOUNT' | 'CARD'
  institutionName: string
  productName: string
  maskedNumber: string
  /** 결제 상세 줄 "토스뱅크 체크카드 1934" */
  label: string
  status: 'ACTIVE' | 'EXPIRED' | 'REMOVED'
}

export type MockExpense = {
  id: string
  tripId: string
  occurredAt: string
  merchantName: string
  payerMembershipId: string
  status: ExpenseStatus
  /** 순액(환불 반영) */
  krwAmount: number
  grossKrwAmount: number
  originalAmount: string
  originalCurrency: string
  /** SHARED만 */
  participantMembershipIds: string[] | null
  changed: boolean
  duplicateGroupId: string | null
  refunds: { id: string; occurredAt: string; krwAmount: number }[]
  origin: 'AUTO' | 'OUT_OF_PERIOD'
  paymentMethodId: string
  version: number
}

/** 1회성 토스트용 그룹 이벤트(FR-004). 행위자 본인과 이미 본(ack) 사람에게는 보이지 않는다 */
export type MockTripEvent = {
  id: string
  tripId: string
  type: TripEventType
  payload: Record<string, unknown>
  actorUserId: string | null
  seenBy: string[]
}

export const USER = {
  junyong: 'user-junyong',
  minji: 'user-minji',
  taehyeon: 'user-taehyeon',
  subin: 'user-subin',
} as const

export const TRIP = { osaka: 'trip-osaka', busan: 'trip-busan', jeju: 'trip-jeju' } as const

/** 오사카 여정 멤버십 */
export const MEMBER = {
  junyong: 'mem-osaka-junyong',
  minji: 'mem-osaka-minji',
  taehyeon: 'mem-osaka-taehyeon',
  subin: 'mem-osaka-subin',
} as const

export const EDGE_EXPENSE_IDS = ['exp-shupass', 'exp-osakajo-minji'] as const

const users: MockUser[] = [
  { id: USER.junyong, nickname: '준용', profileImageUrl: null },
  { id: USER.minji, nickname: '민지', profileImageUrl: null },
  { id: USER.taehyeon, nickname: '태현', profileImageUrl: null },
  { id: USER.subin, nickname: '수빈', profileImageUrl: null },
]

const trips: MockTrip[] = [
  {
    tripId: TRIP.osaka,
    groupId: 'group-osaka',
    groupName: '오사카 3박 4일',
    placeLabel: '일본 오사카',
    countryCode: 'JP',
    currency: 'JPY',
    startDate: '2026-11-12',
    endDate: '2026-11-15',
    budgetKrw: 1_200_000,
    status: 'ONGOING',
    inviteCode: 'K7M2QX',
    fxPolicy: 'SPOT_AT_PAYMENT',
    version: 3,
  },
  {
    tripId: TRIP.busan,
    groupId: 'group-busan',
    groupName: '부산 연말 모임',
    placeLabel: '부산',
    countryCode: 'KR',
    currency: 'KRW',
    startDate: '2026-12-27',
    endDate: '2026-12-28',
    budgetKrw: 600_000,
    status: 'UPCOMING',
    inviteCode: 'B8N4RT',
    fxPolicy: 'SPOT_AT_PAYMENT',
    version: 0,
  },
  {
    tripId: TRIP.jeju,
    groupId: 'group-jeju',
    groupName: '제주 우정여행',
    placeLabel: '제주',
    countryCode: 'KR',
    currency: 'KRW',
    startDate: '2026-08-21',
    endDate: '2026-08-23',
    budgetKrw: 900_000,
    status: 'ENDED',
    inviteCode: 'J3W9PZ',
    fxPolicy: 'SPOT_AT_PAYMENT',
    version: 7,
  },
]

const memberships: MockMembership[] = [
  { membershipId: MEMBER.junyong, tripId: TRIP.osaka, userId: USER.junyong, role: 'LEADER', joinOrder: 1, leftAt: null },
  { membershipId: MEMBER.minji, tripId: TRIP.osaka, userId: USER.minji, role: 'MEMBER', joinOrder: 2, leftAt: null },
  { membershipId: MEMBER.taehyeon, tripId: TRIP.osaka, userId: USER.taehyeon, role: 'MEMBER', joinOrder: 3, leftAt: null },
  { membershipId: MEMBER.subin, tripId: TRIP.osaka, userId: USER.subin, role: 'MEMBER', joinOrder: 4, leftAt: null },
  { membershipId: 'mem-busan-minji', tripId: TRIP.busan, userId: USER.minji, role: 'LEADER', joinOrder: 1, leftAt: null },
  { membershipId: 'mem-busan-junyong', tripId: TRIP.busan, userId: USER.junyong, role: 'MEMBER', joinOrder: 2, leftAt: null },
  { membershipId: 'mem-busan-subin', tripId: TRIP.busan, userId: USER.subin, role: 'MEMBER', joinOrder: 3, leftAt: null },
  { membershipId: 'mem-jeju-junyong', tripId: TRIP.jeju, userId: USER.junyong, role: 'LEADER', joinOrder: 1, leftAt: null },
  { membershipId: 'mem-jeju-taehyeon', tripId: TRIP.jeju, userId: USER.taehyeon, role: 'MEMBER', joinOrder: 2, leftAt: null },
]

const paymentMethods: MockPaymentMethod[] = [
  {
    id: 'pm-toss-account',
    userId: USER.junyong,
    type: 'ACCOUNT',
    institutionName: '토스뱅크',
    productName: '토스뱅크 통장',
    maskedNumber: '1000-**-****321',
    label: '토스뱅크 통장 321',
    status: 'ACTIVE',
  },
  {
    id: 'pm-toss-check',
    userId: USER.junyong,
    type: 'CARD',
    institutionName: '토스뱅크',
    productName: '토스뱅크 체크카드',
    maskedNumber: '**** **** **** 1934',
    label: '토스뱅크 체크카드 1934',
    status: 'ACTIVE',
  },
  {
    id: 'pm-shinhan',
    userId: USER.junyong,
    type: 'CARD',
    institutionName: '신한카드',
    productName: '신한카드 Deep Dream',
    maskedNumber: '**** **** **** 1102',
    label: '신한카드 1102',
    status: 'ACTIVE',
  },
  {
    id: 'pm-other',
    userId: USER.minji,
    type: 'CARD',
    institutionName: '현대카드',
    productName: '현대카드 ZERO',
    maskedNumber: '**** **** **** 5521',
    label: '현대카드 5521',
    status: 'ACTIVE',
  },
]

const ALL4 = [MEMBER.junyong, MEMBER.minji, MEMBER.taehyeon, MEMBER.subin]

const at = (date: string, time: string) => `2026-11-${date}T${time}:00+09:00`

function expense(
  init: Pick<MockExpense, 'id' | 'occurredAt' | 'merchantName' | 'payerMembershipId' | 'status' | 'krwAmount' | 'originalAmount'> &
    Partial<MockExpense>,
): MockExpense {
  return {
    tripId: TRIP.osaka,
    grossKrwAmount: init.krwAmount,
    originalCurrency: 'JPY',
    participantMembershipIds: init.status === 'SHARED' ? ALL4 : null,
    changed: false,
    duplicateGroupId: null,
    refunds: [],
    origin: 'AUTO',
    paymentMethodId: init.payerMembershipId === MEMBER.junyong ? 'pm-toss-check' : 'pm-other',
    version: 1,
    ...init,
  }
}

const expenses: MockExpense[] = [
  expense({ id: 'exp-nankai', occurredAt: at('12', '11:20'), merchantName: '난카이 라피트 간사이공항역', payerMembershipId: MEMBER.minji, status: 'SHARED', krwAmount: 54_780, originalAmount: '5960' }),
  expense({ id: 'exp-ichiran', occurredAt: at('12', '13:05'), merchantName: '이치란 라멘 도톤보리점', payerMembershipId: MEMBER.junyong, status: 'SHARED', krwAmount: 36_400, originalAmount: '3960' }),
  expense({ id: 'exp-donki', occurredAt: at('12', '17:40'), merchantName: '돈키호테 도톤보리점', payerMembershipId: MEMBER.junyong, status: 'PERSONAL', krwAmount: 79_420, originalAmount: '8640' }),
  expense({ id: 'exp-kushikatsu', occurredAt: at('12', '19:30'), merchantName: '쿠시카츠 다루마 신세카이점', payerMembershipId: MEMBER.taehyeon, status: 'SHARED', krwAmount: 117_660, originalAmount: '12800' }),
  expense({ id: 'exp-famima', occurredAt: at('13', '08:50'), merchantName: '패밀리마트 난바역점', payerMembershipId: MEMBER.junyong, status: 'PENDING', krwAmount: 11_770, originalAmount: '1280' }),
  expense({ id: 'exp-shupass', occurredAt: at('13', '09:40'), merchantName: '오사카 주유패스 4매', payerMembershipId: MEMBER.taehyeon, status: 'SHARED', krwAmount: 0, grossKrwAmount: 121_330, originalAmount: '13200', refunds: [{ id: 'exp-shupass-cancel', occurredAt: at('13', '12:15'), krwAmount: -121_330 }] }),
  expense({ id: 'exp-osakajo', occurredAt: at('13', '10:30'), merchantName: '오사카성 천수각', payerMembershipId: MEMBER.subin, status: 'SHARED', krwAmount: 44_120, originalAmount: '4800', duplicateGroupId: 'dup-osakajo' }),
  expense({ id: 'exp-osakajo-minji', occurredAt: at('13', '10:30'), merchantName: '오사카성 천수각', payerMembershipId: MEMBER.minji, status: 'SHARED', krwAmount: 44_120, originalAmount: '4800', duplicateGroupId: 'dup-osakajo' }),
  expense({ id: 'exp-mk', occurredAt: at('13', '14:10'), merchantName: 'MK택시', payerMembershipId: MEMBER.junyong, status: 'SHARED', krwAmount: 26_290, originalAmount: '2860', participantMembershipIds: [MEMBER.junyong, MEMBER.minji] }),
  expense({ id: 'exp-umeda', occurredAt: at('13', '16:40'), merchantName: '우메다 스카이빌딩 공중정원', payerMembershipId: MEMBER.minji, status: 'SHARED', krwAmount: 73_540, originalAmount: '8000' }),
  expense({ id: 'exp-551', occurredAt: at('13', '18:20'), merchantName: '551 호라이 난바본점', payerMembershipId: MEMBER.junyong, status: 'PENDING', krwAmount: 25_740, originalAmount: '2800', paymentMethodId: 'pm-shinhan' }),
]

export type MockDb = {
  session: 'AUTHENTICATED' | 'SIGNUP_REQUIRED' | 'ANONYMOUS'
  /** 채우면 세션 응답에 재동의 필요 항목을 싣고 로그인 API는 403 CONSENT_REQUIRED를 준다 */
  consentRequired: ConsentId[] | null
  meUserId: string
  lastViewedTripId: string | null
  users: MockUser[]
  trips: MockTrip[]
  memberships: MockMembership[]
  paymentMethods: MockPaymentMethod[]
  expenses: MockExpense[]
  tripEvents: MockTripEvent[]
}

export function createMockDb(): MockDb {
  return structuredClone({
    session: 'AUTHENTICATED',
    consentRequired: null,
    meUserId: USER.junyong,
    lastViewedTripId: TRIP.osaka,
    users,
    trips,
    memberships,
    paymentMethods,
    expenses,
    tripEvents: [],
  } satisfies MockDb)
}

/** 핸들러가 읽고 고치는 상태. 테스트마다 resetMockDb()로 되돌린다(src/test/setup.ts) */
export const db: MockDb = createMockDb()

export function resetMockDb() {
  Object.assign(db, createMockDb())
}

// ── 응답 모양으로 바꾸기 ─────────────────────────────────────────

const DAY_MS = 86_400_000
/** 두 날짜("YYYY-MM-DD")의 일 수 차이 a − b */
export const dateDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS)

export const findUser = (userId: string | null) => (userId === null ? undefined : db.users.find((u) => u.id === userId))
export const findTrip = (tripId: string) => db.trips.find((t) => t.tripId === tripId)
export const findMembership = (membershipId: string) => db.memberships.find((m) => m.membershipId === membershipId)

/** 활성 멤버십(나간 멤버 제외) */
export function activeMembership(tripId: string, userId: string) {
  return db.memberships.find((m) => m.tripId === tripId && m.userId === userId && m.leftAt === null)
}

/** 서버 toMemberSummary와 같다: 탈퇴한 멤버는 "탈퇴한 멤버" · 프사 null · isWithdrawn */
export function memberSummary(m: MockMembership, viewerUserId = db.meUserId): MemberSummary {
  const user = findUser(m.userId)
  return {
    membershipId: m.membershipId,
    nickname: user?.nickname ?? WITHDRAWN_NICKNAME,
    profileImageUrl: user?.profileImageUrl ?? null,
    role: m.leftAt ? 'MEMBER' : m.role,
    joinOrder: m.joinOrder,
    isMe: m.userId !== null && m.userId === viewerUserId,
    isLeft: m.leftAt !== null,
    isWithdrawn: m.userId === null && m.leaveReason === 'ACCOUNT_DELETED',
  }
}

export const memberSummaryById = (membershipId: string, viewerUserId = db.meUserId) =>
  memberSummary(findMembership(membershipId)!, viewerUserId)

/** 사람 목록 정렬(화면명세 0-8, C-05): 나 먼저 → 가입 순 */
export function meFirst<T extends { isMe: boolean; joinOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.joinOrder - b.joinOrder)
}

/** 연결 해제(REMOVED)되지 않은 결제수단(서버 Me.paymentMethodCount 기준) */
export const userMethods = (userId: string | null) =>
  db.paymentMethods.filter((p) => p.userId === userId && p.status !== 'REMOVED')

/** GET /api/users/me · 세션 user · 가입 응답 */
export function meOf(userId = db.meUserId): Me {
  const user = findUser(userId)!
  const methods = userMethods(userId)
  return {
    id: user.id,
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl,
    hasProfileImage: user.profileImageUrl !== null,
    paymentMethodCount: methods.length,
    hasExpiredConnection: methods.some((p) => p.status === 'EXPIRED'),
  }
}

/** 활성 멤버, 가입 순 */
export function tripMembers(tripId: string, viewerUserId = db.meUserId): MemberSummary[] {
  return db.memberships
    .filter((m) => m.tripId === tripId && m.leftAt === null)
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .map((m) => memberSummary(m, viewerUserId))
}

export function tripListItem(trip: MockTrip, viewerUserId = db.meUserId): TripListItem {
  const members = tripMembers(trip.tripId, viewerUserId)
  return {
    tripId: trip.tripId,
    groupId: trip.groupId,
    groupName: trip.groupName,
    status: trip.status,
    startDate: trip.startDate,
    endDate: trip.endDate,
    memberCount: members.length,
    isLeader: activeMembership(trip.tripId, viewerUserId)?.role === 'LEADER',
  }
}

/** 이 사람에게 보이는 결제(기능명세 I-8): 공동이거나 내가 결제자 */
export function visibleExpenses(tripId: string, viewerUserId = db.meUserId): MockExpense[] {
  const mine = activeMembership(tripId, viewerUserId)?.membershipId
  return db.expenses.filter((e) => e.tripId === tripId && (e.status === 'SHARED' || e.payerMembershipId === mine))
}

export function tripDetail(trip: MockTrip, viewerUserId = db.meUserId): TripDetail {
  const me = activeMembership(trip.tripId, viewerUserId)
  if (!me) throw new Error(`${viewerUserId}는 ${trip.tripId}의 멤버가 아니다`)
  const nights = dateDiff(trip.endDate, trip.startDate)
  const today = MOCK_NOW.slice(0, 10)
  const dDay = trip.status === 'UPCOMING' && trip.startDate >= today ? dateDiff(trip.startDate, today) : null
  const hasExpired = db.paymentMethods.some((p) => p.userId === viewerUserId && p.status === 'EXPIRED')
  const leader = me.role === 'LEADER'
  const open = trip.status !== 'ENDED'
  const editableFields = leader
    ? trip.status === 'UPCOMING'
      ? (['groupName', 'place', 'startDate', 'endDate', 'budgetKrw'] as const)
      : trip.status === 'ONGOING'
        ? (['groupName', 'budgetKrw', 'endDate'] as const)
        : []
    : []
  const shell =
    trip.status === 'UPCOMING'
      ? { defaultTab: 'INFO' as const, secondTab: 'SUMMARY' as const, lockedTabs: ['EXPENSES', 'SUMMARY'] as const }
      : trip.status === 'ENDED'
        ? { defaultTab: 'SETTLEMENT' as const, secondTab: 'SETTLEMENT' as const, lockedTabs: [] }
        : { defaultTab: 'EXPENSES' as const, secondTab: 'SUMMARY' as const, lockedTabs: [] }
  return {
    ...tripListItem(trip, viewerUserId),
    placeLabel: trip.placeLabel,
    countryCode: trip.countryCode,
    currency: trip.currency,
    budgetKrw: trip.budgetKrw,
    nights,
    days: nights + 1,
    dDay,
    autoEndAt: `${trip.endDate}T23:59:59+09:00`,
    inviteCode: trip.status === 'ENDED' ? null : trip.inviteCode,
    me: {
      membershipId: me.membershipId,
      role: me.role,
      pendingCount: db.expenses.filter((e) => e.tripId === trip.tripId && e.payerMembershipId === me.membershipId && e.status === 'PENDING').length,
      connectionExpired: hasExpired,
    },
    members: tripMembers(trip.tripId, viewerUserId),
    fx: trip.currency === 'KRW' ? null : { policy: trip.fxPolicy, tripCurrency: trip.currency },
    unseenEvents: db.tripEvents
      .filter((e) => e.tripId === trip.tripId && e.actorUserId !== viewerUserId && !e.seenBy.includes(viewerUserId))
      .map(({ id, type, payload }) => ({ id, type, payload })),
    version: trip.version,
    city: trip.placeLabel.split(' ').at(-1) ?? null,
    todayDayIndex:
      trip.status === 'ONGOING' && today >= trip.startDate && today <= trip.endDate
        ? dateDiff(today, trip.startDate) + 1
        : null,
    startedAt: trip.status === 'UPCOMING' ? null : `${trip.startDate}T00:00:00+09:00`,
    endedAt: trip.status === 'ENDED' ? `${trip.endDate}T23:59:59+09:00` : null,
    endReason: trip.status === 'ENDED' ? 'MANUAL' : null,
    shell: { ...shell, lockedTabs: [...shell.lockedTabs] },
    permissions: {
      canEdit: editableFields.length > 0,
      editableFields: [...editableFields],
      canStart: leader && trip.status === 'UPCOMING' && trip.endDate >= today,
      canEnd: leader && trip.status === 'ONGOING',
      canDeleteGroup: leader && trip.status === 'UPCOMING',
      canKick: leader && open,
      canInvite: open,
      canLeave: true,
      canChangeFx: leader && open && trip.currency !== 'KRW',
    },
  }
}

export function expenseListItem(e: MockExpense, viewerUserId = db.meUserId): ExpenseListItem {
  const trip = findTrip(e.tripId)!
  const byId = (id: string) => memberSummaryById(id, viewerUserId)
  const localDate = e.occurredAt.slice(0, 10)
  const inPeriod = localDate >= trip.startDate && localDate <= trip.endDate
  const payer = byId(e.payerMembershipId)
  const participants = e.participantMembershipIds && meFirst(e.participantMembershipIds.map(byId))
  return {
    id: e.id,
    occurredAt: e.occurredAt,
    localDate,
    dayIndex: inPeriod ? dateDiff(localDate, trip.startDate) + 1 : null,
    periodSide: inPeriod ? null : localDate < trip.startDate ? 'BEFORE' : 'AFTER',
    merchantName: e.merchantName,
    payer,
    status: e.status,
    krwAmount: e.krwAmount,
    originalAmount: e.originalAmount,
    originalCurrency: e.originalCurrency,
    participants: e.status === 'SHARED' ? (participants ?? []) : null,
    flags: {
      changed: e.changed && !payer.isMe,
      duplicateSuspected: e.duplicateGroupId !== null,
      hasRefund: e.refunds.length > 0,
    },
    refunds: e.refunds,
    origin: e.origin,
    version: e.version,
  }
}
