import {
  ADMIN_CARD_IMPORT_GRANT_NOTE_MAX,
  ADMIN_LOGIN_LIMIT,
  ADMIN_STEP_UP_LIMIT,
  ADMIN_USER_PAGE_SIZE,
  ADMIN_WITHDRAW_REASON_LENGTH,
  CARD_IMPORT_FETCH_LIMIT,
  type AdminCardImportGrant,
  type AdminCardImportGrantList,
  type AdminCardImportGrantSource,
  type AdminCodefUsage,
  type AdminCreateCardImportGrantRequest,
  type AdminLoginRequest,
  type AdminSessionView,
  type AdminUserDetail,
  type AdminUserListItem,
  type AdminUserListResponse,
  type AdminWithdrawUserRequest,
  type AdminWithdrawUserResponse,
} from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import { api, mockError, noContent, type NoContent } from '../../mocks/utils'

// 관리자 API 목(/api/admin/*). 상태는 이 파일 안에만 둔다(앱 목 db와 섞지 않는다).
// 개발 서버: VITE_MOCK_API=1에서 /admin/login → 아이디 admin · 비밀번호 admin-password-123 · 인증 코드 246810(목 전용 값).
// 인증 코드(TOTP)는 한 번 쓰면 다시 받지 않는다(서버와 같이). 로그인 뒤 탈퇴 재인증에는 두 번째 코드 135791을 쓴다.
// 로그인 여부는 sessionStorage 'yj:mock:admin'에 둬서 새로고침해도 유지된다. 테스트는 afterEach에서 resetAdminMock().
// 카드 불러오기 권한: 단계 allowlist, env 목록 = 준용 + 탈퇴한 ID 하나, 관리자 권한 = 여행자05(시작 상태). 권한 추가·회수는 이 파일 상태만 바꾼다.

export const ADMIN_MOCK_CREDENTIALS = { username: 'admin', password: 'admin-password-123' } as const
/** 목이 받는 인증 코드(목 전용). 각 코드는 한 번만 쓸 수 있다 — 로그인에 [0], 재인증에 [1] */
export const ADMIN_MOCK_TOTP_CODES = ['246810', '135791'] as const
const SESSION_KEY = 'yj:mock:admin'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const ADMIN_MOCK_USER = {
  junyong: uuid(1),
  minji: uuid(2),
  taehyeon: uuid(3),
  withdrawn: uuid(99),
} as const

/** 목 관리자 행위자 ID(서버는 아이디에서 만든 UUID) */
export const ADMIN_MOCK_ACTOR_ID = '6f1c2a9e-0b7d-4c55-9e1a-3d2f8b7c6a10'
/** env CARD_IMPORT_ALLOWED_USER_IDS 흉내(회수 불가) — 준용 + 탈퇴한 회원 ID */
const ENV_ALLOWLIST: readonly string[] = [ADMIN_MOCK_USER.junyong, ADMIN_MOCK_USER.withdrawn]
/** 시작할 때 관리자 권한이 있는 회원(여행자05) */
export const ADMIN_MOCK_GRANTED_USER = uuid(5)

const BASE = Date.parse('2026-10-29T12:00:00+09:00')
const DAY = 86_400_000
const kstIso = (ms: number) => `${new Date(ms + 9 * 3_600_000).toISOString().slice(0, 19)}+09:00`

function fixtureUsers(): AdminUserDetail[] {
  const named: [string, Partial<AdminUserDetail>][] = [
    ['준용', { kakaoIdLast4: '4821' }],
    [
      '민지',
      {
        status: 'DELETION_REQUESTED',
        deletionRequest: { requestedAt: kstIso(BASE - 3_600_000) },
      },
    ],
    ['태현', {}],
  ]
  const users: AdminUserDetail[] = []
  for (let i = 0; i < 25; i += 1) {
    const [nickname, extra] = named[i] ?? [`여행자${String(i + 1).padStart(2, '0')}`, {}]
    const createdAt = kstIso(BASE - i * DAY)
    // 최근 로그인 순서는 가입 순서와 다르게(정렬 확인용)
    const lastLoginAt = kstIso(BASE - ((i * 7) % 25) * 3_600_000)
    users.push({
      id: uuid(i + 1),
      nickname,
      createdAt,
      lastLoginAt,
      tripCount: i % 3,
      walletEntryCount: (i * 5) % 17,
      status: 'ACTIVE',
      // 실제 값은 응답 때 권한 상태로 채운다(withCardImport)
      cardImport: { allowlisted: false, granted: false, enabled: false },
      kakaoIdLast4: String(1000 + i),
      deletionRequest: null,
      consents: [
        { consentId: 'TOS', version: '0.1-draft', agreed: true, agreedAt: createdAt, withdrawnAt: null, withdrawChannel: null },
        { consentId: 'PRIVACY', version: '0.1-draft', agreed: true, agreedAt: createdAt, withdrawnAt: null, withdrawChannel: null },
        { consentId: 'AGE14', version: '0.1-draft', agreed: true, agreedAt: createdAt, withdrawnAt: null, withdrawChannel: null },
        ...(i === 0
          ? [
              {
                consentId: 'CARD_IMPORT',
                version: '0.1-draft',
                agreed: true,
                agreedAt: kstIso(BASE - DAY),
                withdrawnAt: kstIso(BASE - 3_600_000),
                withdrawChannel: 'HF-58',
              },
            ]
          : []),
      ],
      trips:
        i === 0
          ? [
              {
                groupId: uuid(1001),
                tripId: uuid(2001),
                name: '오사카 3박 4일',
                tripStatus: 'ONGOING',
                startDate: '2026-10-27',
                endDate: '2026-10-30',
                role: 'LEADER',
                joinedAt: kstIso(BASE - 10 * DAY),
                leftAt: null,
                deleted: false,
              },
              {
                groupId: uuid(1002),
                tripId: uuid(2002),
                name: '제주 우정여행',
                tripStatus: 'ENDED',
                startDate: '2026-08-01',
                endDate: '2026-08-03',
                role: 'MEMBER',
                joinedAt: kstIso(BASE - 100 * DAY),
                leftAt: kstIso(BASE - 80 * DAY),
                deleted: true,
              },
            ]
          : [],
      counts: { expenses: i === 0 ? 12 : i, walletEntries: (i * 5) % 17, paymentMethods: i === 0 ? 2 : 0, activeSessions: 1 },
      ...extra,
    })
  }
  return users
}

function fixtureCodefUsage(): AdminCodefUsage {
  const days = Array.from({ length: 14 }, (_, i) => {
    const offset = 13 - i
    return {
      day: kstIso(BASE - offset * DAY).slice(0, 10),
      // 카운터는 7일 보관
      codefCalls: offset < 7 ? 8 + ((offset * 13) % 30) : null,
      fetchStarts: 2 + ((offset * 3) % 7),
      successes: 1 + ((offset * 2) % 5),
      failures: offset % 3,
    }
  })
  return {
    asOf: kstIso(BASE),
    today: {
      day: kstIso(BASE).slice(0, 10),
      calls: 36,
      budget: 100,
      reserved: 3,
      inProgress: 1,
      remaining: 64,
      fetchStarts: 9,
      successes: 6,
      failures: 2,
      byResult: [
        { step: 'START', result: 'OK', count: 5 },
        { step: 'START', result: 'TWO_WAY_REQUIRED', count: 1 },
        { step: 'START', result: 'CARD_LOGIN_FAILED', count: 2 },
        { step: 'START', result: 'PENDING', count: 1 },
        { step: 'TWO_WAY', result: 'OK', count: 1 },
      ],
      byOrganization: [
        { organization: '0306', count: 5 },
        { organization: '0301', count: 4 },
      ],
    },
    days,
    topUsers: [
      { userId: ADMIN_MOCK_USER.junyong, nickname: '준용', count: 6, limit: CARD_IMPORT_FETCH_LIMIT.DAILY },
      { userId: ADMIN_MOCK_USER.withdrawn, nickname: null, count: 3, limit: CARD_IMPORT_FETCH_LIMIT.DAILY },
    ],
    loginCooldownUsers: 1,
    pendingDeletions: { count: 0, oldestCreatedAt: null },
    flags: { featureCardImport: 'allowlist', effectiveMode: 'allowlist', codefEnv: 'sandbox', codefLoginMode: 'direct', allowlistCount: 1 },
  }
}

type MockGrant = { grantedAt: string; note: string | null }
const fixtureGrants = () => new Map<string, MockGrant>([[ADMIN_MOCK_GRANTED_USER, { grantedAt: kstIso(BASE - 2 * DAY), note: '운영자 실테스트' }]])

const state = {
  loggedIn: false,
  failures: 0,
  stepUpFailures: 0,
  usedCodes: new Set<string>(),
  users: fixtureUsers(),
  grants: fixtureGrants(),
}

/** 회원의 카드 불러오기 상태(단계 allowlist: env 목록 또는 관리자 권한) */
function withCardImport<T extends AdminUserDetail>(user: T): T {
  const allowlisted = ENV_ALLOWLIST.includes(user.id)
  const granted = state.grants.has(user.id)
  return { ...user, cardImport: { allowlisted, granted, enabled: allowlisted || granted } }
}

function grantItem(userId: string): AdminCardImportGrant {
  const grant = state.grants.get(userId)
  const user = state.users.find((u) => u.id === userId)
  const sources: AdminCardImportGrantSource[] = []
  if (grant) sources.push('ADMIN')
  if (ENV_ALLOWLIST.includes(userId)) sources.push('ENV')
  return {
    userId,
    nickname: user?.nickname ?? null,
    sources,
    grantedAt: grant?.grantedAt ?? null,
    grantedBy: grant ? ADMIN_MOCK_ACTOR_ID : null,
    note: grant?.note ?? null,
    revocable: grant !== undefined,
    cardImportConsent: user?.consents.some((c) => c.consentId === 'CARD_IMPORT' && c.agreed && !c.withdrawnAt) ?? false,
    todayFetchCount: userId === ADMIN_MOCK_USER.junyong ? 6 : 0,
  }
}

function grantList(): AdminCardImportGrantList {
  const admin = [...state.grants.entries()].sort((a, b) => b[1].grantedAt.localeCompare(a[1].grantedAt)).map(([id]) => id)
  const envOnly = ENV_ALLOWLIST.filter((id) => !state.grants.has(id))
  return {
    asOf: kstIso(BASE),
    flags: { featureCardImport: 'allowlist', effectiveMode: 'allowlist' },
    dailyLimit: CARD_IMPORT_FETCH_LIMIT.DAILY,
    items: [...admin, ...envOnly].map(grantItem),
  }
}

/** 맞고 아직 쓰지 않은 인증 코드면 쓴 것으로 표시하고 true */
function claimTotp(code: unknown): boolean {
  if (typeof code !== 'string' || !(ADMIN_MOCK_TOTP_CODES as readonly string[]).includes(code) || state.usedCodes.has(code)) {
    return false
  }
  state.usedCodes.add(code)
  return true
}

const isMockTotp = (code: unknown) =>
  typeof code === 'string' && (ADMIN_MOCK_TOTP_CODES as readonly string[]).includes(code) && !state.usedCodes.has(code)

function readLoggedIn(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return state.loggedIn
  }
}

function setLoggedIn(value: boolean) {
  state.loggedIn = value
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, '1')
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // 저장소가 없으면 메모리만
  }
}

/** 목 상태를 처음으로(테스트 afterEach) */
export function resetAdminMock() {
  setLoggedIn(false)
  state.failures = 0
  state.stepUpFailures = 0
  state.usedCodes = new Set()
  state.users = fixtureUsers()
  state.grants = fixtureGrants()
}

/** 테스트에서 바로 로그인한 상태로 시작 */
export function signInAdminMock() {
  setLoggedIn(true)
}

function sessionView(): AdminSessionView {
  const now = Date.now()
  return { authenticated: true, expiresAt: kstIso(now + 8 * 3_600_000), idleExpiresAt: kstIso(now + 30 * 60_000) }
}

const denyUnlessAdmin = () => (readLoggedIn() ? null : mockError('ADMIN_UNAUTHENTICATED', 401))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const listItem = (user: AdminUserDetail) => {
  const { id, nickname, createdAt, lastLoginAt, tripCount, walletEntryCount, status, cardImport } = withCardImport(user)
  return { id, nickname, createdAt, lastLoginAt, tripCount, walletEntryCount, status, cardImport } satisfies AdminUserListItem
}

export const handlers: HttpHandler[] = [
  api.post<AdminSessionView, AdminLoginRequest>('/api/admin/login', async ({ request }) => {
    if (state.failures >= ADMIN_LOGIN_LIMIT.IP_ATTEMPTS) {
      const retryAfterSec = ADMIN_LOGIN_LIMIT.WINDOW_SECONDS
      return mockError('ADMIN_LOGIN_RATE_LIMITED', 429, {
        retryAfter: new Date(Date.now() + retryAfterSec * 1000).toISOString(),
        retryAfterSec,
      })
    }
    const body = await request.json()
    if (
      body.username !== ADMIN_MOCK_CREDENTIALS.username ||
      body.password !== ADMIN_MOCK_CREDENTIALS.password ||
      !isMockTotp(body.totp)
    ) {
      state.failures += 1
      return mockError('ADMIN_LOGIN_FAILED', 401)
    }
    claimTotp(body.totp)
    state.failures = 0
    setLoggedIn(true)
    return HttpResponse.json(sessionView())
  }),

  api.post<NoContent>('/api/admin/logout', () => {
    setLoggedIn(false)
    return noContent()
  }),

  api.get<AdminSessionView>('/api/admin/session', () => denyUnlessAdmin() ?? HttpResponse.json(sessionView())),

  api.get<AdminUserListResponse>('/api/admin/users', ({ request }) => {
    const denied = denyUnlessAdmin()
    if (denied) return denied
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    const sort = url.searchParams.get('sort') === 'lastLoginAt' ? 'lastLoginAt' : 'createdAt'
    const limit = Math.min(Number(url.searchParams.get('limit')) || ADMIN_USER_PAGE_SIZE.DEFAULT, ADMIN_USER_PAGE_SIZE.MAX)
    const offset = Number(url.searchParams.get('cursor') ?? '0') || 0
    const matched = state.users
      .filter((u) => (!q ? true : UUID.test(q) ? u.id === q.toLowerCase() : u.nickname.includes(q)))
      .sort((a, b) => b[sort].localeCompare(a[sort]) || b.id.localeCompare(a.id))
    const page = matched.slice(offset, offset + limit)
    const next = offset + limit < matched.length ? String(offset + limit) : null
    return HttpResponse.json({ items: page.map(listItem), nextCursor: next })
  }),

  api.get<AdminUserDetail>('/api/admin/users/:userId', ({ params }) => {
    const denied = denyUnlessAdmin()
    if (denied) return denied
    const user = state.users.find((u) => u.id === params.userId)
    return user ? HttpResponse.json(withCardImport(user)) : mockError('NOT_FOUND', 404)
  }),

  api.post<AdminWithdrawUserResponse, AdminWithdrawUserRequest>('/api/admin/users/:userId/withdraw', async ({ params, request }) => {
    const denied = denyUnlessAdmin()
    if (denied) return denied
    const user = state.users.find((u) => u.id === params.userId)
    if (!user) return mockError('NOT_FOUND', 404)
    const body = await request.json()
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < ADMIN_WITHDRAW_REASON_LENGTH.MIN || reason.length > ADMIN_WITHDRAW_REASON_LENGTH.MAX) {
      return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'reason', code: 'length', message: '사유를 2~200자로 적어 주세요' }] })
    }
    if (body.confirmNickname !== user.nickname) return mockError('ADMIN_CONFIRM_MISMATCH', 400)
    if (state.stepUpFailures >= ADMIN_STEP_UP_LIMIT.ATTEMPTS) {
      const retryAfterSec = ADMIN_STEP_UP_LIMIT.WINDOW_SECONDS
      return mockError('ADMIN_STEP_UP_RATE_LIMITED', 429, {
        retryAfter: new Date(Date.now() + retryAfterSec * 1000).toISOString(),
        retryAfterSec,
      })
    }
    if (body.password !== ADMIN_MOCK_CREDENTIALS.password || !claimTotp(body.totp)) {
      state.stepUpFailures += 1
      return mockError('ADMIN_STEP_UP_FAILED', 403)
    }
    state.stepUpFailures = 0
    state.users = state.users.filter((u) => u.id !== user.id)
    // 탈퇴하면 관리자 권한도 지워진다(서버 탈퇴 파이프라인)
    state.grants.delete(user.id)
    return HttpResponse.json({ status: 'DELETED', accountDeletionId: uuid(5000), completedAt: kstIso(Date.now()) })
  }),

  api.get<AdminCodefUsage>('/api/admin/codef-usage', () => denyUnlessAdmin() ?? HttpResponse.json(fixtureCodefUsage())),

  api.get<AdminCardImportGrantList>('/api/admin/card-import-grants', () => denyUnlessAdmin() ?? HttpResponse.json(grantList())),

  api.post<AdminCardImportGrant, AdminCreateCardImportGrantRequest>('/api/admin/card-import-grants', async ({ request }) => {
    const denied = denyUnlessAdmin()
    if (denied) return denied
    const body = await request.json()
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (!UUID.test(String(body.userId)) || note.length > ADMIN_CARD_IMPORT_GRANT_NOTE_MAX) {
      return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'userId', code: 'isUuid', message: '사용자 ID를 확인해 주세요' }] })
    }
    const user = state.users.find((u) => u.id === body.userId)
    if (!user) return mockError('NOT_FOUND', 404)
    if (state.grants.has(user.id)) return mockError('ADMIN_CARD_IMPORT_GRANT_EXISTS', 409)
    state.grants.set(user.id, { grantedAt: kstIso(Date.now()), note: note || null })
    return HttpResponse.json(grantItem(user.id), { status: 201 })
  }),

  api.delete<NoContent>('/api/admin/card-import-grants/:userId', ({ params }) => {
    const denied = denyUnlessAdmin()
    if (denied) return denied
    const userId = String(params.userId)
    if (state.grants.delete(userId)) return noContent()
    if (ENV_ALLOWLIST.includes(userId)) return mockError('ADMIN_CARD_IMPORT_GRANT_ENV_ONLY', 409)
    return mockError('NOT_FOUND', 404)
  }),
]
