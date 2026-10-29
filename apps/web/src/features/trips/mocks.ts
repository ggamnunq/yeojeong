import { INVITE_CODE_ALPHABET, normalizeInviteCode, type TripVersionRequest } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import {
  activeMembership,
  db,
  findTrip,
  memberSummary,
  MOCK_NOW,
  tripDetail,
  type MockTrip,
} from '../../mocks/data'
import { deletedGroupIds, ensureDemoTrips } from '../../mocks/seeds'
import { api, denyUnlessAuthenticated, mockError, noContent, requireMember, type NoContent } from '../../mocks/utils'
import {
  addDays,
  daysBetween,
  GROUP_NAME_MAX_LENGTH,
  TRIP_BUDGET_MAX_KRW,
  TRIP_EDITABLE_FIELDS,
  TRIP_MAX_DAYS,
  TRIP_START_PAST_LIMIT_DAYS,
  tripDayIndex,
  tripPermissions,
} from './rules'
import type {
  CreateTripRequest,
  CreateTripResponse,
  EndPreviewResponse,
  EndTripResponse,
  InvitePreview,
  JoinTripResponse,
  Place,
  PlaceInput,
  TripEditableField,
  TripInfo,
  UpdateTripRequest,
} from './types'

// 여정 생성·참여·시작·종료·수정·그룹 삭제 목(기능명세 6-3). db를 고치고, 테스트마다 resetMockDb()가 되돌린다.
// 도메인 코드(NOT_LEADER·TRIP_PHASE_INVALID·VERSION_CONFLICT·INVITE_*)의 status·문구는 shared TRIP_ERRORS 기본값.
//
// 참여용 데모 여정(준용은 멤버 아님, 처음 조회할 때 db에 넣는다):
//   T4K9YP 도쿄 먹방 여행(시작 전, 3명) · D7N3QA 다낭 가족여행(진행 중, 2명) · X2P8RW 타이베이 주말(준용 강퇴 이력 → 403)
//   그 밖에 J3W9PZ 제주(종료 → 409), K7M2QX 오사카·B8N4RT 부산(이미 멤버)
// 개발 서버 시나리오는 아래 'yj:mock:trips' 참고(콘솔에서 설정 후 새로고침).

const MOCK_TODAY = MOCK_NOW.slice(0, 10)

const PLACES: Place[] = [
  { countryCode: 'JP', countryName: '일본', city: '오사카', label: '일본 오사카', currency: 'JPY' },
  { countryCode: 'JP', countryName: '일본', city: '도쿄', label: '일본 도쿄', currency: 'JPY' },
  { countryCode: 'JP', countryName: '일본', city: '교토', label: '일본 교토', currency: 'JPY' },
  { countryCode: 'JP', countryName: '일본', city: '후쿠오카', label: '일본 후쿠오카', currency: 'JPY' },
  { countryCode: 'JP', countryName: '일본', city: '삿포로', label: '일본 삿포로', currency: 'JPY' },
  { countryCode: 'JP', countryName: '일본', city: '오키나와', label: '일본 오키나와', currency: 'JPY' },
  { countryCode: 'TW', countryName: '대만', city: '타이베이', label: '대만 타이베이', currency: 'TWD' },
  { countryCode: 'TH', countryName: '태국', city: '방콕', label: '태국 방콕', currency: 'THB' },
  { countryCode: 'TH', countryName: '태국', city: '치앙마이', label: '태국 치앙마이', currency: 'THB' },
  { countryCode: 'VN', countryName: '베트남', city: '다낭', label: '베트남 다낭', currency: 'VND' },
  { countryCode: 'VN', countryName: '베트남', city: '하노이', label: '베트남 하노이', currency: 'VND' },
  { countryCode: 'VN', countryName: '베트남', city: '호찌민', label: '베트남 호찌민', currency: 'VND' },
  { countryCode: 'SG', countryName: '싱가포르', city: '싱가포르', label: '싱가포르', currency: 'SGD' },
  { countryCode: 'HK', countryName: '홍콩', city: '홍콩', label: '홍콩', currency: 'HKD' },
  { countryCode: 'PH', countryName: '필리핀', city: '세부', label: '필리핀 세부', currency: 'PHP' },
  { countryCode: 'US', countryName: '미국', city: '뉴욕', label: '미국 뉴욕', currency: 'USD' },
  { countryCode: 'US', countryName: '미국', city: '호놀룰루', label: '미국 호놀룰루', currency: 'USD' },
  { countryCode: 'FR', countryName: '프랑스', city: '파리', label: '프랑스 파리', currency: 'EUR' },
  { countryCode: 'GB', countryName: '영국', city: '런던', label: '영국 런던', currency: 'GBP' },
  { countryCode: 'AU', countryName: '호주', city: '시드니', label: '호주 시드니', currency: 'AUD' },
  { countryCode: 'KR', countryName: '대한민국', city: '서울', label: '서울', currency: 'KRW' },
  { countryCode: 'KR', countryName: '대한민국', city: '부산', label: '부산', currency: 'KRW' },
  { countryCode: 'KR', countryName: '대한민국', city: '제주', label: '제주', currency: 'KRW' },
  { countryCode: 'KR', countryName: '대한민국', city: '강릉', label: '강릉', currency: 'KRW' },
  { countryCode: 'KR', countryName: '대한민국', city: '경주', label: '경주', currency: 'KRW' },
  { countryCode: 'KR', countryName: '대한민국', city: '여수', label: '여수', currency: 'KRW' },
]

// 개발 서버 전용 시나리오(쉼표로 여러 개): localStorage 'yj:mock:trips' =
//   'none' 여정 없음 · 'busan-leader' 부산(시작 전)을 준용이 그룹장으로 · 'expired' 부산 종료일이 지남(Q-26)
try {
  const scenario = new Set((typeof localStorage === 'undefined' ? null : localStorage.getItem('yj:mock:trips'))?.split(',') ?? [])
  if (scenario.has('none')) db.memberships = db.memberships.filter((m) => m.userId !== db.meUserId)
  if (scenario.has('busan-leader')) {
    for (const m of db.memberships) if (m.tripId === 'trip-busan') m.role = m.userId === db.meUserId ? 'LEADER' : 'MEMBER'
  }
  if (scenario.has('expired')) Object.assign(findTrip('trip-busan') ?? {}, { startDate: '2026-11-01', endDate: '2026-11-02' })
} catch {
  // 저장소를 못 쓰는 환경
}

// ── 공통 ──────────────────────────────────────────────────────────

const domainError = {
  notLeader: () => mockError('NOT_LEADER'),
  phase: (details?: Record<string, unknown>) => mockError('TRIP_PHASE_INVALID', undefined, details),
  versionConflict: (trip: MockTrip) => mockError('VERSION_CONFLICT', undefined, { current: tripResponse(trip) }),
  inviteInvalid: () => mockError('INVITE_CODE_INVALID'),
  inviteEnded: () => mockError('INVITE_TRIP_ENDED'),
  kicked: () => mockError('MEMBER_KICKED'),
  alreadyMember: () => mockError('ALREADY_MEMBER'),
}

/** 서버 TripDetail 응답(S2A): 부록 B + permissions · todayDayIndex · city */
function tripResponse(trip: MockTrip): TripInfo {
  const detail: TripInfo = tripDetail(trip)
  const place = PLACES.find((p) => p.label === trip.placeLabel)
  return {
    ...detail,
    city: place?.city ?? null,
    todayDayIndex: trip.status === 'ONGOING' ? tripDayIndex(detail, MOCK_TODAY) : null,
    permissions: tripPermissions(detail, MOCK_TODAY),
  }
}

type FieldError = { path: string; code: string; message: string }

function validationFailed(fields: FieldError[]) {
  return mockError('VALIDATION_FAILED', 400, { fields })
}

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

function validatePlace(place: PlaceInput | undefined, fields: FieldError[]) {
  if (!place || !PLACES.some((p) => p.countryCode === place.countryCode && p.label === place.label)) {
    fields.push({ path: 'place', code: 'isDefined', message: '장소를 골라 주세요' })
  }
}

function validatePeriod(start: unknown, end: unknown, fields: FieldError[], { checkStart = true } = {}) {
  if (!isDate(start)) return fields.push({ path: 'startDate', code: 'isDateString', message: '출발일을 골라 주세요' })
  if (!isDate(end)) return fields.push({ path: 'endDate', code: 'isDateString', message: '도착일을 골라 주세요' })
  if (checkStart && start < addDays(MOCK_TODAY, -TRIP_START_PAST_LIMIT_DAYS)) {
    fields.push({ path: 'startDate', code: 'minDate', message: '출발일을 확인해 주세요' })
  }
  if (end < start || daysBetween(start, end) + 1 > TRIP_MAX_DAYS) {
    fields.push({ path: 'endDate', code: 'period', message: '종료일을 확인해 주세요' })
  }
}

function validateBudget(budget: unknown, fields: FieldError[]) {
  if (!Number.isInteger(budget) || (budget as number) < 1 || (budget as number) > TRIP_BUDGET_MAX_KRW) {
    fields.push({ path: 'budgetKrw', code: 'range', message: '예산을 확인해 주세요' })
  }
}

function validateGroupName(name: unknown, fields: FieldError[]) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length < 1 || trimmed.length > GROUP_NAME_MAX_LENGTH) {
    fields.push({ path: 'groupName', code: 'length', message: '그룹명을 1~20자로 적어 주세요' })
  }
}

function newInviteCode() {
  for (;;) {
    const code = Array.from({ length: 6 }, () => INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)]).join('')
    if (!db.trips.some((t) => t.inviteCode === code)) return code
  }
}

const shortId = () => crypto.randomUUID().slice(0, 8)

/** 여정 API 공통: 멤버 · 그룹장 확인. 통과면 여정과 내 멤버십 */
function requireLeader(tripId: string) {
  const { denied, membership } = requireMember(tripId)
  if (denied) return { denied }
  const trip = findTrip(tripId)
  if (!trip) return { denied: mockError('NOT_FOUND', 404) }
  if (membership.role !== 'LEADER') return { denied: domainError.notLeader() }
  return { trip, membership }
}

function findByInvite(raw: string) {
  ensureDemoTrips()
  const code = normalizeInviteCode(raw)
  return code ? db.trips.find((t) => t.inviteCode === code) : undefined
}

/** 초대코드 조회·참여 공통 검사. 통과면 여정 */
function checkInvite(raw: string): { denied: Response; trip?: undefined } | { denied?: undefined; trip: MockTrip } {
  const denied = denyUnlessAuthenticated()
  if (denied) return { denied }
  const trip = findByInvite(raw)
  if (!trip) return { denied: domainError.inviteInvalid() }
  if (trip.status === 'ENDED') return { denied: domainError.inviteEnded() }
  const kicked = db.memberships.some(
    (m) => m.tripId === trip.tripId && m.userId === db.meUserId && m.leaveReason === 'KICKED',
  )
  if (kicked) return { denied: domainError.kicked() }
  return { trip }
}

// ── 핸들러 ────────────────────────────────────────────────────────

export const handlers: HttpHandler[] = [
  api.get<Place[]>('/api/places', ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const query = (new URL(request.url).searchParams.get('query') ?? '').trim()
    const items = query
      ? PLACES.filter((p) => [p.label, p.city ?? '', p.countryName].some((text) => text.includes(query)))
      : PLACES
    return HttpResponse.json(items.slice(0, 20))
  }),

  api.post<CreateTripResponse, CreateTripRequest>('/api/trips', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const body: Partial<CreateTripRequest> = await request.json()
    const fields: FieldError[] = []
    validateGroupName(body.groupName, fields)
    validatePlace(body.place, fields)
    validatePeriod(body.startDate, body.endDate, fields)
    validateBudget(body.budgetKrw, fields)
    if (fields.length > 0) return validationFailed(fields)

    const place = PLACES.find((p) => p.countryCode === body.place!.countryCode && p.label === body.place!.label)!
    const id = shortId()
    const trip: MockTrip = {
      tripId: `trip-${id}`,
      groupId: `group-${id}`,
      groupName: body.groupName!.trim(),
      placeLabel: place.label,
      countryCode: place.countryCode,
      currency: place.currency,
      startDate: body.startDate!,
      endDate: body.endDate!,
      budgetKrw: body.budgetKrw!,
      status: 'UPCOMING',
      inviteCode: newInviteCode(),
      fxPolicy: 'SPOT_AT_PAYMENT',
      version: 0,
    }
    db.trips.push(trip)
    db.memberships.push({ membershipId: `mem-${id}`, tripId: trip.tripId, userId: db.meUserId, role: 'LEADER', joinOrder: 1, leftAt: null })
    const result: CreateTripResponse = { tripId: trip.tripId, groupId: trip.groupId, inviteCode: trip.inviteCode }
    return HttpResponse.json(result, { status: 201 })
  }),

  api.patch<TripInfo, UpdateTripRequest>('/api/trips/:tripId', async ({ params, request }) => {
    const { denied, trip } = requireLeader(String(params.tripId))
    if (denied) return denied
    if (trip.status === 'ENDED') return domainError.phase()
    const body = await request.json()
    if (body.version !== trip.version) return domainError.versionConflict(trip)

    const editable = TRIP_EDITABLE_FIELDS[trip.status]
    const current = { groupName: trip.groupName, currency: trip.currency, startDate: trip.startDate, endDate: trip.endDate, budgetKrw: trip.budgetKrw }
    const changed = (field: TripEditableField) => {
      if (body[field] === undefined) return false
      if (field === 'place') return body.place!.label !== trip.placeLabel || body.place!.countryCode !== trip.countryCode
      return body[field] !== current[field]
    }
    const locked = (['groupName', 'place', 'startDate', 'endDate', 'budgetKrw'] as const).filter((f) => changed(f) && !editable.includes(f))
    if (locked.length > 0) return domainError.phase({ lockedFields: locked })

    const fields: FieldError[] = []
    if (body.groupName !== undefined) validateGroupName(body.groupName, fields)
    if (body.place !== undefined) validatePlace(body.place, fields)
    if (body.budgetKrw !== undefined) validateBudget(body.budgetKrw, fields)
    const start = body.startDate ?? trip.startDate
    const end = body.endDate ?? trip.endDate
    if (body.startDate !== undefined || body.endDate !== undefined) {
      validatePeriod(start, end, fields, { checkStart: body.startDate !== undefined })
      if (trip.status === 'ONGOING' && end < MOCK_TODAY) {
        fields.push({ path: 'endDate', code: 'minDate', message: '종료일을 확인해 주세요' })
      }
    }
    if (fields.length > 0) return validationFailed(fields)

    if (body.groupName !== undefined) trip.groupName = body.groupName.trim()
    if (body.place !== undefined) {
      const place = PLACES.find((p) => p.label === body.place!.label)!
      // 통화는 처음 만들 때 정한 값을 유지한다(FR-302 수락 기준 1: 교토로 바꿔도 JPY)
      trip.placeLabel = place.label
      trip.countryCode = place.countryCode
    }
    trip.startDate = start
    trip.endDate = end
    if (body.budgetKrw !== undefined) trip.budgetKrw = body.budgetKrw
    trip.version += 1
    return HttpResponse.json(tripResponse(trip))
  }),

  api.post<TripInfo, TripVersionRequest>('/api/trips/:tripId/start', async ({ params, request }) => {
    const { denied, trip } = requireLeader(String(params.tripId))
    if (denied) return denied
    // Q-26: 종료일이 지난 시작 전 여정은 시작할 수 없다(기간을 고쳐서 시작)
    if (trip.status !== 'UPCOMING' || trip.endDate < MOCK_TODAY) return domainError.phase()
    const { version } = await request.json()
    if (version !== trip.version) return domainError.versionConflict(trip)
    trip.status = 'ONGOING'
    trip.version += 1
    return HttpResponse.json(tripResponse(trip))
  }),

  api.get<EndPreviewResponse>('/api/trips/:tripId/end-preview', ({ params }) => {
    const { denied, trip } = requireLeader(String(params.tripId))
    if (denied) return denied
    if (trip.status !== 'ONGOING') return domainError.phase()
    const body: EndPreviewResponse = {
      pendingCount: db.expenses.filter((e) => e.tripId === trip.tripId && e.status === 'PENDING').length,
      autoEndAt: `${trip.endDate}T23:59:59+09:00`,
    }
    return HttpResponse.json(body)
  }),

  api.post<EndTripResponse, TripVersionRequest>('/api/trips/:tripId/end', async ({ params, request }) => {
    const { denied, trip } = requireLeader(String(params.tripId))
    if (denied) return denied
    if (trip.status !== 'ONGOING') return domainError.phase()
    const { version } = await request.json()
    if (version !== trip.version) return domainError.versionConflict(trip)
    const pending = db.expenses.filter((e) => e.tripId === trip.tripId && e.status === 'PENDING')
    for (const e of pending) e.status = 'PERSONAL'
    trip.status = 'ENDED'
    trip.version += 1
    const body: EndTripResponse = { trip: tripResponse(trip), settlementId: `settlement-${trip.tripId}`, autoPersonalizedCount: pending.length }
    return HttpResponse.json(body)
  }),

  api.delete<NoContent>('/api/groups/:groupId', ({ params }) => {
    const trip = db.trips.find((t) => t.groupId === String(params.groupId))
    if (!trip) return denyUnlessAuthenticated() ?? mockError('NOT_FOUND', 404)
    const { denied } = requireLeader(trip.tripId)
    if (denied) return denied
    if (trip.status !== 'UPCOMING') return domainError.phase()
    // 소프트 삭제: 목록·멤버 화면에서 사라진다. db.trips 배열은 그대로 두고 빼야 삭제 기억(deletedGroupIds)이 유지된다
    deletedGroupIds().add(trip.groupId)
    db.trips.splice(db.trips.indexOf(trip), 1)
    db.memberships = db.memberships.filter((m) => m.tripId !== trip.tripId)
    return noContent()
  }),

  api.get<InvitePreview>('/api/invites/:code', ({ params }) => {
    const { denied, trip } = checkInvite(String(params.code))
    if (denied) return denied
    const members = db.memberships
      .filter((m) => m.tripId === trip.tripId && m.leftAt === null)
      .sort((a, b) => a.joinOrder - b.joinOrder)
    const mine = activeMembership(trip.tripId, db.meUserId)
    const body: InvitePreview = {
      groupName: trip.groupName,
      placeLabel: trip.placeLabel,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      memberCount: members.length,
      membersPreview: members.slice(0, 4).map((m) => {
        const { nickname, profileImageUrl } = memberSummary(m)
        return { nickname, profileImageUrl }
      }),
      alreadyMember: Boolean(mine),
      tripId: mine ? trip.tripId : null,
    }
    return HttpResponse.json(body)
  }),

  api.post<JoinTripResponse>('/api/invites/:code/join', ({ params }) => {
    const { denied, trip } = checkInvite(String(params.code))
    if (denied) return denied
    if (activeMembership(trip.tripId, db.meUserId)) return domainError.alreadyMember()
    const members = db.memberships.filter((m) => m.tripId === trip.tripId)
    const joinOrder = Math.max(0, ...members.map((m) => m.joinOrder)) + 1
    db.memberships.push({ membershipId: `mem-${shortId()}`, tripId: trip.tripId, userId: db.meUserId, role: 'MEMBER', joinOrder, leftAt: null })
    const body: JoinTripResponse = { tripId: trip.tripId, groupId: trip.groupId, status: trip.status }
    return HttpResponse.json(body, { status: 201 })
  }),
]
