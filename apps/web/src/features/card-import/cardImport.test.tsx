import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider, isApiError } from '../../api'
import { server } from '../../mocks/server'
import { createTestQueryClient } from '../../test/render'
import { cardImportConfigQuery, fetchCardApprovals, importWalletEntries, revocableConsentsQuery, submitCardImportConsent, withdrawConsent } from './api'
import { CardImportKeyPinError, encryptCardPassword, pinPolicy, publicKeyFingerprint } from './crypto'
import { CardLoginInputError } from './cardLogin'
import { buildFetchRequest, cardImportOf, useFetchCardApprovals } from './hooks'
import { MOCK_CARD_IMPORT_PUBLIC_KEY, MOCK_TWO_WAY_CODE, resetCardImportMock } from './mocks'

const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
const body = (loginId: string) => ({
  organization: '0306',
  loginId,
  encryptedPassword: 'Q0lQSEVSVEVYVA==',
  from: today,
  to: today,
})
const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return isApiError(error) ? error.code : 'NOT_API_ERROR'
  }
  return null
}

describe('카드 승인내역 불러오기 데이터 계층(S8, MSW)', () => {
  beforeEach(() => resetCardImportMock())
  afterEach(() => resetCardImportMock())

  it('reads features.cardImport fail-closed', () => {
    expect(cardImportOf(undefined)).toBe(false)
    expect(cardImportOf({ status: 'ANONYMOUS' } as never)).toBe(false)
    expect(cardImportOf({ status: 'ANONYMOUS', features: { accountLink: false, cardImport: true } } as never)).toBe(true)
  })

  it('needs the CARD_IMPORT consent first, then returns approvals', async () => {
    const client = createTestQueryClient()
    const config = await client.fetchQuery(cardImportConfigQuery())
    expect(config.consent).toEqual({ valid: false, missing: ['CARD_IMPORT'], required: [{ id: 'CARD_IMPORT', version: '0.1-draft' }] })
    expect(await errorCode(fetchCardApprovals(body('me')))).toBe('CONSENT_REQUIRED')

    await submitCardImportConsent(config.consent.required[0].version)
    const ok = await fetchCardApprovals(body('me'))
    expect(ok.status).toBe('OK')
    if (ok.status !== 'OK') return
    // Figma HF-56 샘플: 전액 취소 2행 · 비슷한 기록 · 새 결제 · 추가됨 · 부분 취소 · … · 원 승인 없는 취소
    expect(ok.items.map((i) => i.status)).toEqual([
      'CANCELLED',
      'CANCELLED',
      'SIMILAR',
      'NEW',
      'ALREADY_IMPORTED',
      'PARTIAL_CANCEL',
      'NEW',
      'NEW',
      'NEW',
      'NEW',
      'CANCELLED',
    ])
    expect(ok.items.find((i) => i.similarManualEntryId)).toMatchObject({ selectable: true, defaultSelected: false })
    expect(ok.items.filter((i) => i.cancelState === 'ORPHAN_CANCEL')).toEqual([
      expect.objectContaining({ selectable: false, itemToken: null, blockReason: 'ORPHAN_CANCEL' }),
    ])
  })

  it('covers the 2-way and login failure scenarios', async () => {
    resetCardImportMock({ consented: true })
    const first = await fetchCardApprovals(body('twoway'))
    expect(first).toMatchObject({ status: 'TWO_WAY_REQUIRED', method: 'SMS' })
    if (first.status !== 'TWO_WAY_REQUIRED') return
    expect(await errorCode(fetchCardApprovals({ ...body('twoway'), twoWay: { token: first.twoWayToken, code: '000000' } }))).toBe(
      'CARD_TWO_WAY_INVALID',
    )
    const done = await fetchCardApprovals({ ...body('twoway'), twoWay: { token: first.twoWayToken, code: MOCK_TWO_WAY_CODE } })
    expect(done.status).toBe('OK')
    expect(await errorCode(fetchCardApprovals({ ...body('twoway'), twoWay: { token: first.twoWayToken, code: MOCK_TWO_WAY_CODE } }))).toBe(
      'CARD_TWO_WAY_EXPIRED',
    )
    expect(await errorCode(fetchCardApprovals(body('wrong')))).toBe('CARD_LOGIN_FAILED')
    expect(await errorCode(fetchCardApprovals(body('wrong')))).toBe('CARD_LOGIN_FAILED')
    expect(await errorCode(fetchCardApprovals(body('wrong')))).toBe('CARD_IMPORT_LOGIN_COOLDOWN')
    expect(await errorCode(fetchCardApprovals(body('busy')))).toBe('CARD_IMPORT_IN_PROGRESS')
    expect(await errorCode(fetchCardApprovals(body('budget')))).toBe('CARD_IMPORT_DAILY_LIMIT')
    expect(await errorCode(fetchCardApprovals(body('locked')))).toBe('CARD_ACCOUNT_ACTION_REQUIRED')
    expect(await errorCode(fetchCardApprovals(body('down')))).toBe('CARD_COMPANY_UNAVAILABLE')
  })

  it('imports chosen items once and marks them as already imported', async () => {
    resetCardImportMock({ consented: true })
    const ok = await fetchCardApprovals(body('me'))
    if (ok.status !== 'OK') throw new Error('expected OK')
    const pick = ok.items.find((i) => i.selectable && i.currency === 'JPY' && i.krwAmount !== null)!
    const item = {
      importKey: pick.importKey,
      itemToken: pick.itemToken ?? '',
      occurredAt: pick.approvedAt,
      amount: pick.amount,
      currency: pick.currency,
      merchantName: pick.merchantName,
      krwAmount: pick.krwAmount,
    }
    expect(await errorCode(importWalletEntries({ items: [{ ...item, amount: '1', itemToken: 'forged' }] }))).toBe(
      'CARD_IMPORT_RESULT_EXPIRED',
    )
    const saved = await importWalletEntries({ items: [item] })
    expect(saved).toMatchObject({ created: 1, skipped: 0 })
    expect(saved.items[0]).toMatchObject({ created: true, entry: { source: 'CARD_IMPORT', amount: pick.amount, currency: 'JPY', krwAmount: pick.krwAmount } })
    expect((await importWalletEntries({ items: [item] })).items[0].created).toBe(false)
    const again = await fetchCardApprovals(body('me'))
    if (again.status !== 'OK') throw new Error('expected OK')
    expect(again.items.find((i) => i.importKey === pick.importKey)).toMatchObject({
      alreadyImported: true,
      selectable: false,
      blockReason: 'ALREADY_IMPORTED',
    })
  })

  it('lists and withdraws the revocable consent (HF-58)', async () => {
    const client = createTestQueryClient()
    expect(await client.fetchQuery(revocableConsentsQuery())).toEqual([])
    await submitCardImportConsent('0.1-draft')
    expect(await client.fetchQuery({ ...revocableConsentsQuery(), staleTime: 0 })).toEqual([
      expect.objectContaining({ consentId: 'CARD_IMPORT', version: '0.1-draft' }),
    ])
    await withdrawConsent('CARD_IMPORT')
    expect(await client.fetchQuery({ ...revocableConsentsQuery(), staleTime: 0 })).toEqual([])
  })

  it('keeps loginId, ciphertext and the SMS code out of every TanStack cache (no mutation) and reuses the ciphertext (L3 · M1)', async () => {
    resetCardImportMock({ consented: true })
    const client = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider client={client}>{children}</ApiProvider>
    const { result } = renderHook(() => useFetchCardApprovals(), { wrapper })
    const password = 'plain-password-never-sent'
    const sent: string[] = []
    const listener = ({ request }: { request: Request }) => {
      if (request.url.endsWith('/api/card-import/fetch')) void request.clone().text().then((t) => sent.push(t))
    }
    server.events.on('request:start', listener)
    const input = { publicKey: MOCK_CARD_IMPORT_PUBLIC_KEY, organization: '0306', loginId: 'twoway', password, from: today, to: today }
    // 화면이 먼저 암호화하고 hook에는 암호문 요청만 넘긴다(hook은 평문을 받지 않는다)
    const request = await buildFetchRequest(input)
    expect(JSON.stringify(request)).not.toContain(password)
    const first = await act(() => result.current.start(request))
    expect(first.status).toBe('TWO_WAY_REQUIRED')
    if (first.status !== 'TWO_WAY_REQUIRED') return
    const caches = () =>
      JSON.stringify([
        client.getMutationCache().getAll().map((m) => m.state),
        client.getQueryCache().getAll().map((q) => q.state),
      ])
    expect(client.getMutationCache().getAll()).toHaveLength(0)
    for (const secret of [password, 'twoway', request.encryptedPassword]) expect(caches()).not.toContain(secret)
    // 이어가기는 같은 암호문을 다시 쓴다(다시 암호화하지 않는다)
    const done = await act(() => result.current.continueTwoWay({ token: first.twoWayToken, code: MOCK_TWO_WAY_CODE }))
    expect(done.status).toBe('OK')
    await waitFor(() => expect(sent).toHaveLength(2))
    server.events.removeListener('request:start', listener)
    const [a, b] = sent.map((t) => JSON.parse(t) as { encryptedPassword: string; password?: string })
    expect(a.encryptedPassword).toBe(b.encryptedPassword)
    expect(sent.join()).not.toContain(password)
    expect(a).not.toHaveProperty('password')
    expect(client.getMutationCache().getAll()).toHaveLength(0)
    for (const secret of [password, 'twoway', request.encryptedPassword, MOCK_TWO_WAY_CODE]) expect(caches()).not.toContain(secret)
    // 쿼리 캐시에는 조회 결과가 없다
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    act(() => result.current.reset())
  })

  it('builds Hyundai·Hana requests: digits-only card number, encrypted card password, nothing else (S8c)', async () => {
    const PAN = '5555555555554444'
    const PIN = '4321'
    const base = { publicKey: MOCK_CARD_IMPORT_PUBLIC_KEY, loginId: 'me', password: 'pw-plain', from: today, to: today }
    const hyundai = { requiresCardNo: true, cardPasswordDigits: 4 }
    const request = await buildFetchRequest({ ...base, organization: '0302', rule: hyundai, cardNumber: '5555-5555 5555-4444', cardPassword: PIN })
    expect(Object.keys(request).sort()).toEqual(
      ['encryptedCardPassword', 'encryptedPassword', 'from', 'loginCardNo', 'loginId', 'organization', 'to'].sort(),
    )
    expect(request.loginCardNo).toBe(PAN)
    // 카드 비밀번호는 RSA 2048 암호문(256바이트)만, 원문·입력 이름(rule·cardNumber·cardPassword)은 요청에 없다
    expect(atob(request.encryptedCardPassword ?? '')).toHaveLength(256)
    expect(request.encryptedCardPassword).not.toBe(request.encryptedPassword)
    expect(JSON.stringify(request)).not.toMatch(/4321|pw-plain|cardNumber|cardPassword"|rule|5555-5555/)

    // 하나는 앞 2자리
    const hana = { requiresCardNo: true, cardPasswordDigits: 2 }
    await expect(buildFetchRequest({ ...base, organization: '0313', rule: hana, cardNumber: PAN, cardPassword: '43' })).resolves.toMatchObject({
      loginCardNo: PAN,
    })
    // 형식이 틀리면 암호화·전송 전에 막는다(에러에 값이 없다)
    const bad = [
      { organization: '0313', rule: hana, cardNumber: PAN, cardPassword: PIN },
      { organization: '0302', rule: hyundai, cardNumber: '5555555555554445', cardPassword: PIN },
      { organization: '0302', rule: hyundai, cardPassword: PIN },
      { organization: '0306', rule: { requiresCardNo: false, cardPasswordDigits: null }, cardNumber: PAN },
      { organization: '0306', cardPassword: '12' },
    ]
    for (const over of bad) {
      const error = await buildFetchRequest({ ...base, ...over }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(CardLoginInputError)
      expect(String((error as Error).message)).not.toMatch(/5555|4321/)
    }
  })

  it('covers Hyundai·Hana mock scenarios and keeps the card number out of caches and the remembered request (S8c)', async () => {
    resetCardImportMock({ consented: true })
    const client = createTestQueryClient()
    const config = await client.fetchQuery(cardImportConfigQuery())
    expect(config.organizations.map((o) => o.code)).toEqual(['0301', '0302', '0303', '0304', '0305', '0306', '0309', '0311', '0313'])
    expect(config.organizations.filter((o) => o.requiresCardNo).map((o) => [o.code, o.cardPasswordDigits])).toEqual([
      ['0302', 4],
      ['0313', 2],
    ])
    const PAN = '5555555555554444'
    const card = { loginCardNo: PAN, encryptedCardPassword: 'Q0lQSEVSVEVYVA==' }
    expect(await errorCode(fetchCardApprovals({ ...body('me'), organization: '0302' }))).toBe('VALIDATION_FAILED')
    expect(await errorCode(fetchCardApprovals({ ...body('me'), ...card }))).toBe('VALIDATION_FAILED')
    expect(await errorCode(fetchCardApprovals({ ...body('me'), organization: '0313', ...card, loginCardNo: '5555555555554445' }))).toBe(
      'VALIDATION_FAILED',
    )
    const ok = await fetchCardApprovals({ ...body('me'), organization: '0313', ...card })
    expect(ok).toMatchObject({ status: 'OK', organization: '0313' })
    expect(JSON.stringify(ok)).not.toContain(PAN)
    expect(await errorCode(fetchCardApprovals({ ...body('badcard'), organization: '0302', ...card }))).toBe('CARD_NUMBER_INVALID')
    resetCardImportMock({ consented: true })
    expect(await errorCode(fetchCardApprovals({ ...body('badpin'), organization: '0302', ...card }))).toBe('CARD_PASSWORD_INVALID')
    expect(await errorCode(fetchCardApprovals({ ...body('badpin'), organization: '0302', ...card }))).toBe('CARD_IMPORT_LOGIN_COOLDOWN')

    // hook: 결과(OK)를 받으면 요청(카드번호 포함)을 기억하지 않는다 — 이어가기를 부를 수 없다
    resetCardImportMock({ consented: true })
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider client={client}>{children}</ApiProvider>
    const { result } = renderHook(() => useFetchCardApprovals(), { wrapper })
    const done = await act(() => result.current.start({ ...body('me'), organization: '0302', ...card }))
    expect(done.status).toBe('OK')
    await expect(result.current.continueTwoWay({ token: 't', code: MOCK_TWO_WAY_CODE })).rejects.toThrow('처음부터')
    expect(client.getMutationCache().getAll()).toHaveLength(0)
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state))).not.toContain(PAN)
    expect(JSON.stringify({ ...sessionStorage, ...localStorage }) + window.location.href).not.toContain(PAN)
  })

  it('pins the CODEF public key fingerprint when the build provides one (L4)', async () => {
    const fingerprint = await publicKeyFingerprint(MOCK_CARD_IMPORT_PUBLIC_KEY)
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
    const input = { publicKey: MOCK_CARD_IMPORT_PUBLIC_KEY, organization: '0306', loginId: 'me', password: 'pw', from: today, to: today }

    vi.stubEnv('VITE_CODEF_PUBKEY_SHA256', fingerprint.toUpperCase())
    expect(pinPolicy()).toBe('pinned')
    await expect(buildFetchRequest(input)).resolves.toMatchObject({ encryptedPassword: expect.any(String) })

    vi.stubEnv('VITE_CODEF_PUBKEY_SHA256', 'f'.repeat(64))
    await expect(buildFetchRequest(input)).rejects.toBeInstanceOf(CardImportKeyPinError)
    // 암호화 함수를 바로 불러도 고정 키 검사를 건너뛸 수 없다
    await expect(encryptCardPassword(MOCK_CARD_IMPORT_PUBLIC_KEY, 'pw')).rejects.toBeInstanceOf(CardImportKeyPinError)

    // 운영 빌드에 고정값이 없으면 진입·암호화를 막는다(개발·목은 허용)
    vi.stubEnv('VITE_CODEF_PUBKEY_SHA256', '')
    expect(pinPolicy()).toBe('unpinned')
    vi.stubEnv('PROD', true)
    expect(pinPolicy()).toBe('blocked')
    await expect(buildFetchRequest(input)).rejects.toBeInstanceOf(CardImportKeyPinError)
    await expect(encryptCardPassword(MOCK_CARD_IMPORT_PUBLIC_KEY, 'pw')).rejects.toBeInstanceOf(CardImportKeyPinError)
    vi.unstubAllEnvs()
  })
})
