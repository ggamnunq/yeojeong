import type { ConsentStage, ExpenseStatus } from './types'

// TanStack Query 키. 앞쪽이 같으면 같이 무효화된다: invalidateQueries({ queryKey: keys.trips.detail(id) })는 그 여정의 결제·현황·정산까지 다시 받는다.
// 플로우 전용 키는 features/<flow>/api.ts에서 이 키를 앞에 붙여 만든다: [...keys.trips.detail(id), 'something'].

export type ExpenseListParams = {
  status?: ExpenseStatus
  day?: number
  order?: 'asc' | 'desc'
}

const trip = (tripId: string) => ['trips', tripId] as const

export const keys = {
  health: ['health'] as const,
  /** GET /auth/session */
  session: ['session'] as const,
  /** GET /users/me */
  me: ['me'] as const,

  trips: {
    all: ['trips'] as const,
    /** GET /me/trips */
    list: ['trips', 'list'] as const,
    /** GET /trips/:tripId — 아래 키들이 모두 이 키로 시작한다 */
    detail: trip,
    /** GET /trips/:tripId/expenses */
    expenses: (tripId: string, params: ExpenseListParams = {}) => [...trip(tripId), 'expenses', params] as const,
    /** GET /trips/:tripId/expenses/:expenseId */
    expense: (tripId: string, expenseId: string) => [...trip(tripId), 'expense', expenseId] as const,
    /** GET /trips/:tripId/out-of-period-candidates */
    outOfPeriod: (tripId: string, side: 'BEFORE' | 'AFTER') => [...trip(tripId), 'out-of-period', side] as const,
    /** GET /trips/:tripId/summary */
    summary: (tripId: string) => [...trip(tripId), 'summary'] as const,
    /** GET /trips/:tripId/settlement */
    settlement: (tripId: string) => [...trip(tripId), 'settlement'] as const,
    /** GET /trips/:tripId/settlement/members/:membershipId */
    settlementMember: (tripId: string, membershipId: string) =>
      [...trip(tripId), 'settlement', 'members', membershipId] as const,
    /** GET /trips/:tripId/end-preview */
    endPreview: (tripId: string) => [...trip(tripId), 'end-preview'] as const,
    /** GET /trips/:tripId/fx */
    fx: (tripId: string) => [...trip(tripId), 'fx'] as const,
  },

  groups: {
    /** GET /groups/:groupId/members */
    members: (groupId: string, includeLeft = false) => ['groups', groupId, 'members', { includeLeft }] as const,
  },

  /** GET /invites/:code */
  invite: (code: string) => ['invites', code] as const,
  /** GET /currencies(여정 통화로 고를 수 있는 통화, 서버 고정 목록) */
  currencies: ['currencies'] as const,

  consents: {
    /** GET /consents/documents?stage= */
    documents: (stage: ConsentStage) => ['consents', 'documents', stage] as const,
    /** GET /consents/status?stage= */
    status: (stage: ConsentStage) => ['consents', 'status', stage] as const,
  },

  wallet: {
    all: ['wallet'] as const,
    /** GET /payment-methods */
    methods: ['wallet', 'methods'] as const,
    /** GET /payment-connections/attempts/:attemptId */
    attempt: (attemptId: string) => ['wallet', 'attempts', attemptId] as const,
    /** GET /payment-connections/attempts/:attemptId/candidates */
    candidates: (attemptId: string) => ['wallet', 'attempts', attemptId, 'candidates'] as const,
  },
} as const
