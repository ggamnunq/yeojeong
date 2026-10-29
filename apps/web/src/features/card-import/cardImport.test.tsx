import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider, isApiError } from '../../api'
import { server } from '../../mocks/server'
import { createTestQueryClient } from '../../test/render'
import { cardImportConfigQuery, fetchCardApprovals, importWalletEntries, revocableConsentsQuery, submitCardImportConsent, withdrawConsent } from './api'
import { CardImportKeyPinError, pinPolicy, publicKeyFingerprint } from './crypto'
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
    expect(ok.items.map((i) => i.status)).toEqual(['NEW', 'NEW', 'CANCELLED', 'CANCELLED', 'PARTIAL_CANCEL', 'SIMILAR', 'CANCELLED'])
    expect(ok.items[0]).toMatchObject({ inTripId: expect.any(String), defaultSelected: true, itemToken: expect.any(String) })
    expect(ok.items[1]).toMatchObject({ inTripId: null, defaultSelected: false })
    expect(ok.items.find((i) => i.similarManualEntryId)).toMatchObject({ selectable: true, defaultSelected: false })
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
    const [pick] = ok.items
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
    expect(saved.items[0]).toMatchObject({ created: true, entry: { source: 'CARD_IMPORT', amount: '2860', currency: 'JPY', krwAmount: 26290 } })
    expect((await importWalletEntries({ items: [item] })).items[0].created).toBe(false)
    const again = await fetchCardApprovals(body('me'))
    if (again.status !== 'OK') throw new Error('expected OK')
    expect(again.items[0]).toMatchObject({ alreadyImported: true, selectable: false, blockReason: 'ALREADY_IMPORTED' })
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

  it('encrypts before mutating so the mutation cache only ever holds ciphertext (L3)', async () => {
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
    const first = await act(() => result.current.start(input))
    expect(first.status).toBe('TWO_WAY_REQUIRED')
    if (first.status !== 'TWO_WAY_REQUIRED') return
    const variables = () => JSON.stringify(client.getMutationCache().getAll().map((m) => m.state.variables))
    expect(variables()).not.toContain(password)
    expect(variables()).toContain('encryptedPassword')
    // 이어가기는 같은 암호문을 다시 쓴다(다시 암호화하지 않는다)
    const done = await act(() => result.current.continueTwoWay({ token: first.twoWayToken, code: MOCK_TWO_WAY_CODE }))
    expect(done.status).toBe('OK')
    await waitFor(() => expect(sent).toHaveLength(2))
    server.events.removeListener('request:start', listener)
    const [a, b] = sent.map((t) => JSON.parse(t) as { encryptedPassword: string; password?: string })
    expect(a.encryptedPassword).toBe(b.encryptedPassword)
    expect(sent.join()).not.toContain(password)
    expect(a).not.toHaveProperty('password')
    expect(variables()).not.toContain(password)
    // 쿼리 캐시에는 조회 결과가 없다
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    act(() => result.current.reset())
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

    // 운영 빌드에 고정값이 없으면 진입·암호화를 막는다(개발·목은 허용)
    vi.stubEnv('VITE_CODEF_PUBKEY_SHA256', '')
    expect(pinPolicy()).toBe('unpinned')
    vi.stubEnv('PROD', true)
    expect(pinPolicy()).toBe('blocked')
    await expect(buildFetchRequest(input)).rejects.toBeInstanceOf(CardImportKeyPinError)
    vi.unstubAllEnvs()
  })
})
