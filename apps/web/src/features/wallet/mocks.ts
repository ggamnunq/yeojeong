import { HttpResponse, type HttpHandler } from 'msw'
import { activeMembership, db, findTrip, SUPPORTED_CURRENCIES, userMethods, type MockPaymentMethod } from '../../mocks/data'
import { api, denyUnlessAuthenticated, mockError, noContent, requireMember, type NoContent } from '../../mocks/utils'
import type {
  AttemptPurpose,
  AttemptStatus,
  ConfirmConnectionRequest,
  ConfirmConnectionResponse,
  ConnectionAttemptView,
  ConnectionCandidate,
  ConnectionStatus,
  ConsentStatusResponse,
  FinConsentId,
  FxRateView,
  ManualSyncResponse,
  PaymentMethodsResponse,
  PaymentMethodType,
  SaveConsentsRequest,
  StartConnectionRequest,
  StartConnectionResponse,
  TripFxView,
  UpdateFxPolicyRequest,
  UpdateFxPolicyResponse,
} from './types'

// 지갑·토스 연결·환율 목(데모 어댑터처럼 외부 인증은 바로 끝난다).
// 개발 서버에서 상태 바꾸기: localStorage.setItem('yj:mock:wallet', 'expired' | 'empty' | 'no-consent') 후 새로고침.
// 테스트에서는 walletMock()으로 상태를 직접 고친다. 상태는 db.paymentMethods 배열마다 따로 만들어져 resetMockDb()와 같이 되돌아간다.

const KST = 9 * 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')

/** 오늘(KST) hh:mm의 ISO 시각 */
function todayKstAt(hh: number, mm: number) {
  const d = new Date(Date.now() + KST)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hh)}:${pad(mm)}:00+09:00`
}

function nowKst() {
  const d = new Date(Date.now() + KST)
  return `${d.toISOString().slice(0, 19)}+09:00`
}

type MockConnection = {
  id: string
  userId: string
  status: ConnectionStatus
  connectedAt: string
  lastSyncedAt: string | null
}

type MockCandidate = Omit<ConnectionCandidate, 'preselected'> & { shortLabel: string }

type MockAttempt = {
  id: string
  userId: string
  purpose: AttemptPurpose
  reconnectConnectionId?: string
  status: AttemptStatus
  polls: number
  /** 데모 인증이 끝나는 시각(만든 뒤 1.5초) */
  authorizeAt?: number
  expiresAt: string
  candidates: ConnectionCandidate[]
}

export type WalletMockState = {
  connections: MockConnection[]
  /** 결제수단 ID → 연결 ID */
  methodConnection: Record<string, string>
  /** 현재 버전이 유효하지 않은 금융정보 연동 동의(403 CONSENT_REQUIRED details.missing). 비면 연결할 수 있다 */
  finMissing: FinConsentId[]
  attempts: Record<string, MockAttempt>
  /** 여정별 고정 환율 마지막 입력값 */
  fixedRates: Record<string, string>
  lastManualSyncAt: number | null
  seq: number
}


/** 데모 페르소나(준용)의 토스 후보 — HF-07 */
const DEMO_CANDIDATES: MockCandidate[] = [
  { candidateId: 'cand-toss-account', type: 'ACCOUNT', institutionName: '토스뱅크', productName: '토스뱅크 통장', shortLabel: '토스뱅크 통장', maskedNumber: '1000-**-****321', last4: '321' },
  { candidateId: 'cand-kakao-safebox', type: 'ACCOUNT', institutionName: '카카오뱅크', productName: '카카오뱅크 세이프박스', shortLabel: '카카오뱅크 통장', maskedNumber: '3333-**-****821', last4: '821' },
  { candidateId: 'cand-toss-check', type: 'CARD', institutionName: '토스뱅크', productName: '토스뱅크 체크카드', shortLabel: '토스뱅크 체크카드', maskedNumber: '**** **** **** 1934', last4: '1934' },
  { candidateId: 'cand-shinhan', type: 'CARD', institutionName: '신한카드', productName: '신한카드 Deep Dream', shortLabel: '신한카드', maskedNumber: '**** **** **** 1102', last4: '1102' },
]

/** 통화별 최신 매매기준율(샘플 100엔 = 919.20원) */
const RATES: Record<string, Pick<FxRateView, 'currencyNameKo' | 'displayUnit' | 'rate'> & Partial<Pick<FxRateView, 'source' | 'sourceUrl'>>> = {
  JPY: { currencyNameKo: '엔', displayUnit: 100, rate: '9.192000' },
  USD: { currencyNameKo: '달러', displayUnit: 1, rate: '1380.500000' },
  EUR: { currencyNameKo: '유로', displayUnit: 1, rate: '1495.300000' },
  // 한국수출입은행이 고시하지 않는 통화는 ExchangeRate-API 값(출처 링크 필수)
  TWD: {
    currencyNameKo: '대만 달러',
    displayUnit: 1,
    rate: '41.345000',
    source: 'Rates By Exchange Rate API',
    sourceUrl: 'https://www.exchangerate-api.com',
  },
}

/**
 * 원통화 1단위당 원(수동 결제 환산용). 여정을 주면 그 여정 환율 정책(FIXED면 고정 환율 ÷ 고시 단위), 아니면 최신 고시. 모르면 null
 */
export function mockRatePerUnit(currency: string, tripId?: string): string | null {
  const trip = tripId ? findTrip(tripId) : undefined
  const rate = RATES[currency]
  const fixed = trip && trip.fxPolicy === 'FIXED' && trip.currency === currency ? walletMock().fixedRates[trip.tripId] : undefined
  if (fixed && rate) return (Number(fixed) / rate.displayUnit).toFixed(6)
  return rate?.rate ?? null
}

/** 통화 목록의 단위(모르는 통화는 코드 · 1) */
const unitOf = (code: string) => SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? { unitName: code, displayUnit: 1 }

const ALL_FIN: readonly FinConsentId[] = ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY']
/** 결제수단을 전부 해제하면 철회되는 동의(THIRD_PARTY는 유지, 기능명세 Q-39) */
const REVOKED_ON_LAST_REMOVAL: readonly FinConsentId[] = ['FIN_LINK', 'FIN_PRIVACY']

const states = new WeakMap<MockPaymentMethod[], WalletMockState>()

/** 403 CONSENT_REQUIRED(details.missing = 유효하지 않은 연동 동의). reason을 주면 details.reason도 싣는다 */
export function finConsentRequired(missing: readonly FinConsentId[], reason?: string) {
  return mockError(
    'CONSENT_REQUIRED',
    403,
    { missing: [...missing], required: missing.map((id) => ({ id, version: '0.1-draft' })), ...(reason && { reason }) },
    '금융정보 연동 동의가 필요해요',
  )
}

/** 내 개인·미확정 결제를 지운다(공동은 유지). paymentMethodIds를 주면 그 결제수단에서 온 것만. 직접 입력은 지우지 않는다(I-14) */
function purgePrivateExpenses(paymentMethodIds?: readonly string[]) {
  const mine = new Set(db.memberships.filter((m) => m.userId === db.meUserId).map((m) => m.membershipId))
  db.expenses = db.expenses.filter(
    (e) =>
      !(
        mine.has(e.payerMembershipId) &&
        e.status !== 'SHARED' &&
        e.origin !== 'MANUAL' &&
        (!paymentMethodIds || (e.paymentMethodId !== null && paymentMethodIds.includes(e.paymentMethodId)))
      ),
  )
}

function scenario(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem('yj:mock:wallet')
  } catch {
    return null
  }
}

function createState(): WalletMockState {
  const connId = 'conn-junyong-toss'
  const mine = db.paymentMethods.filter((p) => p.userId === db.meUserId)
  const state: WalletMockState = {
    connections: [{ id: connId, userId: db.meUserId, status: 'ACTIVE', connectedAt: '2026-10-20T10:00:00+09:00', lastSyncedAt: todayKstAt(18, 32) }],
    methodConnection: Object.fromEntries(mine.map((p) => [p.id, connId])),
    finMissing: [],
    attempts: {},
    fixedRates: {},
    lastManualSyncAt: null,
    seq: 0,
  }
  const mode = scenario()
  if (mode === 'expired') expireConnections(state)
  if (mode === 'empty') {
    for (const p of mine) p.status = 'REMOVED'
    state.connections = []
  }
  if (mode === 'no-consent') state.finMissing = [...ALL_FIN]
  return state
}

/** 지금 db의 지갑 목 상태(테스트에서 직접 고친다) */
export function walletMock(): WalletMockState {
  let state = states.get(db.paymentMethods)
  if (!state) {
    state = createState()
    states.set(db.paymentMethods, state)
  }
  return state
}

// 개발 서버: 시나리오('expired' 등)를 첫 API 호출 전에 적용한다. 늦게 만들면 지갑을 열기 전의 여정 응답이
// 만료 전 상태(connectionExpired false)로 나간다. 테스트는 db를 되돌릴 때마다 처음 부를 때 만든다
if (import.meta.env.MODE !== 'test') walletMock()

/** 내 연결을 모두 만료시킨다(WF-42). 마지막 성공 동기화는 09:12 */
export function expireConnections(state: WalletMockState = walletMock()) {
  for (const c of state.connections) {
    if (c.userId !== db.meUserId) continue
    c.status = 'EXPIRED'
    c.lastSyncedAt = todayKstAt(9, 12)
  }
  for (const p of db.paymentMethods) if (p.userId === db.meUserId && p.status === 'ACTIVE') p.status = 'EXPIRED'
}

// ── 응답 모양 ─────────────────────────────────────────────────────

const myMethods = () => userMethods(db.meUserId)

/** 서버 last4: 카드 끝 4자리, 계좌 끝 3자리 */
const lastDigitsOf = (p: Pick<MockPaymentMethod, 'type' | 'maskedNumber'>) =>
  p.maskedNumber.replace(/\D/g, '').slice(p.type === 'ACCOUNT' ? -3 : -4)

function shortLabelOf(p: MockPaymentMethod) {
  const last = lastDigitsOf(p)
  return p.label.endsWith(last) ? p.label.slice(0, -last.length).trim() : p.label
}

function methodsResponse(): PaymentMethodsResponse {
  const state = walletMock()
  const connections = state.connections.filter((c) => c.userId === db.meUserId && c.status !== 'REVOKED')
  const methods = myMethods()
  const synced = connections.map((c) => c.lastSyncedAt).filter((t): t is string => t !== null).sort()
  return {
    connections: connections.map((c) => ({
      id: c.id,
      provider: 'DEMO',
      status: c.status,
      connectedAt: c.connectedAt,
      lastSyncedAt: c.lastSyncedAt,
      lastSyncStatus: c.status === 'EXPIRED' ? 'EXPIRED' : 'OK',
    })),
    methods: methods.map((p) => {
      const connectionId = state.methodConnection[p.id] ?? connections[0]?.id ?? ''
      return {
        id: p.id,
        connectionId,
        type: p.type,
        institutionName: p.institutionName,
        productName: p.productName,
        shortLabel: shortLabelOf(p),
        maskedNumber: p.maskedNumber,
        last4: lastDigitsOf(p),
        status: p.status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE',
        lastSyncedAt: state.connections.find((c) => c.id === connectionId)?.lastSyncedAt ?? null,
      }
    }),
    lastSyncedAt: synced.at(-1) ?? null,
    hasExpiredConnection: connections.some((c) => c.status === 'EXPIRED'),
    counts: {
      accounts: methods.filter((p) => p.type === 'ACCOUNT').length,
      cards: methods.filter((p) => p.type === 'CARD').length,
    },
  }
}

function attemptView(a: MockAttempt): ConnectionAttemptView {
  return { attemptId: a.id, status: a.status, purpose: a.purpose, expiresAt: a.expiresAt }
}

function candidatesFor(purpose: AttemptPurpose): ConnectionCandidate[] {
  const connected = new Set(myMethods().map((p) => p.maskedNumber))
  return DEMO_CANDIDATES.filter((c) => purpose === 'RECONNECT' || !connected.has(c.maskedNumber)).map(
    ({ shortLabel: _shortLabel, ...c }) => ({ ...c, preselected: purpose === 'RECONNECT' ? connected.has(c.maskedNumber) : true }),
  )
}

function tripFxView(tripId: string): TripFxView | null {
  const trip = findTrip(tripId)
  const me = activeMembership(tripId, db.meUserId)
  if (!trip || !me) return null
  const isKrwTrip = trip.currency === 'KRW'
  const rate = RATES[trip.currency]
  const current: FxRateView | null =
    isKrwTrip || !rate
      ? null
      : {
          baseCurrency: 'KRW',
          currency: trip.currency,
          currencyNameKo: rate.currencyNameKo,
          displayUnit: rate.displayUnit,
          rate: rate.rate,
          displayRate: (Number(rate.rate) * rate.displayUnit).toFixed(2),
          label: `${rate.displayUnit}${rate.currencyNameKo} = ${(Number(rate.rate) * rate.displayUnit).toFixed(2)}원`,
          rateType: 'MID',
          source: rate.source ?? '하나은행 매매기준율',
          ...(rate.sourceUrl ? { sourceUrl: rate.sourceUrl } : {}),
          effectiveAt: todayKstAt(18, 0),
          fetchedAt: todayKstAt(18, 1),
        }
  return {
    baseCurrency: 'KRW',
    tripCurrency: trip.currency,
    // 고시가 없는 통화도 단위 표기는 통화 목록(unitName · displayUnit)을 따른다 — 고정 환율 입력 "100동당"
    currencyNameKo: isKrwTrip ? '원' : (rate?.currencyNameKo ?? unitOf(trip.currency).unitName),
    displayUnit: rate?.displayUnit ?? unitOf(trip.currency).displayUnit,
    isKrwTrip,
    current,
    policy: trip.fxPolicy,
    fixedRate: walletMock().fixedRates[tripId] ?? null,
    policyChangedAt: null,
    canEdit: me.role === 'LEADER' && trip.status !== 'ENDED' && !isKrwTrip,
    version: trip.version,
  }
}

/** 가입 흐름 시도(auth 목이 만든 attempt-signup-N)는 처음 볼 때 여기 등록한다 */
function signupAttempt(attemptId: string): MockAttempt | undefined {
  const state = walletMock()
  if (!attemptId.startsWith('attempt-signup-') || state.attempts[attemptId]) return undefined
  const attempt: MockAttempt = {
    id: attemptId,
    userId: db.meUserId,
    purpose: 'SIGNUP',
    status: 'WAITING',
    polls: 0,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    candidates: candidatesFor('SIGNUP'),
  }
  state.attempts[attemptId] = attempt
  return attempt
}

// ── 핸들러 ────────────────────────────────────────────────────────

export const handlers: HttpHandler[] = [
  api.get<PaymentMethodsResponse>('/api/payment-methods', () => denyUnlessAuthenticated() ?? HttpResponse.json(methodsResponse())),

  api.post<ManualSyncResponse>('/api/payment-methods/sync', () => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const state = walletMock()
    const mine = state.connections.filter((c) => c.userId === db.meUserId && c.status !== 'REVOKED')
    if (mine.some((c) => c.status === 'EXPIRED')) return mockError('CONNECTION_EXPIRED', 409)
    if (state.lastManualSyncAt !== null && Date.now() - state.lastManualSyncAt < 60_000) {
      return mockError('SYNC_RATE_LIMITED', 429)
    }
    state.lastManualSyncAt = Date.now()
    const startedAt = nowKst()
    const ongoing = db.trips.some((t) => t.status === 'ONGOING' && activeMembership(t.tripId, db.meUserId))
    // 진행 중 여정이 없으면 제공자를 부르지 않는다: 200 + skipped, 동기화 시각 그대로(FR-402)
    if (!ongoing) return HttpResponse.json({ syncRunIds: [], startedAt, skipped: 'NO_ACTIVE_TRIP' })
    for (const c of mine) c.lastSyncedAt = startedAt
    return HttpResponse.json({ syncRunIds: mine.map((c) => `sync-${c.id}`), startedAt, skipped: null }, { status: 202 })
  }),

  api.delete<NoContent>('/api/payment-methods/:paymentMethodId', ({ params, request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const state = walletMock()
    const method = myMethods().find((p) => p.id === params.paymentMethodId)
    if (!method) return mockError('NOT_FOUND', 404)
    const connectionId = state.methodConnection[method.id]
    const siblings = myMethods().filter((p) => state.methodConnection[p.id] === connectionId)
    const purge = new URL(request.url).searchParams.get('purgeImported') === 'true'
    if (purge && siblings.length > 1) return mockError('BAD_REQUEST', 400)
    // 전부 해제(마지막 활성 결제수단)는 체크 없이 내 개인·미확정 결제를 지우고 FIN_LINK·FIN_PRIVACY를 철회한다(부록 C-5, v0.5.7)
    const last = myMethods().length === 1
    if (purge && last) return mockError('BAD_REQUEST', 400)
    method.status = 'REMOVED'
    if (siblings.length === 1) {
      const conn = state.connections.find((c) => c.id === connectionId)
      if (conn) conn.status = 'REVOKED'
    }
    if (last) {
      purgePrivateExpenses()
      state.finMissing = [...new Set([...state.finMissing, ...REVOKED_ON_LAST_REMOVAL])]
    } else if (purge) {
      // 일부 해제 + 그 연결의 마지막 결제수단 + "불러온 결제도 지우기": 그 연결에서 온 개인·미확정만
      purgePrivateExpenses(db.paymentMethods.filter((p) => state.methodConnection[p.id] === connectionId).map((p) => p.id))
    }
    return noContent()
  }),

  api.post<StartConnectionResponse, StartConnectionRequest>('/api/payment-connections', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const state = walletMock()
    if (state.finMissing.length > 0) return finConsentRequired(state.finMissing)
    const body = await request.json()
    if (body.purpose === 'RECONNECT' && !state.connections.some((c) => c.id === body.reconnectConnectionId)) {
      return mockError('NOT_FOUND', 404)
    }
    const id = `attempt-${++state.seq}`
    const attempt: MockAttempt = {
      id,
      userId: db.meUserId,
      purpose: body.purpose,
      reconnectConnectionId: body.reconnectConnectionId,
      status: 'WAITING',
      polls: 0,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      candidates: candidatesFor(body.purpose),
    }
    state.attempts[id] = attempt
    // 데모 어댑터는 인증 주소가 곧바로 콜백 → WF-07이다. 목은 빈 창(auth 목과 같음)을 열고 폴링으로 넘어간다
    return HttpResponse.json({ attemptId: id, authUrl: 'about:blank', expiresAt: attempt.expiresAt }, { status: 201 })
  }),

  api.get<ConnectionAttemptView>('/api/payment-connections/attempts/:attemptId', ({ params }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const attempt = signupAttempt(String(params.attemptId)) ?? walletMock().attempts[String(params.attemptId)]
    if (!attempt || attempt.userId !== db.meUserId) return mockError('NOT_FOUND', 404)
    if (attempt.status === 'EXPIRED') return mockError('ATTEMPT_EXPIRED', 410)
    // 데모: 첫 조회는 대기, 만든 뒤 1.5초가 지난 다음 조회부터 인증 완료
    attempt.authorizeAt ??= Date.now() + 1500
    if (attempt.status === 'WAITING' && attempt.polls++ >= 1 && Date.now() >= attempt.authorizeAt) attempt.status = 'AUTHORIZED'
    return HttpResponse.json(attemptView(attempt))
  }),

  api.get<ConnectionCandidate[]>('/api/payment-connections/attempts/:attemptId/candidates', ({ params }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const attempt = signupAttempt(String(params.attemptId)) ?? walletMock().attempts[String(params.attemptId)]
    if (!attempt || attempt.userId !== db.meUserId) return mockError('NOT_FOUND', 404)
    if (attempt.status === 'EXPIRED') return mockError('ATTEMPT_EXPIRED', 410)
    if (attempt.status === 'WAITING') attempt.status = 'AUTHORIZED'
    return HttpResponse.json(attempt.candidates)
  }),

  api.post<ConfirmConnectionResponse, ConfirmConnectionRequest>('/api/payment-connections/attempts/:attemptId/confirm', async ({ params, request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const state = walletMock()
    const attempt = signupAttempt(String(params.attemptId)) ?? state.attempts[String(params.attemptId)]
    if (!attempt || attempt.userId !== db.meUserId) return mockError('NOT_FOUND', 404)
    if (attempt.status === 'EXPIRED') return mockError('ATTEMPT_EXPIRED', 410)
    const { candidateIds } = await request.json()
    const picked = DEMO_CANDIDATES.filter((c) => candidateIds.includes(c.candidateId))
    if (picked.length === 0) return mockError('VALIDATION_FAILED', 400)

    let connection = attempt.reconnectConnectionId
      ? state.connections.find((c) => c.id === attempt.reconnectConnectionId)
      : undefined
    if (!connection) {
      connection = { id: `conn-${attempt.id}`, userId: db.meUserId, status: 'ACTIVE', connectedAt: nowKst(), lastSyncedAt: null }
      state.connections.push(connection)
    }
    connection.status = 'ACTIVE'
    connection.lastSyncedAt = nowKst()
    const connId = connection.id

    if (attempt.purpose === 'RECONNECT') {
      for (const p of myMethods()) {
        if (state.methodConnection[p.id] !== connId) continue
        p.status = picked.some((c) => c.maskedNumber === p.maskedNumber) ? 'ACTIVE' : 'REMOVED'
      }
    }
    for (const c of picked) {
      const existing = myMethods().find((p) => p.maskedNumber === c.maskedNumber)
      if (existing) continue
      const id = `pm-${c.candidateId}-${state.seq}`
      db.paymentMethods.push({
        id,
        userId: db.meUserId,
        type: c.type as PaymentMethodType,
        institutionName: c.institutionName,
        productName: c.productName,
        maskedNumber: c.maskedNumber,
        label: `${c.shortLabel} ${c.last4}`,
        status: 'ACTIVE',
      })
      state.methodConnection[id] = connId
    }
    attempt.status = 'CONFIRMED'
    return HttpResponse.json({
      accounts: picked.filter((c) => c.type === 'ACCOUNT').length,
      cards: picked.filter((c) => c.type === 'CARD').length,
    })
  }),

  // 금융정보 연동 동의 저장(WF-05·28·42). 한 경로는 한 핸들러만 소유한다.
  api.post<ConsentStatusResponse, SaveConsentsRequest>('/api/consents', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const body = await request.json()
    const ok = ALL_FIN.every((id) => body.agreements?.some((a) => a.consentId === id && a.agreed && a.version))
    if (!ok) return mockError('TERMS_REQUIRED', 400, undefined, '필수 항목에 동의해 주세요')
    // 재동의는 새 행을 덧붙인다(같은 버전이어도 철회 상태가 남지 않는다, S4)
    walletMock().finMissing = []
    return HttpResponse.json({ valid: true, missing: [], required: [] }, { status: 201 })
  }),

  // 환율(S2C 계약: GET /api/fx · GET/PATCH /api/trips/:tripId/fx-policy)
  api.get<FxRateView>('/api/fx', ({ request }) => {
    const base = new URL(request.url).searchParams.get('base')?.toUpperCase() ?? ''
    const rate = RATES[base]
    if (!rate) return mockError('FX_RATE_UNAVAILABLE', 503)
    const displayRate = (Number(rate.rate) * rate.displayUnit).toFixed(2)
    const body: FxRateView = {
      baseCurrency: 'KRW',
      currency: base,
      ...rate,
      displayRate,
      label: `${rate.displayUnit}${rate.currencyNameKo} = ${displayRate}원`,
      rateType: 'MID',
      source: '하나은행 매매기준율',
      effectiveAt: todayKstAt(18, 0),
      fetchedAt: todayKstAt(18, 1),
    }
    return HttpResponse.json(body)
  }),

  api.get<TripFxView>('/api/trips/:tripId/fx-policy', ({ params }) => {
    const tripId = String(params.tripId)
    const { denied } = requireMember(tripId)
    if (denied) return denied
    const view = tripFxView(tripId)
    return view ? HttpResponse.json(view) : mockError('NOT_FOUND', 404)
  }),

  api.patch<UpdateFxPolicyResponse, UpdateFxPolicyRequest>('/api/trips/:tripId/fx-policy', async ({ params, request }) => {
    const tripId = String(params.tripId)
    const { denied, membership } = requireMember(tripId)
    if (denied) return denied
    const trip = findTrip(tripId)!
    if (membership.role !== 'LEADER') return mockError('NOT_LEADER', 403, undefined, '그룹장만 바꿀 수 있어요')
    if (trip.status === 'ENDED') return mockError('FX_POLICY_LOCKED', 409)
    const body = await request.json()
    if (body.version !== trip.version) return mockError('VERSION_CONFLICT', 409, { current: tripFxView(tripId) })
    if (body.policy === 'FIXED') {
      if (!body.fixedRate || !/^\d{1,12}(\.\d{1,2})?$/.test(body.fixedRate) || Number(body.fixedRate) <= 0) {
        return mockError('VALIDATION_FAILED', 400, {
          fields: [{ path: 'fixedRate', code: 'matches', message: '0보다 큰 환율을 소수 둘째 자리까지 입력해 주세요' }],
        })
      }
      walletMock().fixedRates[tripId] = Number(body.fixedRate).toFixed(2)
    }
    trip.fxPolicy = body.policy
    trip.version += 1
    const recalculatedCount = db.expenses.filter((e) => e.tripId === tripId && e.originalCurrency !== 'KRW').length
    return HttpResponse.json({ fx: tripFxView(tripId)!, recalculatedCount })
  }),
]
