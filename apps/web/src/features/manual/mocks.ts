import { toKrw } from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import {
  activeMembership,
  db,
  findTrip,
  SUPPORTED_CURRENCIES,
  type MockExpense,
  type MockMembership,
  type MockWalletEntry,
} from '../../mocks/data'
import { api, denyUnlessAuthenticated, mockError, noContent, requireMember, type NoContent } from '../../mocks/utils'
import { clock } from '../payments/clock'
import {
  actorOf,
  detectDuplicate,
  editBlock,
  ensureSeed,
  expenseDetail,
  fail,
  leaveDuplicateGroup,
  visibleExpense,
} from '../payments/mocks'
import type { PaymentDetail } from '../payments/types'
import { kst } from '../payments/rules'
import { mockRatePerUnit } from '../wallet/mocks'
import {
  MANUAL_DEFAULT_MERCHANT_NAME,
  MANUAL_KRW_AMOUNT_MAX,
  MANUAL_MEMO_MAX_LENGTH,
  MANUAL_OCCURRED_AT_FUTURE_SECONDS,
  MANUAL_OCCURRED_AT_PAST_DAYS,
  WALLET_ENTRY_FIELD_VALUES,
  type CreateTripExpenseRequest,
  type CreateWalletEntryRequest,
  type UpdateTripExpenseRequest,
  type UpdateWalletEntryRequest,
  type WalletEntry,
  type WalletEntryListResponse,
  type WalletEntryMutationResponse,
  type WalletTripCandidate,
  type WalletTripCandidatesResponse,
} from './types'

// 수동 결제 목(서버 S7 #46 계약: apps/api wallet·expenses). 규칙: 기능명세 4-11 · FR-420~427 · 810.
// 목 단순화: 샘플 지갑 항목 일부는 가져온(AUTO) 오사카 결제에 연결돼 있다 — 화면(HF-49) 모양을 보이기 위한 것이다.

const ZERO_DIGIT = new Set(['KRW', 'JPY', 'VND', 'IDR'])
const digitsOf = (code: string) => (ZERO_DIGIT.has(code) ? 0 : 2)

const invalid = (path: string, message: string, code = 'invalid') =>
  mockError('VALIDATION_FAILED', 400, { fields: [{ path, code, message }] })

const sanitize = (memo: string | undefined) =>
  // oxlint-disable-next-line no-control-regex -- 제어문자를 지운다
  (memo ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()

/** 원통화 → 원화. 여정이 있으면 그 여정 환율 정책, 없으면 최신 고시. 모르면 null */
function krwOf(amount: string, currency: string, tripId?: string): number | null {
  if (currency === 'KRW') return Math.round(Number(amount))
  const rate = mockRatePerUnit(currency, tripId)
  return rate ? toKrw(amount, Number(rate).toFixed(6)) : null
}

type Fields = { amount?: string; currency?: string; memo?: string; occurredAt?: string }

/** FR-427 공통 검증. 통과면 null */
function validate(body: Fields, required: boolean, tripId?: string) {
  if (body.currency !== undefined && !SUPPORTED_CURRENCIES.some((c) => c.code === body.currency)) {
    return invalid('currency', '지원하지 않는 통화예요')
  }
  if (required || body.amount !== undefined) {
    const amount = body.amount ?? ''
    const currency = body.currency ?? 'KRW'
    const digits = digitsOf(currency)
    const pattern = digits > 0 ? /^\d{1,12}(\.\d{1,2})?$/ : /^\d{1,12}$/
    if (!pattern.test(amount) || Number(amount) <= 0) return invalid('amount', '금액을 확인해 주세요')
    const krw = krwOf(amount, currency, tripId)
    if (krw !== null && krw > MANUAL_KRW_AMOUNT_MAX) return invalid('amount', '1억 원 이하로 입력해 주세요', 'max')
  }
  if (body.memo !== undefined && [...sanitize(body.memo)].length > MANUAL_MEMO_MAX_LENGTH) return invalid('memo', '40자까지 쓸 수 있어요')
  if (body.occurredAt !== undefined) {
    const t = Date.parse(body.occurredAt)
    const now = clock.now()
    if (Number.isNaN(t) || t > now + MANUAL_OCCURRED_AT_FUTURE_SECONDS * 1000 || t < now - MANUAL_OCCURRED_AT_PAST_DAYS * 86_400_000) {
      return invalid('occurredAt', '날짜를 확인해 주세요')
    }
  }
  return null
}

/** ISO → KST "+09:00" 표기(목 데이터 정렬·날짜 그룹이 문자열 앞 10자를 쓴다) */
const toKstIso = (iso: string) => {
  const at = kst(iso)
  return `${at.date}T${at.time}:${new Date(Date.parse(iso)).getUTCSeconds().toString().padStart(2, '0')}+09:00`
}
const nowIso = () => toKstIso(new Date(clock.now()).toISOString())

let seq = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`

// ── 지갑 항목 응답 ─────────────────────────────────────────────────

const linkedExpense = (w: MockWalletEntry) => (w.expenseId ? db.expenses.find((e) => e.id === w.expenseId) : undefined)

/** 연결 여정이 열려 있고(예정·진행 중) 내가 활성 멤버인가 */
function linkOpen(e: MockExpense | undefined) {
  if (!e) return false
  const trip = findTrip(e.tripId)
  return Boolean(trip && trip.status !== 'ENDED' && activeMembership(e.tripId, db.meUserId))
}

function walletEntryView(w: MockWalletEntry): WalletEntry {
  const e = linkedExpense(w)
  const trip = e ? findTrip(e.tripId) : undefined
  const mine = e ? activeMembership(e.tripId, db.meUserId) : undefined
  const open = linkOpen(e)
  return {
    id: w.id,
    source: 'MANUAL',
    kind: 'APPROVAL',
    occurredAt: w.occurredAt,
    localDate: w.occurredAt.slice(0, 10),
    merchantName: w.memo ?? MANUAL_DEFAULT_MERCHANT_NAME,
    memo: w.memo,
    amount: w.amount,
    currency: w.currency,
    krwAmount: e ? e.krwAmount : w.spotKrwAmount,
    paymentMethodLabel: null,
    linkedTrip:
      e && trip && mine
        ? {
            tripId: trip.tripId,
            groupName: trip.groupName,
            placeLabel: trip.placeLabel,
            tripStatus: trip.status,
            expenseId: e.id,
            expenseStatus: trip.status === 'ENDED' && e.status === 'PENDING' ? 'PERSONAL' : e.status,
            expenseVersion: e.version,
          }
        : null,
    editableFields: e && !open ? ['memo'] : [...WALLET_ENTRY_FIELD_VALUES],
    canChangeTrip: !e || (open && e.status === 'PENDING'),
    canDelete: true,
    version: w.version,
  }
}

const myEntries = () => db.walletEntries.filter((w) => w.userId === db.meUserId)

// ── 여정 후보(4-11-3) ──────────────────────────────────────────────

function tripCandidates(at: string): WalletTripCandidatesResponse {
  const date = kst(at).date
  const items: WalletTripCandidate[] = db.trips
    .filter((t) => (t.status === 'UPCOMING' || t.status === 'ONGOING') && activeMembership(t.tripId, db.meUserId))
    .map((t) => ({
      tripId: t.tripId,
      groupName: t.groupName,
      placeLabel: t.placeLabel,
      status: t.status as WalletTripCandidate['status'],
      startDate: t.startDate,
      endDate: t.endDate,
      currency: t.currency,
      inPeriod: date >= t.startDate && date <= t.endDate,
    }))
    .sort(
      (a, b) =>
        Number(b.inPeriod) - Number(a.inPeriod) ||
        Number(b.status === 'ONGOING') - Number(a.status === 'ONGOING') ||
        Math.abs(Date.parse(a.startDate) - Date.parse(date)) - Math.abs(Date.parse(b.startDate) - Date.parse(date)) ||
        a.tripId.localeCompare(b.tripId),
    )
  return {
    items,
    suggestedTripId: items[0]?.inPeriod ? items[0].tripId : null,
    defaultCurrency: items.find((c) => c.status === 'ONGOING')?.currency ?? 'KRW',
  }
}

// ── 여정 결제 만들기·고치기 ─────────────────────────────────────────

function newManualExpense(init: {
  tripId: string
  payer: string
  author: string
  amount: string
  currency: string
  memo: string
  occurredAt: string
  participants: string[] | null
  status: MockExpense['status']
  clientRequestId?: string
}): MockExpense {
  const krw = krwOf(init.amount, init.currency, init.tripId) ?? 0
  return {
    id: newId('exp-manual'),
    tripId: init.tripId,
    occurredAt: init.occurredAt,
    merchantName: init.memo || MANUAL_DEFAULT_MERCHANT_NAME,
    payerMembershipId: init.payer,
    status: init.status,
    krwAmount: krw,
    grossKrwAmount: krw,
    originalAmount: init.amount,
    originalCurrency: init.currency,
    participantMembershipIds: init.status === 'SHARED' ? init.participants : null,
    changed: false,
    duplicateGroupId: null,
    refunds: [],
    origin: 'MANUAL',
    paymentMethodId: null,
    version: 1,
    createdByMembershipId: init.author,
    clientRequestId: init.clientRequestId,
  }
}

/** 금액·통화·내용·시각을 결제에 반영(원화 재계산). 바뀌었으면 true */
function applyToExpense(e: MockExpense, f: Fields): boolean {
  const before = JSON.stringify([e.originalAmount, e.originalCurrency, e.merchantName, e.occurredAt])
  if (f.amount !== undefined) e.originalAmount = f.amount
  if (f.currency !== undefined) e.originalCurrency = f.currency
  if (f.memo !== undefined) e.merchantName = sanitize(f.memo) || MANUAL_DEFAULT_MERCHANT_NAME
  if (f.occurredAt !== undefined) e.occurredAt = toKstIso(f.occurredAt)
  const krw = krwOf(e.originalAmount, e.originalCurrency, e.tripId) ?? e.krwAmount
  e.krwAmount = krw
  e.grossKrwAmount = krw
  return before !== JSON.stringify([e.originalAmount, e.originalCurrency, e.merchantName, e.occurredAt])
}

function applyToEntry(w: MockWalletEntry, f: Fields) {
  if (f.amount !== undefined) w.amount = f.amount
  if (f.currency !== undefined) w.currency = f.currency
  if (f.memo !== undefined) w.memo = sanitize(f.memo) || null
  if (f.occurredAt !== undefined) w.occurredAt = toKstIso(f.occurredAt)
}

/** 바뀐 결제: 공동이면 "변경됨" + version, 중복 의심 다시 판정 */
function touched(e: MockExpense, wasShared: boolean) {
  if (wasShared) e.changed = true
  e.version += 1
  leaveDuplicateGroup(e)
  detectDuplicate(e)
}

const activeIds = (tripId: string) =>
  db.memberships.filter((m) => m.tripId === tripId && m.leftAt === null).map((m) => m.membershipId)

const meMembership = (tripId: string): MockMembership | undefined => activeMembership(tripId, db.meUserId)


// ── 핸들러 ────────────────────────────────────────────────────────

export const handlers: HttpHandler[] = [
  // monthTotalKrw · monthTotalEstimated = 서버 S7b(KST 이번 달 합계, 모든 페이지에 같은 값)
  api.get<WalletEntryListResponse>('/api/wallet/entries', ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    ensureSeed()
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)
    const offset = Number(url.searchParams.get('cursor') ?? 0) || 0
    const items = myEntries()
      .map(walletEntryView)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
    const month = kst(clock.now()).date.slice(0, 7)
    const monthItems = items.filter((e) => e.localDate.startsWith(month))
    return HttpResponse.json({
      items: items.slice(offset, offset + limit),
      nextCursor: offset + limit < items.length ? String(offset + limit) : null,
      monthTotalKrw: monthItems.reduce((sum, e) => sum + (e.krwAmount ?? 0), 0),
      monthTotalEstimated: monthItems.some((e) => e.krwAmount === null || (!e.linkedTrip && e.currency !== 'KRW')),
    })
  }),

  api.get<WalletTripCandidatesResponse>('/api/wallet/trip-candidates', ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const at = new URL(request.url).searchParams.get('at') ?? nowIso()
    if (Number.isNaN(Date.parse(at))) return invalid('at', '날짜를 확인해 주세요')
    return HttpResponse.json(tripCandidates(at))
  }),

  api.post<WalletEntryMutationResponse, CreateWalletEntryRequest>('/api/wallet/entries', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    ensureSeed()
    const body = await request.json()
    if (body.clientRequestId) {
      const again = myEntries().find((w) => w.clientRequestId === body.clientRequestId)
      if (again) return HttpResponse.json({ entry: walletEntryView(again), linkedExpense: null }, { status: 201 })
    }
    const occurredAt = body.occurredAt ? toKstIso(body.occurredAt) : nowIso()
    const tripId = body.tripId === undefined ? tripCandidates(occurredAt).suggestedTripId : body.tripId
    if (tripId) {
      const trip = findTrip(tripId)
      if (!trip || !meMembership(tripId)) return mockError('NOT_FOUND', 404)
      if (trip.status === 'ENDED') return fail('TRIP_PHASE_INVALID')
    }
    const currency = body.currency ?? tripCandidates(occurredAt).defaultCurrency
    const error = validate({ ...body, currency }, true, tripId ?? undefined)
    if (error) return error

    const memo = sanitize(body.memo)
    let expense: MockExpense | undefined
    if (tripId) {
      const me = meMembership(tripId)!.membershipId
      expense = newManualExpense({ tripId, payer: me, author: me, amount: body.amount, currency, memo, occurredAt, participants: null, status: 'PENDING' })
      db.expenses.push(expense)
    }
    const entry: MockWalletEntry = {
      id: newId('we'),
      userId: db.meUserId,
      occurredAt,
      memo: memo || null,
      amount: body.amount,
      currency,
      spotKrwAmount: krwOf(body.amount, currency),
      expenseId: expense?.id ?? null,
      version: 1,
      clientRequestId: body.clientRequestId,
    }
    db.walletEntries.push(entry)
    const response: WalletEntryMutationResponse = {
      entry: walletEntryView(entry),
      linkedExpense: expense ? expenseDetail(expense, meMembership(expense.tripId)!) : null,
    }
    return HttpResponse.json(response, { status: 201 })
  }),

  api.patch<WalletEntryMutationResponse, UpdateWalletEntryRequest>('/api/wallet/entries/:entryId', async ({ params, request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    ensureSeed()
    const w = myEntries().find((x) => x.id === String(params.entryId))
    if (!w) return mockError('NOT_FOUND', 404)
    const body = await request.json()
    if (body.version !== w.version) return fail('VERSION_CONFLICT', { current: walletEntryView(w) })

    let e = linkedExpense(w)
    const open = linkOpen(e)
    const money: (keyof Fields)[] = ['amount', 'currency', 'occurredAt']
    const lockedFields = money.filter((k) => body[k] !== undefined)
    if (e && !open && lockedFields.length > 0) return fail('EXPENSE_LOCKED', { lockedFields })

    // 연결 여정 바꾸기(Q-46): 미확정이거나 연결이 없을 때만
    const changeTrip = body.tripId !== undefined && body.tripId !== (e?.tripId ?? null)
    if (changeTrip && e && (!open || e.status !== 'PENDING')) return fail('EXPENSE_LOCKED', { lockedFields: ['tripId'] })
    if (changeTrip && body.tripId) {
      const trip = findTrip(body.tripId)
      if (!trip || !meMembership(body.tripId)) return mockError('NOT_FOUND', 404)
      if (trip.status === 'ENDED') return fail('TRIP_PHASE_INVALID')
    }
    const targetTrip = changeTrip ? (body.tripId ?? undefined) : e?.tripId
    const error = validate({ ...body, currency: body.currency ?? w.currency, amount: body.amount ?? (body.currency ? w.amount : undefined) }, false, targetTrip)
    if (error) return error

    applyToEntry(w, body)
    if (changeTrip) {
      if (e) {
        leaveDuplicateGroup(e)
        db.expenses = db.expenses.filter((x) => x !== e)
        e = undefined
      }
      if (body.tripId) {
        const me = meMembership(body.tripId)!.membershipId
        e = newManualExpense({ tripId: body.tripId, payer: me, author: me, amount: w.amount, currency: w.currency, memo: w.memo ?? '', occurredAt: w.occurredAt, participants: null, status: 'PENDING' })
        db.expenses.push(e)
      }
      w.expenseId = e?.id ?? null
    } else if (e && open) {
      const wasShared = e.status === 'SHARED'
      if (applyToExpense(e, body)) touched(e, wasShared)
    }
    if (!e) w.spotKrwAmount = krwOf(w.amount, w.currency)
    w.version += 1
    const mine = e ? meMembership(e.tripId) : undefined
    return HttpResponse.json({ entry: walletEntryView(w), linkedExpense: e && mine ? expenseDetail(e, mine) : null })
  }),

  api.delete<NoContent>('/api/wallet/entries/:entryId', ({ params, request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    ensureSeed()
    const w = myEntries().find((x) => x.id === String(params.entryId))
    if (!w) return mockError('NOT_FOUND', 404)
    const includeShared = new URL(request.url).searchParams.get('includeShared') === 'true'
    const e = linkedExpense(w)
    const open = linkOpen(e)
    if (e && open && e.status === 'SHARED' && !includeShared) {
      return fail('SHARED_DELETE_CONFIRM_REQUIRED', { tripId: e.tripId, expenseId: e.id })
    }
    // 종료(또는 나간) 여정의 공동 결제는 장부에 남긴다. 그 밖(미확정·개인·열린 공동)은 함께 지운다
    if (e && (open || e.status !== 'SHARED')) {
      leaveDuplicateGroup(e)
      db.expenses = db.expenses.filter((x) => x !== e)
    }
    db.walletEntries = db.walletEntries.filter((x) => x !== w)
    return noContent()
  }),

  api.post<PaymentDetail, CreateTripExpenseRequest>('/api/trips/:tripId/expenses', async ({ params, request }) => {
    const tripId = String(params.tripId)
    const check = requireMember(tripId)
    if (check.denied) return check.denied
    ensureSeed()
    const me = check.membership
    const trip = findTrip(tripId)!
    if (trip.status === 'ENDED') return fail('TRIP_PHASE_INVALID')
    const body = await request.json()
    if (body.clientRequestId) {
      const again = db.expenses.find((e) => e.createdByMembershipId === me.membershipId && e.clientRequestId === body.clientRequestId)
      if (again) return HttpResponse.json(expenseDetail(again, me), { status: 201 })
    }
    const currency = body.currency ?? trip.currency
    const error = validate({ ...body, currency }, true, tripId)
    if (error) return error

    const active = activeIds(tripId)
    const payer = body.payerMembershipId ?? me.membershipId
    if (!active.includes(payer)) return fail('PARTICIPANT_NOT_MEMBER', { invalidMembershipIds: [payer] })
    const participants = [...new Set(body.participantMembershipIds ?? active)]
    if (participants.length === 0) return fail('PARTICIPANTS_REQUIRED')
    const outside = participants.filter((id) => !active.includes(id))
    if (outside.length > 0) return fail('PARTICIPANT_NOT_MEMBER', { invalidMembershipIds: outside })
    const onlyPayer = participants.every((id) => id === payer)
    if (payer !== me.membershipId && onlyPayer) return invalid('participantMembershipIds', '결제자 말고 한 명 이상 골라 주세요')
    if (body.addToWallet && payer !== me.membershipId) return invalid('addToWallet', '내가 낸 결제만 지갑에 기록할 수 있어요')

    const occurredAt = body.occurredAt ? toKstIso(body.occurredAt) : nowIso()
    const memo = sanitize(body.memo)
    const e = newManualExpense({
      tripId,
      payer,
      author: me.membershipId,
      amount: body.amount,
      currency,
      memo,
      occurredAt,
      participants,
      status: onlyPayer ? 'PERSONAL' : 'SHARED',
      clientRequestId: body.clientRequestId,
    })
    db.expenses.push(e)
    detectDuplicate(e)
    if (body.addToWallet) {
      db.walletEntries.push({
        id: newId('we'),
        userId: db.meUserId,
        occurredAt,
        memo: memo || null,
        amount: body.amount,
        currency,
        spotKrwAmount: null,
        expenseId: e.id,
        version: 1,
      })
    }
    return HttpResponse.json(expenseDetail(e, me), { status: 201 })
  }),

  api.patch<PaymentDetail, UpdateTripExpenseRequest>('/api/trips/:tripId/expenses/:expenseId', async ({ params, request }) => {
    const found = visibleExpense(String(params.tripId), String(params.expenseId))
    if (found.denied) return found.denied
    const { expense: e, me } = found
    if (e.origin !== 'MANUAL') return fail('NOT_MANUAL_ENTRY')
    const reason = editBlock(e, me)
    if (reason === 'NOT_AUTHOR') return fail('NOT_AUTHOR')
    if (reason) return fail('EXPENSE_LOCKED')
    const body = await request.json()
    if (body.version !== e.version) return fail('VERSION_CONFLICT', { current: expenseDetail(e, me) })
    const error = validate(
      { ...body, currency: body.currency ?? e.originalCurrency, amount: body.amount ?? (body.currency ? e.originalAmount : undefined) },
      false,
      e.tripId,
    )
    if (error) return error

    const wallet = db.walletEntries.find((w) => w.expenseId === e.id)
    const active = activeIds(e.tripId)
    const wasShared = e.status === 'SHARED'
    let classChanged = false
    if (e.status !== 'PENDING' && (body.payerMembershipId !== undefined || body.participantMembershipIds !== undefined)) {
      const payer = body.payerMembershipId ?? e.payerMembershipId
      if (wallet && payer !== e.payerMembershipId) return invalid('payerMembershipId', '지갑에 기록한 결제는 결제자를 바꿀 수 없어요', 'walletLinked')
      if (!active.includes(payer)) return fail('PARTICIPANT_NOT_MEMBER', { invalidMembershipIds: [payer] })
      const before = e.participantMembershipIds ?? [e.payerMembershipId]
      const participants = [...new Set(body.participantMembershipIds ?? before)]
      if (participants.length === 0) return fail('PARTICIPANTS_REQUIRED')
      const outside = participants.filter((id) => !active.includes(id) && !before.includes(id))
      if (outside.length > 0) return fail('PARTICIPANT_NOT_MEMBER', { invalidMembershipIds: outside })
      const onlyPayer = participants.every((id) => id === payer)
      if (payer !== actorOf(e) && onlyPayer) return invalid('participantMembershipIds', '결제자 말고 한 명 이상 골라 주세요')
      const status = onlyPayer ? 'PERSONAL' : 'SHARED'
      if (wasShared && status === 'PERSONAL' && body.confirmSharedToPersonal !== true) return fail('SHARED_TO_PERSONAL_CONFIRM_REQUIRED')
      classChanged =
        payer !== e.payerMembershipId || status !== e.status || JSON.stringify([...participants].sort()) !== JSON.stringify([...before].sort())
      e.payerMembershipId = payer
      e.status = status
      e.participantMembershipIds = status === 'SHARED' ? participants : null
    }
    const moneyChanged = applyToExpense(e, body)
    if (wallet) applyToEntry(wallet, body)
    if (wallet && (moneyChanged || body.memo !== undefined)) wallet.version += 1
    if (moneyChanged || classChanged) touched(e, wasShared)
    return HttpResponse.json(expenseDetail(e, me))
  }),

  api.delete<NoContent>('/api/trips/:tripId/expenses/:expenseId', ({ params, request }) => {
    const found = visibleExpense(String(params.tripId), String(params.expenseId))
    if (found.denied) return found.denied
    const { expense: e, me } = found
    if (e.origin !== 'MANUAL') return fail('NOT_MANUAL_ENTRY')
    const reason = editBlock(e, me)
    if (reason === 'NOT_AUTHOR') return fail('NOT_AUTHOR')
    if (reason) return fail('EXPENSE_LOCKED')
    const version = Number(new URL(request.url).searchParams.get('version'))
    if (version !== e.version) return fail('VERSION_CONFLICT', { current: expenseDetail(e, me) })
    leaveDuplicateGroup(e)
    db.expenses = db.expenses.filter((x) => x !== e)
    // 지갑 항목은 남기고 연결만 끊는다(Q-45)
    for (const w of db.walletEntries) {
      if (w.expenseId !== e.id) continue
      w.expenseId = null
      w.spotKrwAmount = e.krwAmount
      w.version += 1
    }
    return noContent()
  }),
]
