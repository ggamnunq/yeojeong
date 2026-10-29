import {
  CARD_IMPORT_MAX_LOOKBACK_DAYS,
  CARD_IMPORT_MAX_RANGE_DAYS,
  MANUAL_DEFAULT_MERCHANT_NAME,
  WALLET_ENTRY_FIELD_VALUES,
  isValidCardNumber,
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
import { delay, HttpResponse, type HttpHandler } from 'msw'
import { db } from '../../mocks/data'
import { api, denyUnlessAuthenticated, mockError, noContent, type NoContent } from '../../mocks/utils'
import { clock } from '../payments/clock'

// 카드 승인내역 불러오기(S8 · W7) 목. 시나리오는 아이디로 고른다(비밀번호는 암호문만 오고 목은 보지 않는다):
//   아이디 "twoway"  → TWO_WAY_REQUIRED(문자 인증) → 인증번호 "123456"이면 OK, 그 밖은 400 CARD_TWO_WAY_INVALID
//   아이디 "wrong"   → 400 CARD_LOGIN_FAILED { failedAttempts: 1·2 } → 3회째 429 CARD_IMPORT_LOGIN_COOLDOWN { retryAfter }
//   아이디 "busy"    → 409 CARD_IMPORT_IN_PROGRESS
//   아이디 "budget"  → 503 CARD_IMPORT_DAILY_LIMIT
//   아이디 "limit"   → 429 CARD_IMPORT_RATE_LIMITED { retryAfter: 30분 뒤 }
//   아이디 "locked"  → 409 CARD_ACCOUNT_ACTION_REQUIRED
//   아이디 "down"    → 503 CARD_COMPANY_UNAVAILABLE
//   아이디 "empty"   → OK, 결과 0건
//   아이디 "slow"    → 3초 뒤 OK(WF-55 불러오는 중 · 취소 확인용)
//   현대·하나(S8c): 카드번호(loginCardNo)·카드 비밀번호 암호문이 없거나 다른 카드사에 보내면 400 VALIDATION_FAILED(loginCardNo),
//     카드번호 형식(숫자 14~19자리·Luhn)이 틀리면 400 VALIDATION_FAILED(loginCardNo · cardNumber). 목은 카드번호를 어디에도 남기지 않는다.
//     현대·하나의 로그인 실패(아이디 "wrong" · "badcard" · "badpin")는 잠김 위험 카운터로 센다(서버 CARD_IMPORT_LOCK_RISK_LIMIT와 같다):
//       1회 → 400(CARD_LOGIN_FAILED · CARD_NUMBER_INVALID · CARD_PASSWORD_INVALID { failedAttempts: 1 }),
//       그 뒤 새 조회는 acknowledgeLockRisk: true가 없으면 409 CARD_LOCK_RISK_CONFIRM_REQUIRED, 확인하고 또 틀리면 429 CARD_IMPORT_LOGIN_COOLDOWN.
//       성공하면 0으로(목에는 24시간 경과·쿨다운 해제 시각이 없다 — resetCardImportMock으로 되돌린다)
//   그 밖            → OK(Figma HF-56 샘플: 전액 취소 2행·비슷한 기록·추가됨·부분 취소·기간 밖·원 승인 없는 취소)
//   하루 10회를 넘기면 429 CARD_IMPORT_RATE_LIMITED. 저장은 itemToken이 결과 그대로일 때만(아니면 410 CARD_IMPORT_RESULT_EXPIRED)
// 동의: 처음에는 CARD_IMPORT 동의가 없다(config.consent.valid = false). POST /api/consents stage CARD_IMPORT로 동의한다.
// 상태는 db.cardImportState(테스트마다 resetMockDb로 처음으로). 저장한 항목은 지갑 목(db.walletEntries)에 들어가 HF-49에 보인다.
// 날짜는 목 시계(clock — 11.13 18:34) 기준이고, 한도 시각(retryAfter)·인증 만료(expiresAt)는 기기 시각 기준이다.

/** 목 전용 RSA 2048 공개키(개인키는 만들 때 버렸다 — 아무도 풀 수 없다). 화면 개발에서 암호화 경로를 그대로 돈다 */
export const MOCK_CARD_IMPORT_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuFPgSgkAEsbOoTX2kotcegNR/fM1MWrvLyPrwenmTnwNbNCAgComam+T1RE7mWXu6ghBMHTyw++46jTvJZrXkkXWIoKxHCyAlm4Q4dM4/4fiJ0QgSKJDtSlgA22CVy8IR8mBo4akYE01qGksUbOrXJ/7NhlOZziZjzTsd5qMzPw9k0cJmX1XOey12+4b6iqOUTMqRAp8jkr4/azrqeLCGh9PWOfb3ixxth4fTM+REKowR1PGVZ1gHV7uVvLQeA6aRTEaDzGSiwb/xiDMx9DnRxuytje2n7yP4fJgY2KqxzEVJg13QeAmXH5yi7jgWDUaARA5+MXAeA6pQVcmqwtpOQIDAQAB'
export const MOCK_TWO_WAY_CODE = '123456'

// 서버와 같다(9곳, 화면 순서). 현대·하나는 카드번호 전체 + 카드 비밀번호(현대 4자리·하나 앞 2자리)가 더 필요하다(S8c)
const ORGANIZATIONS: CardImportOrganization[] = [
  { code: '0301', name: 'KB국민카드', maxRangeDays: 92, maxLookbackDays: 365, requiresCardNo: false, cardPasswordDigits: null },
  { code: '0302', name: '현대카드', maxRangeDays: 90, maxLookbackDays: 90, requiresCardNo: true, cardPasswordDigits: 4 },
  { code: '0303', name: '삼성카드', maxRangeDays: 92, maxLookbackDays: 365, requiresCardNo: false, cardPasswordDigits: null },
  { code: '0304', name: 'NH농협카드', maxRangeDays: 92, maxLookbackDays: 365, requiresCardNo: false, cardPasswordDigits: null },
  { code: '0305', name: 'BC카드', maxRangeDays: 60, maxLookbackDays: 270, requiresCardNo: false, cardPasswordDigits: null },
  { code: '0306', name: '신한카드', maxRangeDays: 90, maxLookbackDays: 180, requiresCardNo: false, cardPasswordDigits: null },
  { code: '0309', name: '우리카드', maxRangeDays: 92, maxLookbackDays: 365, requiresCardNo: false, cardPasswordDigits: null },
  { code: '0311', name: '롯데카드', maxRangeDays: 92, maxLookbackDays: 180, requiresCardNo: false, cardPasswordDigits: null },
  { code: '0313', name: '하나카드', maxRangeDays: 90, maxLookbackDays: 365, requiresCardNo: true, cardPasswordDigits: 2 },
]

/** 테스트에서 처음 상태로(resetMockDb도 같은 값으로 되돌린다) */
export function resetCardImportMock(options: { consented?: boolean } = {}) {
  db.cardImportState = {
    consentAgreedAt: options.consented ? new Date().toISOString() : null,
    consentVersion: options.consented ? CONSENT_VERSION : null,
    requiredVersion: CONSENT_VERSION,
    startedToday: 0,
    loginFailures: 0,
    lockRiskFailures: 0,
    importedKeys: [],
    twoWayTokens: [],
    remaining: null,
  }
}

const state = () => db.cardImportState
const CONSENT_VERSION = '0.1-draft'
const major = (version: string) => version.split('.')[0]

/** 유효한 CARD_IMPORT 동의: 철회 안 됐고, 동의한 버전의 MAJOR가 지금 문서와 같다(MAJOR가 오르면 재동의) */
const consentValid = () => {
  const { consentAgreedAt, consentVersion, requiredVersion } = state()
  return consentAgreedAt !== null && consentVersion !== null && major(consentVersion) === major(requiredVersion)
}

const DAY_MS = 86_400_000
const retryAfter = (seconds: number) => ({
  retryAfter: new Date(Date.now() + seconds * 1000).toISOString(),
  retryAfterSec: seconds,
})
const kstDay = (offset = 0) => new Date(clock.now() + 9 * 3_600_000 + offset * DAY_MS).toISOString().slice(0, 10)
const at = (day: string, time: string) => `${day}T${time}+09:00`
const hex64 = (seed: string) => {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0').repeat(8)
}

function consentStatus(): ConsentStatusResponse {
  return consentValid()
    ? { valid: true, missing: [], required: [] }
    : { valid: false, missing: ['CARD_IMPORT'], required: [{ id: 'CARD_IMPORT', version: state().requiredVersion }] }
}

/** 진행 중 여정(내가 활성 멤버) 중 오늘이 기간 안인 것. 기본 기간 · 자동 연결 여정 */
function ongoingTrip(today: string) {
  return db.trips.find(
    (t) =>
      t.startDate <= today &&
      today <= t.endDate &&
      db.memberships.some((m) => m.tripId === t.tripId && m.userId === db.meUserId && m.leftAt === null),
  )
}

/** 승인 일시가 든 여정(자동 연결 규칙 흉내 — 날짜만 본다) */
function tripOf(approvedAt: string) {
  const day = approvedAt.slice(0, 10)
  return db.trips.find(
    (t) =>
      t.startDate <= day &&
      day <= t.endDate &&
      db.memberships.some((m) => m.tripId === t.tripId && m.userId === db.meUserId && m.leftAt === null),
  )
}

function item(
  org: CardImportOrganization,
  partial: Partial<CardApprovalItem> & Pick<CardApprovalItem, 'approvedAt' | 'amount' | 'merchantName'>,
): CardApprovalItem {
  const importKey = hex64(`${org.code}|${partial.approvedAt}|${partial.amount}|${partial.merchantName}`)
  const alreadyImported = partial.alreadyImported === true || state().importedKeys.includes(importKey)
  const base: CardApprovalItem = {
    importKey,
    currency: 'KRW',
    krwAmount: Number(partial.amount),
    overseas: false,
    organization: org.code,
    organizationName: org.name,
    cancelState: 'NONE',
    partialCancelAmount: null,
    alreadyImported,
    similarManualEntryId: null,
    selectable: true,
    defaultSelected: true,
    blockReason: null,
    status: 'NEW',
    inTripId: tripOf(partial.approvedAt)?.tripId ?? null,
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

/** Figma HF-56 · 56s 샘플(신한카드, 오사카 3박 4일). to = 조회 종료일, 그 전날·전전날까지 */
function sampleItems(org: CardImportOrganization, to: string): CardApprovalItem[] {
  const day = (offset: number) => new Date(Date.parse(`${to}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10)
  const [d0, d1, d2] = [day(0), day(-1), day(-2)]
  const jpy = { currency: 'JPY', overseas: true } as const
  return [
    item(org, { approvedAt: at(d0, '19:05:00'), amount: '-6400', krwAmount: -58830, ...jpy, merchantName: '유니클로 난바점', cancelState: 'CANCELLED' }),
    item(org, { approvedAt: at(d0, '18:40:00'), amount: '6400', krwAmount: 58830, ...jpy, merchantName: '유니클로 난바점', cancelState: 'CANCELLED' }),
    item(org, { approvedAt: at(d0, '18:22:00'), amount: '2800', krwAmount: null, estimatedKrwAmount: 25740, ...jpy, merchantName: '551 호라이 난바본점', similarManualEntryId: 'we-551' }),
    item(org, { approvedAt: at(d0, '15:40:00'), amount: '12000', krwAmount: 110300, ...jpy, merchantName: '다카시마야 난바점' }),
    item(org, { approvedAt: at(d0, '14:10:00'), amount: '2860', krwAmount: 26290, ...jpy, merchantName: 'MK택시', alreadyImported: true }),
    item(org, { approvedAt: at(d0, '12:30:00'), amount: '134880', overseas: true, merchantName: '빅카메라 난바점', cancelState: 'PARTIAL', partialCancelAmount: '3000' }),
    item(org, { approvedAt: at(d1, '20:30:00'), amount: '980', krwAmount: 9010, ...jpy, merchantName: '도톤보리 리버크루즈' }),
    item(org, { approvedAt: at(d1, '13:05:00'), amount: '3960', krwAmount: 36400, ...jpy, merchantName: '이치란 라멘 도톤보리점' }),
    item(org, { approvedAt: at(d1, '08:10:00'), amount: '83000', merchantName: '신라면세점 인천공항' }),
    item(org, { approvedAt: at(d2, '21:10:00'), amount: '12000', merchantName: '다이소 강남역점' }),
    item(org, { approvedAt: at(d2, '08:00:00'), amount: '-5000', krwAmount: -5000, merchantName: '카페', cancelState: 'ORPHAN_CANCEL' }),
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
    const today = kstDay(0)
    const trip = ongoingTrip(today)
    return HttpResponse.json({
      enabled: true,
      publicKey: MOCK_CARD_IMPORT_PUBLIC_KEY,
      publicKeyFingerprint: 'mock-fingerprint',
      organizations: ORGANIZATIONS,
      maxRangeDays: CARD_IMPORT_MAX_RANGE_DAYS,
      maxLookbackDays: CARD_IMPORT_MAX_LOOKBACK_DAYS,
      defaultRange: trip
        ? { from: trip.startDate, to: today, basis: 'ONGOING_TRIP', tripId: trip.tripId }
        : { from: kstDay(-6), to: today, basis: 'RECENT_DAYS', tripId: null },
      consent: consentStatus(),
      twoWayTimeoutSeconds: 160,
      remainingToday: state().remaining ?? Math.max(0, 10 - state().startedToday),
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
    const cardFields = Boolean(body.loginCardNo || body.encryptedCardPassword)
    if (org.requiresCardNo ? !body.loginCardNo || !body.encryptedCardPassword : cardFields) {
      return mockError('VALIDATION_FAILED', 400, {
        fields: [
          {
            path: 'loginCardNo',
            code: org.requiresCardNo ? 'required' : 'notAllowed',
            message: org.requiresCardNo ? `${org.name}는 카드번호와 카드 비밀번호가 필요해요` : '이 카드사는 카드번호를 받지 않아요',
          },
        ],
      })
    }
    if (org.requiresCardNo && !isValidCardNumber(body.loginCardNo ?? '')) {
      return mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'loginCardNo', code: 'cardNumber', message: '카드번호를 다시 확인해 주세요' }] })
    }
    if (!body.twoWay) {
      if (state().startedToday >= 10) return mockError('CARD_IMPORT_RATE_LIMITED', 429, retryAfter(3600))
      state().startedToday += 1
    }
    if (body.loginId === 'slow') await delay(3000)
    if (body.loginId === 'busy') return mockError('CARD_IMPORT_IN_PROGRESS')
    if (body.loginId === 'budget') return mockError('CARD_IMPORT_DAILY_LIMIT')
    if (body.loginId === 'limit') return mockError('CARD_IMPORT_RATE_LIMITED', 429, retryAfter(1800))
    if (org.requiresCardNo) {
      const lockRisk = state().lockRiskFailures ?? 0
      if (lockRisk >= 2) return mockError('CARD_IMPORT_LOGIN_COOLDOWN', 429, retryAfter(1800))
      if (lockRisk >= 1 && body.acknowledgeLockRisk !== true) {
        return mockError('CARD_LOCK_RISK_CONFIRM_REQUIRED', 409, { failedAttempts: lockRisk })
      }
      const failed = { wrong: 'CARD_LOGIN_FAILED', badcard: 'CARD_NUMBER_INVALID', badpin: 'CARD_PASSWORD_INVALID' } as const
      const code = failed[body.loginId as keyof typeof failed]
      if (code) {
        state().lockRiskFailures = lockRisk + 1
        if (lockRisk + 1 >= 2) return mockError('CARD_IMPORT_LOGIN_COOLDOWN', 429, retryAfter(1800))
        return mockError(code, 400, { failedAttempts: lockRisk + 1 })
      }
      // 성공(결과를 받는 경우)만 0으로 — 카드사 쪽 문제(locked · down)는 그대로 둔다
      if (body.loginId !== 'locked' && body.loginId !== 'down') state().lockRiskFailures = 0
    }
    if (body.loginId === 'wrong') {
      state().loginFailures += 1
      if (state().loginFailures >= 3) return mockError('CARD_IMPORT_LOGIN_COOLDOWN', 429, retryAfter(1800))
      return mockError('CARD_LOGIN_FAILED', 400, { failedAttempts: state().loginFailures })
    }
    if (body.loginId === 'locked') return mockError('CARD_ACCOUNT_ACTION_REQUIRED')
    if (body.loginId === 'down') return mockError('CARD_COMPANY_UNAVAILABLE')
    if (body.loginId === 'twoway') {
      if (!body.twoWay) {
        const token = `tw1.mock-${crypto.randomUUID()}`
        state().twoWayTokens.push(token)
        return HttpResponse.json({
          status: 'TWO_WAY_REQUIRED',
          twoWayToken: token,
          method: 'SMS',
          expiresAt: new Date(Date.now() + 160_000).toISOString(),
        })
      }
      if (!state().twoWayTokens.includes(body.twoWay.token)) return mockError('CARD_TWO_WAY_EXPIRED')
      if (body.twoWay.code !== MOCK_TWO_WAY_CODE) return mockError('CARD_TWO_WAY_INVALID')
      state().twoWayTokens = state().twoWayTokens.filter((t) => t !== body.twoWay?.token)
    }
    return HttpResponse.json({
      status: 'OK',
      organization: org.code,
      from: body.from,
      to: body.to,
      items: body.loginId === 'empty' ? [] : sampleItems(org, body.to),
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
      const entry = importedEntry(i, index)
      if (state().importedKeys.includes(i.importKey)) return { importKey: i.importKey, created: false, entry }
      state().importedKeys.push(i.importKey)
      // 지갑 목에도 넣는다(HF-49c — 새 행이 날짜 그룹에 들어간다). 여정 연결은 목에서 생략
      db.walletEntries.push({
        id: entry.id,
        userId: db.meUserId,
        occurredAt: i.occurredAt,
        memo: entry.memo,
        amount: i.amount,
        currency: i.currency,
        spotKrwAmount: entry.krwAmount,
        expenseId: null,
        version: 1,
      })
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
    const agreement = body.agreements?.find((a) => a.consentId === 'CARD_IMPORT' && a.agreed && a.version)
    if (!agreement) return mockError('TERMS_REQUIRED', 400, undefined, '필수 항목에 동의해 주세요')
    state().consentAgreedAt = new Date().toISOString()
    state().consentVersion = agreement.version
    return HttpResponse.json({ valid: true, missing: [], required: [] }, { status: 201 })
  }),

  api.get<RevocableConsent[]>('/api/consents/revocable', () => {
    const denied = denyUnlessAuthenticated()
    if (denied) return denied
    return HttpResponse.json(
      consentValid()
        ? [
            {
              consentId: 'CARD_IMPORT' as const,
              title: '카드 승인내역 불러오기',
              version: state().consentVersion!,
              agreedAt: state().consentAgreedAt!,
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
    state().consentAgreedAt = null
    state().consentVersion = null
    return noContent()
  }),
]
