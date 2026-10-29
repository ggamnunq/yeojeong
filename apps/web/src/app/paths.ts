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
  /** 지갑 결제 추가 시트(WF-48) */
  walletNew: () => '/wallet/new',
  /** 지갑 결제 수정 시트(WF-50 지갑 폼) */
  walletEntryEdit: (entryId: string) => `/wallet/${entryId}/edit`,
  /** 카드 내역 불러오기 시작 전 확인(WF-51) */
  walletImport: () => '/wallet/import',
  /** 카드사 선택(WF-52) */
  walletImportIssuer: () => '/wallet/import/issuer',
  /** 카드사 로그인(WF-53, 54~57은 같은 주소의 단계). issuer = CODEF 기관 코드 — 민감 값은 주소에 넣지 않는다 */
  walletImportLogin: (issuer: string) => `/wallet/import/${encodeURIComponent(issuer)}`,
  me: () => '/me',
  /** 동의 관리(WF-58) */
  meConsents: () => '/me/consents',
  /** 탈퇴(HF-59) */
  meWithdraw: () => '/me/withdraw',

  trips: () => '/trips',
  tripNew: () => '/trips/new',
  /**
   * 참여(HF-12). 초대 링크는 코드를 fragment에 싣는다(`/join#code=K7M2QX`, W8 보안 리뷰 L1) — 첫 문서 요청·Referer·크롤러에 코드가 실리지 않는다.
   * 예전 `?code=` 링크도 받는다(pendingInvite.captureInviteLink · JoinPage)
   */
  join: (code?: string) => `/join${code ? `#code=${encodeURIComponent(code)}` : ''}`,

  /** 단계별 기본 탭으로 다시 보낸다 */
  trip: (tripId: string) => `/trips/${tripId}`,
  tripTab: (tripId: string, tab: TripTab) => `/trips/${tripId}/${tab}`,
  tripEdit: (tripId: string) => `/trips/${tripId}/edit`,
  tripCreated: (tripId: string) => `/trips/${tripId}/created`,
  payments: (tripId: string, params: { view?: 'timeline'; day?: number; filter?: 'pending' } = {}) =>
    `/trips/${tripId}/payments${q(params)}`,
  payment: (tripId: string, expenseId: string) => `/trips/${tripId}/payments/${expenseId}`,
  /** 여정 결제 추가 시트(WF-46) */
  paymentNew: (tripId: string) => `/trips/${tripId}/payments/new`,
  /** 수동 결제 수정 시트(WF-50 여정 폼) */
  paymentEdit: (tripId: string, expenseId: string) => `/trips/${tripId}/payments/${expenseId}/edit`,
  outOfPeriod: (tripId: string) => `/trips/${tripId}/payments/out-of-period`,
  stats: (tripId: string) => `/trips/${tripId}/stats`,
  settlement: (tripId: string) => `/trips/${tripId}/settlement`,
  settlementMember: (tripId: string, membershipId: string) => `/trips/${tripId}/settlement/${membershipId}`,
  /** 멤버별 결제 내역(HF-26) 위 결제 상세 시트(하단 탭은 정산 그대로) */
  settlementPayment: (tripId: string, membershipId: string, expenseId: string) =>
    `/trips/${tripId}/settlement/${membershipId}/payments/${expenseId}`,
  tripInfo: (tripId: string) => `/trips/${tripId}/info`,
  fx: (tripId: string) => `/trips/${tripId}/fx`,

  terms: () => '/terms',
  privacy: () => '/privacy',
  /** 개인정보 처리위탁 고지(처리방침 제5조④) */
  privacyProcessors: () => '/privacy/processors',
  finLinkTerms: () => '/terms/fin-link',
  consent: (consentId: string) => `/consents/${consentId}`,
  /** 오픈소스 및 라이선스 고지(약관 제27조②). 예전 주소 /licenses는 /oss로 보낸다 */
  licenses: () => '/oss',
} as const

/**
 * 로그인·가입 뒤 돌아올 수 있는 같은 origin 상대 경로만 받는다(서버 safeReturnTo와 같은 규칙).
 * `//evil.com`·백슬래시·제어문자·`/api` 경로는 막는다
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  // oxlint-disable-next-line no-control-regex -- 제어문자를 막는 검사
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null
  if (value === '/api' || value.startsWith('/api/') || value.startsWith('/api?')) return null
  return value
}
