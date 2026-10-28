import { afterEach, describe, expect, it, vi } from 'vitest'
import { toastStore } from '../notifications/store'
import { ApiError } from './client'
import { consentRequiredIds, handleApiError, onConsentRequired } from './errors'

const consentError = (details?: Record<string, unknown>) =>
  new ApiError({ code: 'CONSENT_REQUIRED' as never, message: '약관 동의가 필요해요', status: 403, details })

let off: (() => void) | undefined
afterEach(() => off?.())

describe('CONSENT_REQUIRED', () => {
  it('details.required(없으면 details.missing)를 읽는다', () => {
    expect(consentRequiredIds(consentError({ required: ['TOS', 3] }))).toEqual(['TOS'])
    expect(consentRequiredIds(consentError({ missing: ['PRIVACY'] }))).toEqual(['PRIVACY'])
    expect(consentRequiredIds(consentError())).toEqual([])
    expect(consentRequiredIds(new ApiError({ code: 'FORBIDDEN', message: 'x', status: 403 }))).toBeNull()
  })

  it('처리기가 있으면 토스트 없이 처리기만 부른다(silent여도)', () => {
    const handler = vi.fn()
    off = onConsentRequired(handler)
    handleApiError(consentError({ required: ['TOS'] }), { silent: true })
    expect(handler).toHaveBeenCalledWith(expect.any(ApiError), ['TOS'])
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it('처리기가 없으면 다른 403처럼 오류 토스트', () => {
    handleApiError(consentError({ required: ['FIN_LINK'] }))
    expect(toastStore.getSnapshot()[0]).toMatchObject({ type: 'error', message: '약관 동의가 필요해요' })
  })
})
