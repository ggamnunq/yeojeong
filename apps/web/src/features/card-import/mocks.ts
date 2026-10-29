import {
  CARD_IMPORT_MAX_LOOKBACK_DAYS,
  CARD_IMPORT_MAX_RANGE_DAYS,
  MANUAL_DEFAULT_MERCHANT_NAME,
  WALLET_ENTRY_FIELD_VALUES,
  type CardApprovalItem,
  type CardImportConfig,
  type CardImportOrganization,
  type ConsentStatusResponse,
  type ConsentSubmitRequest,
  type FetchCardApprovalsRequest,
  type FetchCardApprovalsResponse,
  type ImportWalletEntriesRequest,
  type ImportWalletEntriesResponse,
  type RevocableConsent,
  type WalletEntry,
} from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import { api, denyUnlessAuthenticated, mockError, noContent, type NoContent } from '../../mocks/utils'

// 카드 승인내역 불러오기(S8) 목. 시나리오는 아이디로 고른다(비밀번호는 암호문만 오고 목은 보지 않는다):
//   아이디 "twoway"  → TWO_WAY_REQUIRED(문자 인증) → 인증번호 "123456"이면 OK, 그 밖은 400 CARD_TWO_WAY_INVALID
//   아이디 "wrong"   → 400 CARD_LOGIN_FAILED { failedAttempts: 1·2 } → 3회째 429 CARD_IMPORT_LOGIN_COOLDOWN { retryAfter }
//   아이디 "busy"    → 409 CARD_IMPORT_IN_PROGRESS
//   아이디 "budget"  → 503 CARD_IMPORT_DAILY_LIMIT
//   아이디 "locked"  → 409 CARD_ACCOUNT_ACTION_REQUIRED
//   아이디 "down"    → 503 CARD_COMPANY_UNAVAILABLE
//   그 밖            → OK(승인·전액 취소 2행·부분 취소·원 승인 없는 취소·외화·비슷한 기록 예시)
//   하루 10회를 넘기면 429 CARD_IMPORT_RATE_LIMITED. 저장은 itemToken이 결과 그대로일 때만(아니면 410 CARD_IMPORT_RESULT_EXPIRED)
// 동의: 처음에는 CARD_IMPORT 동의가 없다(config.consent.valid = false). POST /api/consents stage CARD_IMPORT로 동의한다.
// 이 파일은 지갑 목(features/manual)의 데이터에 쓰지 않는다 — 저장 결과는 이 목 안에서만 기억한다(지갑 목록 연동은 화면 작업 때).

/** 목 전용 RSA 2048 공개키(개인키는 만들 때 버렸다 — 아무도 풀 수 없다). 화면 개발에서 암호화 경로를 그대로 돈다 */
export const MOCK_CARD_IMPORT_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuFPgSgkAEsbOoTX2kotcegNR/fM1MWrvLyPrwenmTnwNbNCAgComam+T1RE7mWXu6ghBMHTyw++46jTvJZrXkkXWIoKxHCyAlm4Q4dM4/4fiJ0QgSKJDtSlgA22CVy8IR8mBo4akYE01qGksUbOrXJ/7NhlOZziZjzTsd5qMzPw9k0cJmX1XOey12+4b6iqOUTMqRAp8jkr4/azrqeLCGh9PWOfb3ixxth4fTM+REKowR1PGVZ1gHV7uVvLQeA6aRTEaDzGSiwb/xiDMx9DnRxuytje2n7yP4fJgY2KqxzEVJg13QeAmXH5yi7jgWDUaARA5+MXAeA6pQVcmqwtpOQIDAQAB'
export const MOCK_TWO_WAY_CODE = '123456'
/** 목 결과의 자동 연결 여정 표시용 ID(목 여정 데이터와 연결하지 않는다) */
export const MOCK_TRIP_ID = 'mock-card-import-trip'

const ORGANIZATIONS: CardImportOrganization[] = [
  { code: '0301', name: 'KB국민카드', maxRangeDays: 92, maxLookbackDays: 365, requiresCardNo: false },
  { code: '0302', name: '현대카드', maxRangeDays: 90, maxLookbackDays: 90, requiresCardNo: true },
  { code: '0303', name: '삼성카드', maxRangeDays: 92, maxLookbackDays: 365, requiresCardNo: false },
  { code: '0304', name: 'NH농협카드', maxRangeDays: 92, maxLookbackDays: 365, requiresCardNo: false },
  { code: '0305', name: 'BC카드', maxRangeDays: 60, maxLookbackDays: 270, requiresCardNo: false },
  { code: '0306', name: '신한카드', maxRangeDays: 90, maxLookbackDays: 180, requiresCardNo: false },
  { code: '0309', name: '우리카드', maxRangeDays: 92, maxLookbackDays: 365, requiresCardNo: false },
  { code: '0311', name: '롯데카드', maxRangeDays: 92, maxLookbackDays: 180, requiresCardNo: false },
  { code: '0313', name: '하나카드', maxRangeDays: 90, maxLookbackDays: 365, requiresCardNo: true },
]

interface CardImportMockState {
  consentAgreedAt: string | null
  /** 오늘 시작한 조회 수(remainingToday) */
  startedToday: number
  /** 연속 로그인 실패 수(아이디 "wrong") */
  loginFailures: number
  /** 저장한 importKey → 지갑 항목 */
  imported: Map<string, WalletEntry>
  twoWayTokens: Set<string>
}

const state: CardImportMockState = {
  consentAgreedAt: null,
  startedToday: 0,
  loginFailures: 0,
  imported: new Map(),
  twoWayTokens: new Set(),
}

/** 테스트에서 처음 상태로 */
export function resetCardImportMock(options: { consented?: boolean } = {}) {
  state.consentAgreedAt = options.consented ? new Date().toISOString() : null
  state.startedToday = 0
  state.loginFailures = 0
  state.imported.clear()
  state.twoWayTokens.clear()
}

const DAY_MS = 86_400_000
const retryAfter = (seconds: number) => ({
  retryAfter: new Date(Date.now() + seconds * 1000).toISOString(),
  retryAfterSec: seconds,
})
const kstDay = (offset = 0) => new Date(Date.now() + 9 * 3_600_000 + offset * DAY_MS).toISOString().slice(0, 10)
const at = (day: string, time: string) => `${day}T${time}+09:00`
const hex64 = (seed: string) => {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0').repeat(8)
}

function consentStatus(): ConsentStatusResponse {
  return state.consentAgreedAt
    ? { valid: true, missing: [], required: [] }
    : { valid: false, missing: ['CARD_IMPORT'], required: [{ id: 'CARD_IMPORT', version: '0.1-draft' }] }
}

function item(
  org: CardImportOrganization,
  partial: Partial<CardApprovalItem> & Pick<CardApprovalItem, 'approvedAt' | 'amount' | 'merchantName'>,
): CardApprovalItem {
  const importKey = hex64(`${org.code}|${partial.approvedAt}|${partial.amount}|${partial.merchantName}`)
  const alreadyImported = state.imported.has(importKey)
  const base: CardApprovalItem = {
    importKey,
    currency: 'KRW',
    krwAmount: Number(partial.amount),
    estimatedKrwAmount: null,
    overseas: false,
    organization: org.code,
    organizationName: org.name,
    cardLast4: '1934',
    cardName: `${org.name.replace('카드', '')} 체크카드`,
    cancelState: 'NONE',
    partialCancelAmount: null,
    alreadyImported,
    similarManualEntryId: null,
    selectable: true,
    defaultSelected: true,
    blockReason: null,
    status: 'NEW',
    inTripId: null,
    itemToken: null,
    ...partial,
  }
  if (alreadyImported) {
    return { ...base, status: 'ALREADY_IMPORTED', alreadyImported: true, selectable: false, defaultSelected: false, blockReason: 'ALREADY_IMPORTED' }
  }
  if (base.cancelState === 'CANCELLED' || base.cancelState === 'ORPHAN_CANCEL') {
    return { ...base, status: 'CANCELLED', selectable: false, defaultSelected: false, blockReason: base.cancelState }
  }
  const status = base.similarManualEntryId ? 'SIMILAR' : base.cancelState === 'PARTIAL' ? 'PARTIAL_CANCEL' : 'NEW'
  return {
    ...base,
    status,
    // 목 서명: 서버와 달리 검증 가능한 값(importKey 기반)만 흉내 낸다
    itemToken: `mock.${importKey}`,
    defaultSelected: base.similarManualEntryId === null && base.inTripId !== null,
  }
}

function sampleItems(org: CardImportOrganization, to: string): CardApprovalItem[] {
  const d0 = to
  const d1 = new Date(Date.parse(`${to}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10)
  return [
    item(org, { approvedAt: at(d0, '14:10:00'), amount: '2860', currency: 'JPY', krwAmount: 26290, overseas: true, merchantName: '이치란 라멘 도톤보리점', inTripId: MOCK_TRIP_ID }),
    item(org, { approvedAt: at(d0, '12:30:00'), amount: '18', currency: 'USD', krwAmount: null, estimatedKrwAmount: 24850, overseas: true, merchantName: 'STARBUCKS' }),
    item(org, { approvedAt: at(d0, '09:10:00'), amount: '-4500', krwAmount: -4500, merchantName: '편의점', cancelState: 'CANCELLED' }),
    item(org, { approvedAt: at(d0, '09:05:00'), amount: '4500', merchantName: '편의점', cancelState: 'CANCELLED' }),
    item(org, { approvedAt: at(d1, '19:40:00'), amount: '18000', merchantName: '면세점', cancelState: 'PARTIAL', partialCancelAmount: '12000' }),
    item(org, { approvedAt: at(d1, '13:00:00'), amount: '12000', merchantName: '김밥천국', similarManualEntryId: 'we-similar-1' }),
    item(org, { approvedAt: at(d1, '08:00:00'), amount: '-5000', krwAmount: -5000, merchantName: '카페', cancelState: 'ORPHAN_CANCEL' }),
  ]
}

function importedEntry(i: ImportWalletEntriesRequest['items'][number], index: number): WalletEntry {
  return {
    id: `we-import-${Date.now()}-${index}`,
    source: 'CARD_IMPORT',
    kind: 'APPROVAL',
    occurredAt: i.occurredAt,
    localDate: i.occurredAt.slice(0, 10),
    merchantName: i.merchantName || MANUAL_DEFAULT_MERCHANT_NAME,
    memo: i.merchantName || null,
    amount: i.amount,
    currency: i.currency,
    krwAmount: i.krwAmount ?? (i.currency === 'KRW' ? Number(i.amount) : null),
    paymentMethodLabel: null,
    linkedTrip: null,
    editableFields: [...WALLET_ENTRY_FIELD_VALUES],
    canChangeTrip: true,
    canDelete: true,
    version: 0,
  }
}

export const handlers: HttpHandler[] = [
  api.get<CardImportConfig>('/api/card-import/config', () => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    return HttpResponse.json({
      enabled: true,
      publicKey: MOCK_CARD_IMPORT_PUBLIC_KEY,
      publicKeyFingerprint: 'mock-fingerprint',
      organizations: ORGANIZATIONS,
      maxRangeDays: CARD_IMPORT_MAX_RANGE_DAYS,
      maxLookbackDays: CARD_IMPORT_MAX_LOOKBACK_DAYS,
      defaultRange: { from: kstDay(-6), to: kstDay(0), basis: 'RECENT_DAYS', tripId: null },
      consent: consentStatus(),
      twoWayTimeoutSeconds: 160,
      remainingToday: Math.max(0, 10 - state.startedToday),
    })
  }),

  api.post<FetchCardApprovalsResponse, FetchCardApprovalsRequest>('/api/card-import/fetch', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const status = consentStatus()
    if (!status.valid) return mockError('CONSENT_REQUIRED', 403, { missing: status.missing, required: status.required })
    const body = await request.json()
    const org = ORGANIZATIONS.find((o) => o.code === body.organization)
    if (!org || !body.encryptedPassword || !body.loginId) {
      return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'organization', message: '불러올 수 없는 카드사예요' }] })
    }
    if (!body.twoWay) {
      if (state.startedToday >= 10) return mockError('CARD_IMPORT_RATE_LIMITED', 429, retryAfter(3600))
      state.startedToday += 1
    }
    if (body.loginId === 'busy') return mockError('CARD_IMPORT_IN_PROGRESS')
    if (body.loginId === 'budget') return mockError('CARD_IMPORT_DAILY_LIMIT')
    if (body.loginId === 'wrong') {
      state.loginFailures += 1
      if (state.loginFailures >= 3) return mockError('CARD_IMPORT_LOGIN_COOLDOWN', 429, retryAfter(1800))
      return mockError('CARD_LOGIN_FAILED', 400, { failedAttempts: state.loginFailures })
    }
    if (body.loginId === 'locked') return mockError('CARD_ACCOUNT_ACTION_REQUIRED')
    if (body.loginId === 'down') return mockError('CARD_COMPANY_UNAVAILABLE')
    if (body.loginId === 'twoway') {
      if (!body.twoWay) {
        const token = `tw1.mock-${crypto.randomUUID()}`
        state.twoWayTokens.add(token)
        return HttpResponse.json({
          status: 'TWO_WAY_REQUIRED',
          twoWayToken: token,
          method: 'SMS',
          expiresAt: new Date(Date.now() + 160_000).toISOString(),
        })
      }
      if (!state.twoWayTokens.has(body.twoWay.token)) return mockError('CARD_TWO_WAY_EXPIRED')
      if (body.twoWay.code !== MOCK_TWO_WAY_CODE) return mockError('CARD_TWO_WAY_INVALID')
      state.twoWayTokens.delete(body.twoWay.token)
    }
    return HttpResponse.json({
      status: 'OK',
      organization: org.code,
      from: body.from,
      to: body.to,
      items: sampleItems(org, body.to),
    })
  }),

  api.post<ImportWalletEntriesResponse, ImportWalletEntriesRequest>('/api/wallet/entries/import', async ({ request }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const { items } = await request.json()
    if (!Array.isArray(items) || items.length === 0) {
      return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'items', message: '저장할 결제를 골라 주세요' }] })
    }
    const forged = items.flatMap((i, index) => (i.itemToken === `mock.${i.importKey}` ? [] : [index]))
    if (forged.length > 0) return mockError('CARD_IMPORT_RESULT_EXPIRED', 410, { invalidIndexes: forged })
    const result = items.map((i, index) => {
      const existing = state.imported.get(i.importKey)
      if (existing) return { importKey: i.importKey, created: false, entry: existing }
      const entry = importedEntry(i, index)
      state.imported.set(i.importKey, entry)
      return { importKey: i.importKey, created: true, entry }
    })
    const created = result.filter((r) => r.created).length
    return HttpResponse.json({ items: result, created, skipped: result.length - created, linked: 0 }, { status: 201 })
  }),

  // 동의 저장은 지갑 목(features/wallet/mocks.ts)이 FIN_LINK를 맡는다. 이 핸들러가 파일 순서상 먼저 돌고
  // stage CARD_IMPORT만 받고 나머지는 아무것도 돌려주지 않아 다음 핸들러로 넘긴다.
  api.post<ConsentStatusResponse, ConsentSubmitRequest>('/api/consents', async ({ request }) => {
    const body = (await request.clone().json()) as ConsentSubmitRequest
    if (body.stage !== 'CARD_IMPORT') return undefined
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    const ok = body.agreements?.some((a) => a.consentId === 'CARD_IMPORT' && a.agreed && a.version)
    if (!ok) return mockError('TERMS_REQUIRED', 400, undefined, '필수 항목에 동의해 주세요')
    state.consentAgreedAt = new Date().toISOString()
    return HttpResponse.json({ valid: true, missing: [], required: [] }, { status: 201 })
  }),

  api.get<RevocableConsent[]>('/api/consents/revocable', () => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    return HttpResponse.json(
      state.consentAgreedAt
        ? [
            {
              consentId: 'CARD_IMPORT' as const,
              title: '카드 승인내역 불러오기',
              version: '0.1-draft',
              agreedAt: state.consentAgreedAt,
              docUrl: '/consents/CARD_IMPORT',
            },
          ]
        : [],
    )
  }),

  api.post<NoContent>('/api/consents/:consentId/withdraw', ({ params }) => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    if (params.consentId !== 'CARD_IMPORT') return mockError('NOT_FOUND', 404)
    state.consentAgreedAt = null
    return noContent()
  }),
]
