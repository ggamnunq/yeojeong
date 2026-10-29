import { http, HttpResponse, type HttpHandler } from 'msw'
import { db, TRIP, USER, type MockExpense, type MockMembership, type MockTrip } from './data'
import { mockError } from './utils'

// QA용 목 시나리오(개발 서버 + VITE_MOCK_API=1 전용 — browser.ts만 불러서 운영 빌드에는 들어가지 않는다).
// 주소 쿼리로 켜면 localStorage에 남아 새로고침·화면 이동 뒤에도 유지된다. 끄려면 값을 off로.
//
//   ?mockAs=leader | member | other       시점: 준용(오사카 그룹장) · 민지(오사카 멤버, 그룹장 아님) · 하늘(소속 여정 없는 다른 사용자)
//   ?mockEdge=409 | 429 | 404 | off       다음 /api 요청 한 번에 엣지 응답(409 VERSION_CONFLICT · 429 RATE_LIMITED · 404 NOT_FOUND)
//   &mockEdgePath=/settlement/members     엣지 응답을 이 글자가 든 경로에만(없으면 세션·내 정보 조회를 뺀 아무 요청)
//   ?mockPanel=1                          화면 왼쪽 아래 목 패널(시점·엣지를 눌러서 바꾼다)
//
// 늘 들어가는 픽스처: 5명 넘는 진행 중 여정 「후쿠오카 6인 여행」(준용 그룹장 · 공동 결제 6명 분담) — 프사 +N · 부담 인원 토글 스크롤 확인용.

export type MockPerspective = 'leader' | 'member' | 'other'
export type MockEdge = '409' | '429' | '404'

const KEYS = { as: 'yj:mock:as', edge: 'yj:mock:edge', edgePath: 'yj:mock:edgePath', panel: 'yj:mock:panel' } as const

export const PERSPECTIVE_USER: Record<MockPerspective, string> = {
  leader: USER.junyong,
  member: USER.minji,
  other: 'user-haneul',
}

const isPerspective = (v: unknown): v is MockPerspective => v === 'leader' || v === 'member' || v === 'other'
const isEdge = (v: unknown): v is MockEdge => v === '409' || v === '429' || v === '404'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export type MockScenario = { as: MockPerspective; edge: MockEdge | null; edgePath: string | null; panel: boolean }

export function readScenario(): MockScenario {
  const s = storage()
  const as = s?.getItem(KEYS.as)
  const edge = s?.getItem(KEYS.edge)
  return {
    as: isPerspective(as) ? as : 'leader',
    edge: isEdge(edge) ? edge : null,
    edgePath: s?.getItem(KEYS.edgePath) || null,
    panel: s?.getItem(KEYS.panel) === '1',
  }
}

export function writeScenario(patch: Partial<MockScenario>) {
  const s = storage()
  if (!s) return
  if (patch.as !== undefined) s.setItem(KEYS.as, patch.as)
  const set = (key: string, value: string | null | undefined) => {
    if (value === undefined) return
    if (value) s.setItem(key, value)
    else s.removeItem(key)
  }
  set(KEYS.edge, patch.edge)
  set(KEYS.edgePath, patch.edgePath)
  if (patch.panel !== undefined) set(KEYS.panel, patch.panel ? '1' : null)
}

/** 주소 쿼리(mockAs · mockEdge · mockEdgePath · mockPanel)를 저장소로 옮긴다 */
export function scenarioFromUrl(search: string) {
  const params = new URLSearchParams(search)
  const as = params.get('mockAs')
  if (isPerspective(as)) writeScenario({ as })
  const edge = params.get('mockEdge')
  if (edge !== null) writeScenario({ edge: isEdge(edge) ? edge : null, edgePath: params.get('mockEdgePath') })
  const panel = params.get('mockPanel')
  if (panel !== null) writeScenario({ panel: panel === '1' })
}

// ── 5명 넘는 진행 중 여정 ───────────────────────────────────────

export const FUKUOKA = 'trip-fukuoka'

const extraUsers = [
  { id: 'user-haneul', nickname: '하늘', profileImageUrl: null },
  { id: 'user-doyun', nickname: '도윤', profileImageUrl: null },
  { id: 'user-seoyeon', nickname: '서연', profileImageUrl: null },
]

const fukuokaTrip: MockTrip = {
  tripId: FUKUOKA,
  groupId: 'group-fukuoka',
  groupName: '후쿠오카 6인 여행',
  placeLabel: '후쿠오카와 유후인, 벳푸 온천 마을까지 천천히 한 바퀴 돌아보기',
  countryCode: null,
  currency: 'JPY',
  startDate: '2026-11-12',
  endDate: '2026-11-16',
  budgetKrw: 3_000_000,
  status: 'ONGOING',
  inviteCode: 'F6K8RN',
  fxPolicy: 'SPOT_AT_PAYMENT',
  version: 1,
}

const fukuokaMembers: MockMembership[] = [
  [USER.junyong, 'LEADER'],
  [USER.minji, 'MEMBER'],
  [USER.taehyeon, 'MEMBER'],
  [USER.subin, 'MEMBER'],
  ['user-doyun', 'MEMBER'],
  ['user-seoyeon', 'MEMBER'],
].map(([userId, role], i) => ({
  membershipId: `mem-fukuoka-${i + 1}`,
  tripId: FUKUOKA,
  userId,
  role: role as MockMembership['role'],
  joinOrder: i + 1,
  leftAt: null,
}))

const ALL6 = fukuokaMembers.map((m) => m.membershipId)

function fukuokaExpense(id: string, at: string, merchantName: string, payer: number, krwAmount: number, originalAmount: string): MockExpense {
  return {
    id,
    tripId: FUKUOKA,
    occurredAt: `2026-11-${at}:00+09:00`,
    merchantName,
    payerMembershipId: ALL6[payer],
    status: 'SHARED',
    krwAmount,
    grossKrwAmount: krwAmount,
    originalAmount,
    originalCurrency: 'JPY',
    participantMembershipIds: [...ALL6],
    changed: false,
    duplicateGroupId: null,
    refunds: [],
    origin: 'AUTO',
    paymentMethodId: payer === 0 ? 'pm-toss-check' : 'pm-other',
    version: 1,
  }
}

const fukuokaExpenses: MockExpense[] = [
  fukuokaExpense('fuk-ichiran', '12T12:30', '이치란 라멘 하카타점', 0, 66_180, '7200'),
  fukuokaExpense('fuk-yatai', '12T20:10', '나카스 포장마차', 1, 110_300, '12000'),
  fukuokaExpense('fuk-yufuin', '13T10:40', '유후인 노모리 열차', 4, 165_450, '18000'),
]

/** 개발 서버 픽스처: 5명 넘는 진행 중 여정(한 번만 넣는다). 여정 없음 시나리오(yj:mock:trips=none)에서는 넣지 않는다 */
export function seedLargeTrip() {
  for (const user of extraUsers) if (!db.users.some((u) => u.id === user.id)) db.users.push({ ...user })
  if (db.trips.some((t) => t.tripId === FUKUOKA)) return
  if (storage()?.getItem('yj:mock:trips')?.split(',').includes('none')) return
  db.trips.push(structuredClone(fukuokaTrip))
  db.memberships.push(...structuredClone(fukuokaMembers))
  db.expenses.push(...structuredClone(fukuokaExpenses))
}

/** 시점을 바꾼다: 그 사용자로 로그인한 것처럼(마지막 여정은 그 사람이 볼 수 있는 여정으로) */
export function applyPerspective(as: MockPerspective) {
  seedLargeTrip()
  db.meUserId = PERSPECTIVE_USER[as]
  db.lastViewedTripId = as === 'other' ? null : TRIP.osaka
}

// ── 엣지 응답 ───────────────────────────────────────────────────

const EDGE_SKIP = ['/api/auth/session', '/api/users/me', '/api/consents/documents']

/** 켜 둔 엣지 응답을 다음 요청 한 번에 돌려주는 핸들러(가장 앞에 둔다). 쓰고 나면 스위치를 끈다 */
export const edgeHandler: HttpHandler = http.all('/api/*', ({ request }) => {
  const { edge, edgePath } = readScenario()
  if (!edge) return
  const path = new URL(request.url).pathname
  if (edgePath ? !path.includes(edgePath) : EDGE_SKIP.some((p) => path.startsWith(p))) return
  writeScenario({ edge: null, edgePath: null })
  if (edge === '404') return mockError('NOT_FOUND', 404)
  if (edge === '429') {
    const res = mockError('RATE_LIMITED', 429)
    return new HttpResponse(res.body, { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } })
  }
  return mockError('VERSION_CONFLICT', 409)
})
