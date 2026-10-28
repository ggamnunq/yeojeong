import { http, HttpResponse, type HttpHandler } from 'msw'
import { activeMembership, db, findTrip, type MockPaymentMethod } from '../../mocks/data'
import { denyUnlessAuthenticated, mockError, requireMember } from '../../mocks/utils'
import type {
  AttemptPurpose,
  AttemptStatus,
  ConnectionCandidate,
  ConnectionStatus,
  ConsentDocumentSummary,
  FinConsentId,
  FxRateView,
  PaymentMethodsResponse,
  PaymentMethodType,
  SaveConsentsRequest,
  StartConnectionRequest,
  TripFxView,
  UpdateFxPolicyRequest,
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
  expiresAt: string
  candidates: ConnectionCandidate[]
}

export type WalletMockState = {
  connections: MockConnection[]
  /** 결제수단 ID → 연결 ID */
  methodConnection: Record<string, string>
  /** 금융정보 연동 동의(FIN_*) 현재 버전 유효 여부 */
  finConsent: boolean
  attempts: Record<string, MockAttempt>
  /** 여정별 고정 환율 마지막 입력값 */
  fixedRates: Record<string, string>
  lastManualSyncAt: number | null
  seq: number
}

/** 데모 페르소나(준용)의 토스 후보 — HF-07 */
const DEMO_CANDIDATES: MockCandidate[] = [
  { candidateId: 'cand-toss-account', type: 'ACCOUNT', institutionName: '토스뱅크', productName: '토스뱅크 통장', shortLabel: '토스뱅크 통장', maskedNumber: '1000-12**-**21', last4: '21' },
  { candidateId: 'cand-kakao-safebox', type: 'ACCOUNT', institutionName: '카카오뱅크', productName: '카카오뱅크 세이프박스', shortLabel: '카카오뱅크 통장', maskedNumber: '3333-**-****821', last4: '821' },
  { candidateId: 'cand-toss-check', type: 'CARD', institutionName: '토스뱅크', productName: '토스뱅크 체크카드', shortLabel: '토스뱅크 체크카드', maskedNumber: '5365-****-****-1934', last4: '1934' },
  { candidateId: 'cand-shinhan', type: 'CARD', institutionName: '신한카드', productName: '신한카드 Deep Dream', shortLabel: '신한카드', maskedNumber: '4518-****-****-1102', last4: '1102' },
]

const FIN_DOCS: ConsentDocumentSummary[] = [
  { consentId: 'FIN_LINK', title: '금융정보 연동 약관', required: true, version: '2026-11-01', docUrl: '/terms/fin-link', hasDetail: true, hidden: false, summary: null },
  { consentId: 'FIN_PRIVACY', title: '금융정보 수집·이용', required: true, version: '2026-11-01', docUrl: '/consents/FIN_PRIVACY', hasDetail: true, hidden: false, summary: null },
  { consentId: 'THIRD_PARTY', title: '공동 결제 그룹 공개', required: true, version: '2026-11-01', docUrl: '/consents/THIRD_PARTY', hasDetail: true, hidden: false, summary: null },
]

/** 통화별 최신 매매기준율(샘플 100엔 = 919.20원) */
const RATES: Record<string, Pick<FxRateView, 'currencyNameKo' | 'displayUnit' | 'rate'>> = {
  JPY: { currencyNameKo: '엔', displayUnit: 100, rate: '9.192000' },
  USD: { currencyNameKo: '달러', displayUnit: 1, rate: '1380.500000' },
  EUR: { currencyNameKo: '유로', displayUnit: 1, rate: '1495.300000' },
}

const states = new WeakMap<MockPaymentMethod[], WalletMockState>()

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
    finConsent: true,
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
  if (mode === 'no-consent') state.finConsent = false
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

const myMethods = () => db.paymentMethods.filter((p) => p.userId === db.meUserId && p.status !== 'REMOVED')

function shortLabelOf(p: MockPaymentMethod) {
  const last4 = p.maskedNumber.replace(/\D/g, '').slice(-4)
  return p.label.endsWith(last4) ? p.label.slice(0, -last4.length).trim() : p.label
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
        last4: p.maskedNumber.replace(/\D/g, '').slice(-4),
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

function attemptView(a: MockAttempt) {
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
          source: '하나은행 매매기준율',
          effectiveAt: todayKstAt(18, 0),
          fetchedAt: todayKstAt(18, 1),
        }
  return {
    baseCurrency: 'KRW',
    tripCurrency: trip.currency,
    currencyNameKo: isKrwTrip ? '원' : (rate?.currencyNameKo ?? trip.currency),
    displayUnit: rate?.displayUnit ?? 1,
    isKrwTrip,
    current,
    policy: trip.fxPolicy,
    fixedRate: walletMock().fixedRates[tripId] ?? null,
    policyChangedAt: null,
    canEdit: me.role === 'LEADER' && trip.status !== 'ENDED' && !isKrwTrip,
    version: trip.version,
  }
}

// ── 핸들러 ────────────────────────────────────────────────────────

export const handlers: HttpHandler[] = [
  http.get('/api/payment-methods', () => denyUnlessAuthenticated() ?? HttpResponse.json(methodsResponse())),

  http.post('/api/payment-methods/sync', () => {
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
    for (const c of mine) c.lastSyncedAt = startedAt
    return HttpResponse.json({ syncRunIds: mine.map((c) => `sync-${c.id}`), startedAt }, { status: 202 })
  }),

  http.delete('/api/payment-methods/:paymentMethodId', ({ params, request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const state = walletMock()
    const method = myMethods().find((p) => p.id === params.paymentMethodId)
    if (!method) return mockError('NOT_FOUND', 404)
    const connectionId = state.methodConnection[method.id]
    const siblings = myMethods().filter((p) => state.methodConnection[p.id] === connectionId)
    const purge = new URL(request.url).searchParams.get('purgeImported') === 'true'
    if (purge && siblings.length > 1) return mockError('BAD_REQUEST', 400)
    method.status = 'REMOVED'
    if (siblings.length === 1) {
      const conn = state.connections.find((c) => c.id === connectionId)
      if (conn) conn.status = 'REVOKED'
      state.finConsent = false
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/payment-connections', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const state = walletMock()
    if (!state.finConsent) {
      const missing: FinConsentId[] = ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY']
      // TODO(서버): 실제 응답의 required는 { id, version }[]. src/api consentRequiredIds가 문자열만 읽어 목은 문자열로 준다
      return mockError('CONSENT_REQUIRED', 403, { missing, required: missing }, '금융정보 연동 동의가 필요해요')
    }
    const body = (await request.json()) as StartConnectionRequest
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
    // 데모 어댑터: 인증 주소가 곧바로 우리 콜백 → WF-07로 돌아온다. 새 창이면 WF-07이 스스로 닫힌다
    return HttpResponse.json({ attemptId: id, authUrl: `/wallet/connect/select?attempt=${id}`, expiresAt: attempt.expiresAt }, { status: 201 })
  }),

  http.get('/api/payment-connections/attempts/:attemptId', ({ params }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const attempt = walletMock().attempts[String(params.attemptId)]
    if (!attempt || attempt.userId !== db.meUserId) return mockError('NOT_FOUND', 404)
    if (attempt.status === 'EXPIRED') return mockError('ATTEMPT_EXPIRED', 410)
    // 데모: 첫 조회는 대기, 다음 조회부터 인증 완료
    if (attempt.status === 'WAITING' && attempt.polls++ >= 1) attempt.status = 'AUTHORIZED'
    return HttpResponse.json(attemptView(attempt))
  }),

  http.get('/api/payment-connections/attempts/:attemptId/candidates', ({ params }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const attempt = walletMock().attempts[String(params.attemptId)]
    if (!attempt || attempt.userId !== db.meUserId) return mockError('NOT_FOUND', 404)
    if (attempt.status === 'EXPIRED') return mockError('ATTEMPT_EXPIRED', 410)
    if (attempt.status === 'WAITING') attempt.status = 'AUTHORIZED'
    return HttpResponse.json(attempt.candidates)
  }),

  http.post('/api/payment-connections/attempts/:attemptId/confirm', async ({ params, request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const state = walletMock()
    const attempt = state.attempts[String(params.attemptId)]
    if (!attempt || attempt.userId !== db.meUserId) return mockError('NOT_FOUND', 404)
    if (attempt.status === 'EXPIRED') return mockError('ATTEMPT_EXPIRED', 410)
    const { candidateIds } = (await request.json()) as { candidateIds: string[] }
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

  // 금융정보 연동 동의(HF-05b) — W3A 목이 같은 경로를 먼저 받으면 그쪽이 쓰인다(handlers는 파일 이름 순)
  http.get('/api/consents/documents', ({ request }) => {
    const stage = new URL(request.url).searchParams.get('stage')
    if (stage !== 'FIN_LINK') return HttpResponse.json([])
    return HttpResponse.json(FIN_DOCS)
  }),

  http.post('/api/consents', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const body = (await request.json()) as SaveConsentsRequest
    const ok = FIN_DOCS.every((doc) =>
      body.agreements.some((a) => a.consentId === doc.consentId && a.agreed && a.version === doc.version),
    )
    if (!ok) return mockError('TERMS_REQUIRED', 400, undefined, '필수 항목에 동의해 주세요')
    walletMock().finConsent = true
    return HttpResponse.json({ valid: true }, { status: 201 })
  }),

  // 환율(S2C 계약: GET /api/fx · GET/PATCH /api/trips/:tripId/fx-policy)
  http.get('/api/fx', ({ request }) => {
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

  http.get('/api/trips/:tripId/fx-policy', ({ params }) => {
    const tripId = String(params.tripId)
    const { denied } = requireMember(tripId)
    if (denied) return denied
    const view = tripFxView(tripId)
    return view ? HttpResponse.json(view) : mockError('NOT_FOUND', 404)
  }),

  http.patch('/api/trips/:tripId/fx-policy', async ({ params, request }) => {
    const tripId = String(params.tripId)
    const { denied, membership } = requireMember(tripId)
    if (denied) return denied
    const trip = findTrip(tripId)!
    if (membership.role !== 'LEADER') return mockError('NOT_LEADER', 403, undefined, '그룹장만 바꿀 수 있어요')
    if (trip.status === 'ENDED') return mockError('FX_POLICY_LOCKED', 409)
    const body = (await request.json()) as UpdateFxPolicyRequest
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
    return HttpResponse.json({ fx: tripFxView(tripId), recalculatedCount })
  }),
]
