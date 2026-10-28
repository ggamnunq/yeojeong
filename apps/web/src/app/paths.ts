// 화면 주소(화면명세 0-3). 링크·navigate는 문자열을 직접 쓰지 말고 이 함수를 쓴다.

export type TripTab = 'payments' | 'stats' | 'settlement' | 'info'

const q = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value))
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const paths = {
  splash: () => '/',
  login: (returnTo?: string) => `/login${q({ returnTo })}`,
  signupNickname: () => '/signup/nickname',
  signupTerms: () => '/signup/terms',
  signupWallet: () => '/signup/wallet',
  reconsent: (required: readonly string[] = [], returnTo?: string) =>
    `/reconsent${q({ required: required.join(',') || undefined, returnTo })}`,

  walletConnectToss: (attemptId: string) => `/wallet/connect/toss${q({ attempt: attemptId })}`,
  walletConnectSelect: (attemptId: string) => `/wallet/connect/select${q({ attempt: attemptId })}`,
  walletConnectDone: (attemptId: string) => `/wallet/connect/done${q({ attempt: attemptId })}`,
  wallet: () => '/wallet',
  me: () => '/me',

  trips: () => '/trips',
  tripNew: () => '/trips/new',
  join: (code?: string) => `/join${q({ code })}`,

  /** 단계별 기본 탭으로 다시 보낸다 */
  trip: (tripId: string) => `/trips/${tripId}`,
  tripTab: (tripId: string, tab: TripTab) => `/trips/${tripId}/${tab}`,
  tripEdit: (tripId: string) => `/trips/${tripId}/edit`,
  tripCreated: (tripId: string) => `/trips/${tripId}/created`,
  payments: (tripId: string, params: { view?: 'timeline'; day?: number; filter?: 'pending' } = {}) =>
    `/trips/${tripId}/payments${q(params)}`,
  payment: (tripId: string, expenseId: string) => `/trips/${tripId}/payments/${expenseId}`,
  outOfPeriod: (tripId: string) => `/trips/${tripId}/payments/out-of-period`,
  stats: (tripId: string) => `/trips/${tripId}/stats`,
  settlement: (tripId: string) => `/trips/${tripId}/settlement`,
  settlementMember: (tripId: string, membershipId: string) => `/trips/${tripId}/settlement/${membershipId}`,
  tripInfo: (tripId: string) => `/trips/${tripId}/info`,
  fx: (tripId: string) => `/trips/${tripId}/fx`,

  terms: () => '/terms',
  privacy: () => '/privacy',
  finLinkTerms: () => '/terms/fin-link',
  consent: (consentId: string) => `/consents/${consentId}`,
  licenses: () => '/licenses',
} as const

/** 로그인 뒤 돌아올 수 있는 같은 origin 경로만 받는다(`//evil.com`·`/\\evil.com` 차단) */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  return value
}
