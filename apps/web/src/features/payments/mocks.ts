import type { AddOutOfPeriodExpensesRequest, ClassifyExpenseRequest, DismissDuplicateRequest, ErrorCode } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import type { EditBlockReason } from '../../api'
import { splitEvenly } from '../../ds'
import {
  dateDiff,
  db,
  expenseListItem,
  findMembership,
  findTrip,
  meFirst,
  MEMBER,
  memberSummary,
  MOCK_NOW,
  userMethods,
  visibleExpenses,
  type MockExpense,
  type MockMembership,
} from '../../mocks/data'
import { api, mockError, noContent, requireMember, type NoContent } from '../../mocks/utils'
import { finConsentRequired, walletMock } from '../wallet/mocks'
import { seedJejuSettlement } from '../../mocks/seeds'
import { clock } from './clock'
import type { ExpenseRow, ExpensesPage, OutOfPeriodAddResponse, OutOfPeriodCandidate, PaymentDetail } from './types'

// 결제 목. 응답 모양은 서버 S2B-2(`packages/shared/src/api/expenses.ts`, `apps/api/src/expenses/README.md`)와 같다.
// 규칙: 기능명세 6-3 expenses, 4-1-4~4-1-6, 4-3. db를 고치면 테스트마다 resetMockDb()로 되돌아간다.

// 목 세계의 "지금"은 샘플 시점(11.13 18:34)이다 — 타임라인 지금 노드 시각이 샘플과 맞게
clock.now = () => Date.parse(MOCK_NOW)

/** 서버 에러 형식. status·문구는 @yeojeong/shared ERRORS(도메인 코드 포함) 기본값 */
export const fail = (code: ErrorCode, details?: Record<string, unknown>) => mockError(code, undefined, details)

const notAuthor = () => fail('NOT_AUTHOR')

// ── 종료된 여정 샘플(제주, WF-39 잠금 · 탈퇴한 멤버) ─────────────────
// 중앙 샘플에는 종료 여정 결제가 없다. 현황·정산 목(W4F)이 넣는 제주 정산 샘플(탈퇴한 멤버 포함)을 같이 써서
// 결제내역과 정산이 같은 장부를 본다. 결제 핸들러가 처음 불릴 때 넣고, db를 되돌리면 다시 넣는다.
export const ensureSeed = () => seedJejuSettlement({ withdrawn: true })

// ── 변경 이력 상태(서버 firstSharedAt · 중복 해제 기록) ──────────────
// db.expenses 배열·항목은 되돌릴 때마다 새로 만들어지므로 WeakMap/WeakSet이면 함께 초기화된다.

const sharedOnce = new WeakSet<MockExpense>()
const dismissedPairs = new WeakMap<MockExpense[], Set<string>>()
const pairKey = (a: string, b: string) => [a, b].sort().join('|')
const dismissed = () => {
  let set = dismissedPairs.get(db.expenses)
  if (!set) dismissedPairs.set(db.expenses, (set = new Set()))
  return set
}
const wasShared = (e: MockExpense) => sharedOnce.has(e) || e.status === 'SHARED' || e.changed

// ── 응답 모양 ──────────────────────────────────────────────────────

const membership = findMembership

function period(tripId: string): ExpensesPage['period'] {
  const trip = findTrip(tripId)!
  const today = MOCK_NOW.slice(0, 10)
  const inPeriod = trip.status === 'ONGOING' && today >= trip.startDate && today <= trip.endDate
  return {
    tripStatus: trip.status,
    startDate: trip.startDate,
    endDate: trip.endDate,
    days: dateDiff(trip.endDate, trip.startDate) + 1,
    todayDayIndex: inPeriod ? dateDiff(today, trip.startDate) + 1 : null,
  }
}

/** 원통화 순액·취소 줄 원통화(부모와 같은 환율, 4-1-4) */
export function expenseRow(e: MockExpense): ExpenseRow {
  const original = Number(e.originalAmount)
  const ratio = e.grossKrwAmount > 0 ? original / e.grossKrwAmount : 0
  const digits = e.originalCurrency === 'JPY' || e.originalCurrency === 'KRW' ? 0 : 2
  const fix = (n: number) => n.toFixed(digits)
  return {
    ...expenseListItem(e),
    // 직접 입력 결제의 작성자(가져온 결제는 null)
    createdByMembershipId: e.createdByMembershipId ?? null,
    grossKrwAmount: e.grossKrwAmount,
    netOriginalAmount: fix(Math.max(0, ratio * e.krwAmount)),
    refunds: e.refunds.map((r) => ({ ...r, originalAmount: fix(ratio * r.krwAmount) })),
  }
}

/** 바꿀 수 있는 사람: 직접 입력 결제는 작성자, 가져온 결제는 결제자(FR-425) */
export const actorOf = (e: MockExpense) => (e.origin === 'MANUAL' ? (e.createdByMembershipId ?? e.payerMembershipId) : e.payerMembershipId)

export function editBlock(e: MockExpense, me: MockMembership): EditBlockReason | null {
  const trip = findTrip(e.tripId)!
  const manual = e.origin === 'MANUAL'
  if (trip.status === 'ENDED') return 'TRIP_ENDED'
  // 직접 입력 결제는 예정 여정에서도 바꿀 수 있다(S7)
  if (trip.status === 'UPCOMING' && !manual) return 'TRIP_NOT_STARTED'
  if (membership(e.payerMembershipId)?.leftAt || (manual && membership(actorOf(e))?.leftAt)) return 'PAYER_LEFT'
  if (actorOf(e) !== me.membershipId) return manual ? 'NOT_AUTHOR' : 'NOT_PAYER'
  return null
}

/** 나머지를 지는 사람: 결제자가 부담 인원에 있으면 결제자, 없으면 가입 순 첫 사람(Q-08) */
function remainderHolder(e: MockExpense) {
  const ids = e.participantMembershipIds ?? []
  if (ids.includes(e.payerMembershipId)) return e.payerMembershipId
  return [...ids].sort((a, b) => (membership(a)?.joinOrder ?? 0) - (membership(b)?.joinOrder ?? 0))[0] ?? null
}

/** 부담 인원 후보: 활성 멤버 + 지금 부담 인원의 나간 멤버(해제만, Q-30). 나 → 가입 순 */
function candidatesOf(e: MockExpense) {
  const current = e.participantMembershipIds ?? []
  return meFirst(
    db.memberships
      .filter((m) => m.tripId === e.tripId && (m.leftAt === null || current.includes(m.membershipId)))
      .map((m) => memberSummary(m)),
  )
}

export function expenseDetail(e: MockExpense, me: MockMembership): PaymentDetail {
  const isPayer = e.payerMembershipId === me.membershipId
  const isAuthor = actorOf(e) === me.membershipId
  const walletEntry = db.walletEntries.find((w) => w.expenseId === e.id && w.userId === me.userId)
  const reason = editBlock(e, me)
  const canEdit = reason === null
  const ids = e.status === 'SHARED' ? (e.participantMembershipIds ?? []) : []
  const split = ids.length > 0 ? splitEvenly(e.krwAmount, ids.length) : null
  const holder = split ? remainderHolder(e) : null
  const trip = findTrip(e.tripId)!
  const active = db.memberships.filter((m) => m.tripId === e.tripId && m.leftAt === null).map((m) => m.membershipId)
  const detail: PaymentDetail = {
    ...expenseRow(e),
    paymentMethodLabel: isPayer ? (db.paymentMethods.find((p) => p.id === e.paymentMethodId)?.label ?? null) : null,
    fx:
      e.originalCurrency === 'KRW'
        ? null
        : { rate: '9.192', displayUnit: 100, source: '하나은행 매매기준율', rateAt: e.occurredAt, policy: trip.fxPolicy },
    shares: ids.map((membershipId) => ({
      membershipId,
      amountKrw: split!.perPerson + (membershipId === holder ? split!.remainder : 0),
      isRemainderHolder: membershipId === holder,
    })),
    perPersonKrw: split?.perPerson ?? null,
    remainderKrw: split?.remainder ?? 0,
    remainderHolderMembershipId: holder,
    permissions: { canEdit, reason, isPayer, isAuthor },
    duplicate: e.duplicateGroupId ? { groupId: e.duplicateGroupId, canDismiss: isAuthor && canEdit } : null,
    participantCandidates: canEdit ? candidatesOf(e) : null,
    defaultParticipantMembershipIds: canEdit ? (e.status === 'SHARED' ? [...ids] : active) : null,
  }
  // 내 지갑에 같은 결제가 있으면 그 항목 ID
  return { ...detail, walletEntryId: walletEntry?.id ?? null }
}

// ── 중복 의심(4-1-5) ─────────────────────────────────────────────

export function leaveDuplicateGroup(e: MockExpense) {
  const groupId = e.duplicateGroupId
  if (!groupId) return
  e.duplicateGroupId = null
  const rest = db.expenses.filter((x) => x.duplicateGroupId === groupId)
  if (rest.length < 2) for (const x of rest) x.duplicateGroupId = null
}

/** 직접 입력이 끼면 같은 여정·같은 원화·±30분·결제자 무관(Q-42), 아니면 기존 규칙 */
const sameManualPayment = (a: MockExpense, b: MockExpense) =>
  (a.origin === 'MANUAL' || b.origin === 'MANUAL') &&
  a.krwAmount === b.krwAmount &&
  Math.abs(Date.parse(a.occurredAt) - Date.parse(b.occurredAt)) <= 30 * 60_000

export function detectDuplicate(e: MockExpense) {
  if (e.status !== 'SHARED') return
  const match = db.expenses.find(
    (x) =>
      x !== e &&
      x.tripId === e.tripId &&
      x.status === 'SHARED' &&
      sameManualPayment(x, e) &&
      !dismissed().has(pairKey(x.id, e.id)),
  ) ?? db.expenses.find(
    (x) =>
      x !== e &&
      x.tripId === e.tripId &&
      x.status === 'SHARED' &&
      x.payerMembershipId !== e.payerMembershipId &&
      x.merchantName === e.merchantName &&
      x.originalCurrency === e.originalCurrency &&
      Number(x.originalAmount) === Number(e.originalAmount) &&
      Math.abs(Date.parse(x.occurredAt) - Date.parse(e.occurredAt)) <= 120_000 &&
      !dismissed().has(pairKey(x.id, e.id)),
  )
  if (!match) return
  const groupId = match.duplicateGroupId ?? `dup-${match.id}`
  match.duplicateGroupId = groupId
  e.duplicateGroupId = groupId
}

// ── 기간 외 결제 후보(4-1-6, WF-43 샘플) ─────────────────────────────

type MockCandidate = OutOfPeriodCandidate & { side: 'BEFORE' | 'AFTER'; paymentMethodId: string }

const candidate = (id: string, at: string, merchantName: string, krw: number, pm: 'pm-shinhan' | 'pm-toss-check'): MockCandidate => ({
  candidateId: id,
  side: 'BEFORE',
  occurredAt: `2026-${at}:00+09:00`,
  localDate: `2026-${at.slice(0, 5)}`,
  merchantName,
  krwAmount: krw,
  originalAmount: String(krw),
  currency: 'KRW',
  paymentMethodLabel: pm === 'pm-shinhan' ? '신한카드 1102' : '토스뱅크 체크카드 1934',
  paymentMethodId: pm,
})

const CANDIDATES: Record<string, MockCandidate[]> = {
  [MEMBER.junyong]: [
    candidate('cand-agoda', '10-20T22:14', '아고다 · 오리엔탈 익스프레스 난바', 486_000, 'pm-shinhan'),
    candidate('cand-jejuair', '11-02T09:31', '제주항공 ICN–KIX 4매', 1_032_400, 'pm-shinhan'),
    candidate('cand-kkday', '11-10T13:05', 'KKday · 유니버설 스튜디오 입장권', 412_800, 'pm-toss-check'),
    candidate('cand-parking', '11-11T21:40', '인천공항 장기주차', 36_000, 'pm-toss-check'),
  ],
}

const addedExpenseId = (candidateId: string) => `exp-oop-${candidateId}`

/** 서버처럼 조회할 때마다 새로 발급하는 5분짜리 임시 식별자("{후보}.{만료 ms}.{순번}") */
export const OUT_OF_PERIOD_CANDIDATE_TTL_MS = 5 * 60_000
let issued = 0
const issueCandidateId = (base: string) => `${base}.${Date.now() + OUT_OF_PERIOD_CANDIDATE_TTL_MS}.${++issued}`
/** 서명 확인 흉내: 만료됐거나 모양이 아니면 null */
function verifyCandidateId(id: string): string | null {
  const [base, exp] = id.split('.')
  return base && Number(exp) > Date.now() ? base : null
}

function openCandidates(me: MockMembership, side?: 'BEFORE' | 'AFTER') {
  return (CANDIDATES[me.membershipId] ?? [])
    .filter((c) => (side ? c.side === side : true) && !db.expenses.some((e) => e.id === addedExpenseId(c.candidateId)))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}

// ── 공통 ─────────────────────────────────────────────────────────

const encodeCursor = (offset: number) => btoa(`o:${offset}`)
const decodeCursor = (cursor: string | null) => {
  if (!cursor) return 0
  try {
    return Number(atob(cursor).slice(2)) || 0
  } catch {
    return 0
  }
}

/** 멤버 확인 + 이 사람에게 보이는 결제(남의 미확정·개인은 404) */
export function visibleExpense(tripId: string, expenseId: string) {
  const check = requireMember(tripId)
  if (check.denied) return { denied: check.denied }
  ensureSeed()
  const expense = visibleExpenses(tripId).find((e) => e.id === expenseId)
  if (!expense) return { denied: mockError('NOT_FOUND', 404) }
  return { expense, me: check.membership }
}

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id))

export const handlers: HttpHandler[] = [
  api.get<ExpensesPage>('/api/trips/:tripId/expenses', ({ params, request }) => {
    const tripId = String(params.tripId)
    const check = requireMember(tripId)
    if (check.denied) return check.denied
    ensureSeed()
    const trip = findTrip(tripId)!
    if (trip.status === 'UPCOMING') return fail('TRIP_PHASE_INVALID')

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const day = url.searchParams.get('day')
    const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc'
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)
    const offset = decodeCursor(url.searchParams.get('cursor'))

    const mine = check.membership.membershipId
    const visible = visibleExpenses(tripId)
    const items = visible
      .filter((e) => !status || e.status === status)
      .map(expenseRow)
      .filter((item) => !day || item.dayIndex === Number(day))
      .sort((a, b) => {
        const byTime = a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)
        return order === 'asc' ? byTime : -byTime
      })
    const body: ExpensesPage = {
      items: items.slice(offset, offset + limit),
      nextCursor: offset + limit < items.length ? encodeCursor(offset + limit) : null,
      pendingCount: trip.status === 'ONGOING' ? visible.filter((e) => e.payerMembershipId === mine && e.status === 'PENDING').length : 0,
      showOutOfPeriodEntry: trip.status === 'ONGOING',
      period: period(tripId),
    }
    return HttpResponse.json(body)
  }),

  api.get<PaymentDetail>('/api/trips/:tripId/expenses/:expenseId', ({ params }) => {
    const found = visibleExpense(String(params.tripId), String(params.expenseId))
    if (found.denied) return found.denied
    return HttpResponse.json(expenseDetail(found.expense, found.me))
  }),

  api.put<PaymentDetail | NoContent, ClassifyExpenseRequest>('/api/trips/:tripId/expenses/:expenseId/classification', async ({ params, request }) => {
    const found = visibleExpense(String(params.tripId), String(params.expenseId))
    if (found.denied) return found.denied
    const { expense: e, me } = found
    // 잘못된 본문(400 VALIDATION_FAILED)도 흉내 내도록 넓혀 읽는다
    const body: Partial<Omit<ClassifyExpenseRequest, 'status'>> & { status?: string } = await request.json()

    const reason = editBlock(e, me)
    if (reason === 'TRIP_ENDED' || reason === 'TRIP_NOT_STARTED' || reason === 'PAYER_LEFT') return fail('EXPENSE_LOCKED')
    if (reason === 'NOT_PAYER') return fail('NOT_PAYER')
    if (reason === 'NOT_AUTHOR') return notAuthor()
    if (body.status !== 'PERSONAL' && body.status !== 'SHARED') {
      return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'status', code: 'isIn', message: '분류를 골라 주세요' }] })
    }

    const before = e.participantMembershipIds ?? []
    const active = db.memberships.filter((m) => m.tripId === e.tripId && m.leftAt === null).map((m) => m.membershipId)
    const ids =
      body.status === 'SHARED'
        ? [...new Set(body.participantMembershipIds ?? (e.status === 'SHARED' ? before : active))]
        : []
    // 같은 상태 · 같은 부담 인원이면 변경 없이 200(version 무관)
    if (body.status === e.status && (body.status === 'PERSONAL' || sameIds(ids, before))) {
      return HttpResponse.json(expenseDetail(e, me))
    }
    if (body.version !== e.version) return fail('VERSION_CONFLICT', { current: expenseDetail(e, me) })

    // 결제자의 결제수단이 0개면 공개 확대(공동 지정·부담 인원 추가)를 막고, 공동 → 개인은 결제를 지운다(v0.5.7, S4)
    const wallet = walletMock() // 지갑 시나리오('empty' 등)를 먼저 적용한다
    // 결제수단 0개 규칙은 가져온 결제에만(직접 입력은 해당 없음, S7)
    const noMethods = e.origin !== 'MANUAL' && userMethods(me.userId).length === 0
    const widens = body.status === 'SHARED' && (e.status !== 'SHARED' || ids.some((id) => !before.includes(id)))
    if (noMethods && widens) return finConsentRequired(wallet.finMissing, 'NO_ACTIVE_PAYMENT_METHOD')
    if (noMethods && body.status === 'PERSONAL' && e.status === 'SHARED' && body.confirmSharedToPersonal === true) {
      leaveDuplicateGroup(e)
      db.expenses = db.expenses.filter((x) => x !== e)
      return noContent()
    }

    if (body.status === 'SHARED') {
      if (ids.length === 0) return fail('PARTICIPANTS_REQUIRED')
      const invalid = ids.filter((id) => {
        const m = membership(id)
        // 나간 멤버는 원래 들어 있던 결제에만 남길 수 있다(해제만 가능, Q-30)
        return !m || m.tripId !== e.tripId || (m.leftAt !== null && !before.includes(id))
      })
      if (invalid.length > 0) return fail('PARTICIPANT_NOT_MEMBER', { invalidMembershipIds: invalid })

      if (e.status === 'SHARED') e.changed = true
      else if (e.status === 'PERSONAL' && wasShared(e)) e.changed = true
      sharedOnce.add(e)
      e.status = 'SHARED'
      e.participantMembershipIds = ids
      detectDuplicate(e)
    } else {
      if (e.status === 'SHARED') {
        if (body.confirmSharedToPersonal !== true) return fail('SHARED_TO_PERSONAL_CONFIRM_REQUIRED')
        sharedOnce.add(e)
        e.changed = true
        leaveDuplicateGroup(e)
      }
      e.status = 'PERSONAL'
      e.participantMembershipIds = null
    }
    e.version += 1
    return HttpResponse.json(expenseDetail(e, me))
  }),

  api.post<PaymentDetail, DismissDuplicateRequest>('/api/trips/:tripId/expenses/:expenseId/duplicate-dismissal', async ({ params, request }) => {
    const found = visibleExpense(String(params.tripId), String(params.expenseId))
    if (found.denied) return found.denied
    const { expense: e, me } = found
    const body: Partial<DismissDuplicateRequest> = await request.json()

    const reason = editBlock(e, me)
    if (reason === 'NOT_PAYER') return fail('NOT_PAYER')
    if (reason === 'NOT_AUTHOR') return notAuthor()
    if (reason) return fail('EXPENSE_LOCKED')
    if (!e.duplicateGroupId) return fail('DUPLICATE_NOT_FLAGGED')
    if (body.version !== e.version) return fail('VERSION_CONFLICT', { current: expenseDetail(e, me) })

    const group = db.expenses.filter((x) => x.duplicateGroupId === e.duplicateGroupId)
    for (const a of group) for (const b of group) if (a !== b) dismissed().add(pairKey(a.id, b.id))
    for (const x of group) x.duplicateGroupId = null
    e.version += 1
    return HttpResponse.json(expenseDetail(e, me))
  }),

  api.get<OutOfPeriodCandidate[]>('/api/trips/:tripId/out-of-period-candidates', ({ params, request }) => {
    const tripId = String(params.tripId)
    const check = requireMember(tripId)
    if (check.denied) return check.denied
    if (findTrip(tripId)!.status !== 'ONGOING') return fail('TRIP_PHASE_INVALID')
    if (db.paymentMethods.some((p) => p.userId === db.meUserId && p.status === 'EXPIRED')) return fail('CONNECTION_EXPIRED')
    const side = new URL(request.url).searchParams.get('side') === 'AFTER' ? 'AFTER' : 'BEFORE'
    const items: OutOfPeriodCandidate[] = openCandidates(check.membership, side).map(
      ({ side: _side, paymentMethodId: _pm, candidateId, ...rest }) => ({ candidateId: issueCandidateId(candidateId), ...rest }),
    )
    return HttpResponse.json(items)
  }),

  api.post<OutOfPeriodAddResponse, AddOutOfPeriodExpensesRequest>('/api/trips/:tripId/out-of-period-expenses', async ({ params, request }) => {
    const tripId = String(params.tripId)
    const check = requireMember(tripId)
    if (check.denied) return check.denied
    if (findTrip(tripId)!.status !== 'ONGOING') return fail('TRIP_PHASE_INVALID')
    const body: Partial<AddOutOfPeriodExpensesRequest> = await request.json()
    const ids = [...new Set(body.candidateIds ?? [])]
    if (ids.length < 1 || ids.length > 50) {
      return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'candidateIds', code: 'arrayMaxSize', message: '1~50건을 골라 주세요' }] })
    }
    const open = openCandidates(check.membership)
    const bases = ids.map(verifyCandidateId)
    const invalid = ids.filter((_id, i) => !open.some((c) => c.candidateId === bases[i]))
    if (invalid.length > 0) return fail('OUT_OF_PERIOD_CANDIDATE_INVALID', { invalidCandidateIds: invalid })

    const created = open
      .filter((c) => bases.includes(c.candidateId))
      .map((c): MockExpense => ({
        id: addedExpenseId(c.candidateId),
        tripId,
        occurredAt: c.occurredAt,
        merchantName: c.merchantName,
        payerMembershipId: check.membership.membershipId,
        status: 'PENDING',
        krwAmount: c.krwAmount ?? 0,
        grossKrwAmount: c.krwAmount ?? 0,
        originalAmount: c.originalAmount,
        originalCurrency: c.currency,
        participantMembershipIds: null,
        changed: false,
        duplicateGroupId: null,
        refunds: [],
        origin: 'OUT_OF_PERIOD',
        paymentMethodId: c.paymentMethodId,
        version: 1,
      }))
    db.expenses.push(...created)
    return HttpResponse.json({ added: created.length, items: created.map(expenseRow) }, { status: 201 })
  }),
]
