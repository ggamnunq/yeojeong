import { INVITE_CODE_ALPHABET, normalizeInviteCode, type TripVersionRequest } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import {
  activeMembership,
  db,
  findTrip,
  memberSummary,
  MOCK_NOW,
  SUPPORTED_CURRENCIES,
  tripDetail,
  type MockTrip,
} from '../../mocks/data'
import { deletedGroupIds, ensureDemoTrips } from '../../mocks/seeds'
import { api, denyUnlessAuthenticated, mockError, noContent, requireMember, type NoContent } from '../../mocks/utils'
import {
  addDays,
  daysBetween,
  GROUP_NAME_MAX_LENGTH,
  PLACE_LABEL_MAX_LENGTH,
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
  PlaceInput,
  SupportedCurrency,
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

/** 서버 TripDetail 응답(S2A): 부록 B + permissions · todayDayIndex · city(자유 입력 장소면 null) */
function tripResponse(trip: MockTrip): TripInfo {
  const detail: TripInfo = tripDetail(trip)
  return {
    ...detail,
    todayDayIndex: trip.status === 'ONGOING' ? tripDayIndex(detail, MOCK_TODAY) : null,
    permissions: tripPermissions(detail, MOCK_TODAY),
  }
}

type FieldError = { path: string; code: string; message: string }

function validationFailed(fields: FieldError[]) {
  return mockError('VALIDATION_FAILED', 400, { fields })
}

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** 서버와 같다: 앞뒤 공백을 빼고 1~40자(S5) */
function validatePlace(place: PlaceInput | undefined, fields: FieldError[]) {
  const label = typeof place?.label === 'string' ? place.label.trim() : ''
  if (label.length < 1) fields.push({ path: 'place.label', code: 'isLength', message: '여행 장소를 입력해 주세요' })
  else if (label.length > PLACE_LABEL_MAX_LENGTH) fields.push({ path: 'place.label', code: 'isLength', message: '여행 장소는 40자까지예요' })
}

/** 서버와 같다: 필수, 목록 안 통화(대소문자·공백은 정리) */
function normalizeCurrency(currency: unknown): string | null {
  return typeof currency === 'string' ? currency.trim().toUpperCase() : null
}
function validateCurrency(currency: unknown, fields: FieldError[]) {
  const code = normalizeCurrency(currency)
  if (!code) fields.push({ path: 'currency', code: 'isIn', message: '통화를 골라 주세요' })
  else if (!SUPPORTED_CURRENCIES.some((c) => c.code === code)) fields.push({ path: 'currency', code: 'isIn', message: '지원하지 않는 통화예요' })
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
  api.get<SupportedCurrency[]>('/api/currencies', () => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    return HttpResponse.json([...SUPPORTED_CURRENCIES])
  }),

  api.post<CreateTripResponse, CreateTripRequest>('/api/trips', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const body: Partial<CreateTripRequest> = await request.json()
    const fields: FieldError[] = []
    validateGroupName(body.groupName, fields)
    validatePlace(body.place, fields)
    validateCurrency(body.currency, fields)
    validatePeriod(body.startDate, body.endDate, fields)
    validateBudget(body.budgetKrw, fields)
    if (fields.length > 0) return validationFailed(fields)

    const id = shortId()
    const trip: MockTrip = {
      tripId: `trip-${id}`,
      groupId: `group-${id}`,
      groupName: body.groupName!.trim(),
      placeLabel: body.place!.label.trim(),
      countryCode: null,
      currency: normalizeCurrency(body.currency)!,
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
      if (field === 'place') return body.place!.label.trim() !== trip.placeLabel
      if (field === 'currency') return normalizeCurrency(body.currency) !== trip.currency
      return body[field] !== current[field]
    }
    const locked = (['groupName', 'place', 'currency', 'startDate', 'endDate', 'budgetKrw'] as const).filter((f) => changed(f) && !editable.includes(f))
    if (locked.length > 0) return domainError.phase({ lockedFields: locked })

    const fields: FieldError[] = []
    if (body.groupName !== undefined) validateGroupName(body.groupName, fields)
    if (body.place !== undefined) validatePlace(body.place, fields)
    if (body.currency !== undefined) validateCurrency(body.currency, fields)
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
      const label = body.place.label.trim()
      // 장소를 바꿔도 통화는 그대로(S5). label이 바뀌면 옛 countryCode는 비운다
      if (label !== trip.placeLabel) trip.countryCode = null
      trip.placeLabel = label
    }
    if (body.currency !== undefined) {
      const code = normalizeCurrency(body.currency)!
      // 통화가 바뀌면 고정 환율은 결제 시점 환율로 되돌린다(FR-302)
      if (code !== trip.currency && trip.fxPolicy === 'FIXED') trip.fxPolicy = 'SPOT_AT_PAYMENT'
      trip.currency = code
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
