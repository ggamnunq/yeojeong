import type { CardApprovalItem } from '@yeojeong/shared'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import { CardLoginInputError } from './cardLogin'
import { CardImportKeyPinError } from './crypto'
import {
  classifyFetchError,
  clipRange,
  countdown,
  groupResults,
  initialSelection,
  orgMark,
  rangeErrorText,
  rangeLabel,
  rangeLimits,
  resultAmounts,
  resultChip,
  resultMeta,
  selectAllState,
  toggleAll,
  classifyLockoutAckError,
  visibleOrganizations,
  CARD_NUMBER_LOGIN_SCREEN_READY,
} from './rules'

const BC = { code: '0305', name: 'BC카드', maxRangeDays: 60, maxLookbackDays: 270 }
const SHINHAN = { code: '0306', name: '신한카드', maxRangeDays: 90, maxLookbackDays: 180 }

const item = (over: Partial<CardApprovalItem>): CardApprovalItem => ({
  importKey: 'k',
  approvedAt: '2026-11-13T15:40:00+09:00',
  amount: '12000',
  currency: 'JPY',
  krwAmount: 110300,
  merchantName: '다카시마야 난바점',
  overseas: true,
  organization: '0306',
  organizationName: '신한카드',
  status: 'NEW',
  cancelState: 'NONE',
  partialCancelAmount: null,
  alreadyImported: false,
  similarManualEntryId: null,
  inTripId: 'trip-osaka',
  selectable: true,
  defaultSelected: true,
  blockReason: null,
  itemToken: 'token',
  ...over,
})

const apiError = (code: string, status: number, details?: Record<string, unknown>) =>
  new ApiError({ code: code as never, message: 'CODEF 원문: 시스템 점검 중 [CF-12345]', status, details })

describe('카드사 · 기간(WF-52 · 53)', () => {
  it('maps organization codes to neutral marks', () => {
    expect(orgMark({ code: '0301', name: 'KB국민카드' })).toBe('KB')
    expect(orgMark({ code: '0306', name: '신한카드' })).toBe('신')
    expect(orgMark({ code: '9999', name: '새카드' })).toBe('새')
  })

  it('clips the default range to the card company limits, keeping the recent side', () => {
    const today = '2026-11-13'
    // 진행 중 여정 70일 + BC카드(1회 60일) → 종료일까지 60일
    expect(clipRange({ from: '2026-09-05', to: today }, rangeLimits(BC, today))).toEqual({ from: '2026-09-15', to: today })
    // 과거 한도(신한 180일)보다 이른 시작일은 한도로
    expect(clipRange({ from: '2026-01-01', to: '2026-05-20' }, rangeLimits(SHINHAN, today))).toEqual({ from: '2026-05-17', to: '2026-05-20' })
    // 한도 안이면 그대로
    expect(clipRange({ from: '2026-11-12', to: today }, rangeLimits(SHINHAN, today))).toEqual({ from: '2026-11-12', to: today })
    // 미래 종료일은 오늘로
    expect(clipRange({ from: '2026-11-12', to: '2026-11-15' }, rangeLimits(SHINHAN, today))).toEqual({ from: '2026-11-12', to: today })
    expect(rangeLimits(BC, today)).toEqual({ min: '2026-02-16', max: today, maxDays: 60 })
  })

  it('formats the range row and the countdown', () => {
    expect(rangeLabel({ from: '2026-11-12', to: '2026-11-15' }, '2026-11-13')).toBe('11.12 – 11.15')
    expect(rangeLabel({ from: '2025-12-30', to: '2026-01-02' }, '2026-01-05')).toBe('2025.12.30 – 01.02')
    expect(countdown(160_000)).toBe('2:40')
    expect(countdown(158_200)).toBe('2:39')
    expect(countdown(-5)).toBe('0:00')
    expect(rangeErrorText('MAX_RANGE', 60)).toBe('60일까지 고를 수 있어요')
  })
})

describe('결과 목록(WF-56)', () => {
  it('shows card KRW first, original currency second; estimated KRW when the card gave none', () => {
    expect(resultAmounts(item({}))).toEqual({ amount: '₩110,300', subAmount: '¥12,000' })
    expect(resultAmounts(item({ amount: '2800', krwAmount: null, estimatedKrwAmount: 25740 }))).toEqual({ amount: '¥2,800', subAmount: '약 ₩25,740' })
    expect(resultAmounts(item({ amount: '2800', krwAmount: null }))).toEqual({ amount: '¥2,800', subAmount: undefined })
    expect(resultAmounts(item({ amount: '83000', currency: 'KRW', krwAmount: 83000 }))).toEqual({ amount: '₩83,000', subAmount: undefined })
    expect(resultAmounts(item({ amount: '134880', currency: 'KRW', krwAmount: 134880, partialCancelAmount: '3000' }))).toEqual({
      amount: '₩134,880',
      subAmount: '부분 취소 −₩3,000',
    })
    expect(resultAmounts(item({ amount: '-6400', krwAmount: -58830 }))).toEqual({ amount: '−₩58,830', subAmount: '−¥6,400' })
  })

  it('chips, meta and date groups', () => {
    expect(resultChip({ status: 'ALREADY_IMPORTED' })).toBe('추가됨')
    expect(resultChip({ status: 'CANCELLED' })).toBe('취소됨')
    expect(resultChip({ status: 'SIMILAR' })).toBe('비슷한 기록')
    expect(resultChip({ status: 'PARTIAL_CANCEL' })).toBeUndefined()
    expect(resultMeta(item({}), () => '오사카 3박 4일')).toBe('15:40 · 오사카 3박 4일')
    expect(resultMeta(item({ inTripId: null }), () => '오사카 3박 4일')).toBe('15:40')
    const groups = groupResults([
      item({ importKey: 'a', approvedAt: '2026-11-12T20:30:00+09:00' }),
      item({ importKey: 'b', approvedAt: '2026-11-13T00:10:00+09:00' }),
      item({ importKey: 'c', approvedAt: '2026-11-13T19:05:00+09:00' }),
    ])
    expect(groups.map((g) => [g.label, g.items.map((i) => i.importKey)])).toEqual([
      ['11.13 (금)', ['c', 'b']],
      ['11.12 (목)', ['a']],
    ])
  })

  it('select all counts only selectable rows (indeterminate when some)', () => {
    const items = [
      item({ importKey: 'new', defaultSelected: true }),
      item({ importKey: 'similar', status: 'SIMILAR', defaultSelected: false }),
      item({ importKey: 'added', status: 'ALREADY_IMPORTED', selectable: false, defaultSelected: false, itemToken: null }),
    ]
    const first = initialSelection(items)
    expect([...first]).toEqual(['new'])
    expect(selectAllState(items, first)).toEqual({ total: 2, count: 1, checked: false, indeterminate: true })
    const all = toggleAll(items, first)
    expect([...all].sort()).toEqual(['new', 'similar'])
    expect(selectAllState(items, all)).toMatchObject({ checked: true, indeterminate: false })
    expect([...toggleAll(items, all)]).toEqual([])
  })
})

describe('조회 실패 → 화면(L-0 표)', () => {
  const now = Date.parse('2026-11-13T06:30:00Z') // KST 15:30
  it('maps login failures and cooldown', () => {
    expect(classifyFetchError(apiError('CARD_LOGIN_FAILED', 400, { failedAttempts: 1 }), now)).toEqual({ to: 'login-failed', attempts: 1 })
    expect(classifyFetchError(apiError('CARD_LOGIN_FAILED', 400, { failedAttempts: 2 }), now)).toEqual({ to: 'login-failed', attempts: 2 })
    expect(
      classifyFetchError(apiError('CARD_IMPORT_LOGIN_COOLDOWN', 429, { retryAfter: '2026-11-13T06:42:00Z', retryAfterSec: 720 }), now),
    ).toEqual({ to: 'login-cooldown', until: '2026-11-13T06:42:00Z' })
  })

  it('maps limits: same-day retryAfter = 57r, next day = 57d', () => {
    expect(classifyFetchError(apiError('CARD_IMPORT_RATE_LIMITED', 429, { retryAfter: '2026-11-13T06:42:00Z' }), now)).toEqual({
      to: 'error',
      kind: 'rate',
      retryAfter: '2026-11-13T06:42:00Z',
    })
    // KST 다음 날 00:00 → 오늘 한도 소진
    expect(classifyFetchError(apiError('CARD_IMPORT_RATE_LIMITED', 429, { retryAfter: '2026-11-13T15:00:00Z' }), now)).toEqual({
      to: 'error',
      kind: 'daily',
    })
    expect(classifyFetchError(apiError('CARD_IMPORT_DAILY_LIMIT', 503), now)).toEqual({ to: 'error', kind: 'daily' })
  })

  it('never surfaces CODEF/card company messages — every other failure is our own screen', () => {
    for (const code of ['CARD_COMPANY_UNAVAILABLE', 'CARD_IMPORT_FAILED', 'CARD_TWO_WAY_UNSUPPORTED', 'NETWORK_ERROR', 'TIMEOUT', 'SOMETHING_NEW']) {
      expect(classifyFetchError(apiError(code, 502), now)).toEqual({ to: 'error', kind: 'unavailable' })
    }
    expect(classifyFetchError(new CardImportKeyPinError(), now)).toEqual({ to: 'error', kind: 'unavailable' })
    expect(classifyFetchError(new Error('boom'), now)).toEqual({ to: 'error', kind: 'unavailable' })
    expect(classifyFetchError(apiError('CARD_ACCOUNT_ACTION_REQUIRED', 409), now)).toEqual({ to: 'error', kind: 'action' })
    expect(classifyFetchError(apiError('CARD_LOCK_RISK_CONFIRM_REQUIRED', 409, { failedAttempts: 1 }), now)).toEqual({
      to: 'lock-risk-confirm',
      attempts: 1,
    })
    expect(
      classifyFetchError(apiError('CARD_IMPORT_LOGIN_LOCKED', 429, { failedAttempts: 2, action: 'CHECK_CARD_COMPANY_SITE' }), now),
    ).toEqual({ to: 'login-locked', attempts: 2 })
  })

  it('tells the two lockout-ack 429s apart by code', () => {
    expect(classifyLockoutAckError(apiError('CARD_LOCKOUT_ACK_TOO_EARLY', 429, { retryAfter: '2026-11-13T06:42:00Z', retryAfterSec: 720 }), now)).toEqual({
      to: 'too-early',
      retryAfter: '2026-11-13T06:42:00Z',
    })
    expect(classifyLockoutAckError(apiError('CARD_LOCKOUT_ACK_DAILY_LIMIT', 429, { retryAfter: '2026-11-13T15:00:00Z', retryAfterSec: 30600 }), now)).toEqual({
      to: 'daily-limit',
      retryAfter: '2026-11-13T15:00:00Z',
    })
    expect(classifyLockoutAckError(apiError('CARD_LOCKOUT_ACK_NOT_NEEDED', 409), now)).toEqual({ to: 'not-needed' })
    expect(classifyLockoutAckError(new Error('x'), now)).toEqual({ to: 'retry-toast' })
  })

  it('maps the rest', () => {
    expect(classifyFetchError(apiError('CARD_IMPORT_IN_PROGRESS', 409), now)).toEqual({ to: 'in-progress' })
    expect(classifyFetchError(apiError('CARD_TWO_WAY_EXPIRED', 410), now)).toEqual({ to: 'two-way-expired' })
    expect(classifyFetchError(apiError('CARD_TWO_WAY_INVALID', 400), now)).toEqual({ to: 'two-way-invalid' })
    expect(classifyFetchError(apiError('CARD_PASSWORD_ENCRYPTION_INVALID', 400), now)).toEqual({ to: 'encryption-invalid' })
    expect(classifyFetchError(apiError('CONSENT_REQUIRED', 403), now)).toEqual({ to: 'consent' })
    expect(classifyFetchError(apiError('NOT_FOUND', 404), now)).toEqual({ to: 'off' })
    expect(classifyFetchError(apiError('RATE_LIMITED', 429), now)).toEqual({ to: 'retry-toast' })
    expect(classifyFetchError(apiError('VALIDATION_FAILED', 400, { fields: [{ path: 'from', code: 'maxRange', message: '서버 문구' }] }), now)).toEqual({
      to: 'range',
      message: 'MAX_RANGE',
    })
    expect(classifyFetchError(apiError('VALIDATION_FAILED', 400, { fields: [{ path: 'to', code: 'tooOld' }] }), now)).toEqual({
      to: 'range',
      message: '이보다 이전 내역은 불러올 수 없어요',
    })
    expect(classifyFetchError(apiError('VALIDATION_FAILED', 400, { fields: [{ path: 'loginId' }] }), now)).toEqual({ to: 'retry-toast' })
  })
})

describe('현대·하나 카드번호 로그인(S8c)', () => {
  const now = Date.parse('2026-11-13T06:30:00Z')
  it('marks Hyundai and Hana and shows all 9 in the Figma order (W7e — server sends code order)', () => {
    expect(orgMark({ code: '0302', name: '현대카드' })).toBe('현')
    expect(orgMark({ code: '0313', name: '하나카드' })).toBe('하')
    expect(CARD_NUMBER_LOGIN_SCREEN_READY).toBe(true)
    // 서버 config 순서(기관 코드 순) + 모르는 코드 하나
    const orgs = ['0301', '0302', '0303', '0304', '0305', '0306', '0309', '0311', '0313', '0399'].map((code) => ({
      code,
      requiresCardNo: code === '0302' || code === '0313',
    }))
    expect(visibleOrganizations(orgs).map((o) => o.code)).toEqual(['0301', '0303', '0304', '0305', '0306', '0309', '0311', '0302', '0313', '0399'])
    // config에 없는 카드사는 그리지 않는다(정렬이 추가하지 않는다)
    expect(visibleOrganizations([{ code: '0313', requiresCardNo: true }, { code: '0306', requiresCardNo: false }]).map((o) => o.code)).toEqual([
      '0306',
      '0313',
    ])
  })

  it('maps card number and card password failures, local input errors and server format errors', () => {
    expect(classifyFetchError(apiError('CARD_NUMBER_INVALID', 400, { failedAttempts: 1 }), now)).toEqual({
      to: 'card-number-invalid',
      attempts: 1,
    })
    expect(classifyFetchError(apiError('CARD_PASSWORD_INVALID', 400, { failedAttempts: 1 }), now)).toEqual({
      to: 'card-password-invalid',
      attempts: 1,
    })
    expect(classifyFetchError(new CardLoginInputError('cardNumber'), now)).toEqual({ to: 'card-number-invalid', attempts: 0 })
    expect(classifyFetchError(new CardLoginInputError('cardPassword'), now)).toEqual({ to: 'card-password-invalid', attempts: 0 })
    expect(
      classifyFetchError(apiError('VALIDATION_FAILED', 400, { fields: [{ path: 'loginCardNo', code: 'cardNumber' }] }), now),
    ).toEqual({ to: 'card-number-invalid', attempts: 0 })
    // 암호문 길이 오류는 다시 시도
    expect(
      classifyFetchError(apiError('VALIDATION_FAILED', 400, { fields: [{ path: 'encryptedCardPassword', code: 'ciphertext' }] }), now),
    ).toEqual({ to: 'retry-toast' })
    expect(classifyFetchError(apiError('CARD_ACCOUNT_ACTION_REQUIRED', 409), now)).toEqual({ to: 'error', kind: 'action' })
  })
})
