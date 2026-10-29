import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  CARD_NUMBER_INPUT_PROPS,
  cardNumberDigits,
  cardNumberError,
  cardPasswordError,
  cardPasswordInputProps,
  cardPasswordLabel,
  formatCardNumberInput,
  useCardSecrets,
} from './cardLogin'

// 테스트용 카드번호(Mastercard 테스트 번호 — 실제 카드 아님)
const PAN = '5555555555554444'
const HYUNDAI = { requiresCardNo: true, cardPasswordDigits: 4 }
const HANA = { requiresCardNo: true, cardPasswordDigits: 2 }

describe('카드번호·카드 비밀번호 입력 규칙(S8c)', () => {
  it('formats the card number in groups of 4 and sends digits only', () => {
    expect(formatCardNumberInput('5555-5555 5555 4444')).toBe('5555 5555 5555 4444')
    expect(formatCardNumberInput('55555')).toBe('5555 5')
    expect(formatCardNumberInput('1'.repeat(25)).replace(/ /g, '')).toHaveLength(19)
    expect(cardNumberDigits('5555 5555-5555 4444')).toBe(PAN)
  })

  it('explains card number problems without echoing the value', () => {
    expect(cardNumberError('')).toBe('카드번호를 입력해 주세요')
    expect(cardNumberError('5555 5555')).toBe('카드번호 14~19자리를 입력해 주세요')
    expect(cardNumberError('5555 5555 5555 4445')).toBe('카드번호를 다시 확인해 주세요')
    expect(cardNumberError('5555 5555 5555 4444')).toBeNull()
    for (const raw of ['5555 5555', '5555 5555 5555 4445']) expect(cardNumberError(raw)).not.toContain('5555')
  })

  it('checks the card password digits per card company (Hyundai 4, Hana first 2)', () => {
    expect(cardPasswordLabel(4)).toBe('카드 비밀번호 4자리')
    expect(cardPasswordLabel(2)).toBe('카드 비밀번호 앞 2자리')
    expect(cardPasswordError('1234', 4)).toBeNull()
    expect(cardPasswordError('12', 4)).toBe('카드 비밀번호 4자리를 입력해 주세요')
    expect(cardPasswordError('12', 2)).toBeNull()
    expect(cardPasswordError('1a', 2)).toBe('카드 비밀번호 앞 2자리를 입력해 주세요')
  })

  it('turns off autofill and hides the card password', () => {
    expect(CARD_NUMBER_INPUT_PROPS).toMatchObject({ inputMode: 'numeric', autoComplete: 'off' })
    expect(cardPasswordInputProps(2)).toMatchObject({ type: 'password', inputMode: 'numeric', autoComplete: 'off', maxLength: 2 })
  })
})

describe('useCardSecrets: 메모리에만, 제출·이탈·pagehide·카드사 변경에 비운다', () => {
  it('takes the values once and clears them right away', () => {
    const { result } = renderHook(() => useCardSecrets('0302', HYUNDAI))
    act(() => {
      result.current.setCardNumber('5555-5555-5555-4444')
      result.current.setCardPassword('12a345')
    })
    expect(result.current.cardNumber).toBe('5555 5555 5555 4444')
    expect(result.current.cardPassword).toBe('1234')
    let taken = { cardNumber: '', cardPassword: '' }
    act(() => {
      taken = result.current.take()
    })
    expect(taken).toEqual({ cardNumber: '5555 5555 5555 4444', cardPassword: '1234' })
    expect(result.current.cardNumber).toBe('')
    expect(result.current.cardPassword).toBe('')
    // 두 번째 take는 빈 값(같은 값을 두 번 보내지 않는다)
    act(() => {
      taken = result.current.take()
    })
    expect(taken).toEqual({ cardNumber: '', cardPassword: '' })
  })

  it('clears on pagehide and when the card company changes, and never touches storage, URL or history', () => {
    const before = { session: sessionStorage.length, local: localStorage.length, url: window.location.href, state: JSON.stringify(history.state) }
    const { result, rerender } = renderHook(({ org, rule }) => useCardSecrets(org, rule), {
      initialProps: { org: '0302', rule: HYUNDAI },
    })
    act(() => {
      result.current.setCardNumber(PAN)
      result.current.setCardPassword('1234')
    })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(result.current.cardNumber).toBe('')
    expect(result.current.cardPassword).toBe('')

    act(() => {
      result.current.setCardNumber(PAN)
      result.current.setCardPassword('1234')
    })
    rerender({ org: '0313', rule: HANA })
    expect(result.current.cardNumber).toBe('')
    expect(result.current.cardPassword).toBe('')
    // 하나는 앞 2자리까지만 받는다
    act(() => result.current.setCardPassword('1234'))
    expect(result.current.cardPassword).toBe('12')

    expect({ session: sessionStorage.length, local: localStorage.length, url: window.location.href, state: JSON.stringify(history.state) }).toEqual(
      before,
    )
    const storage = JSON.stringify({ ...sessionStorage, ...localStorage }) + window.location.href + JSON.stringify(history.state)
    expect(storage).not.toContain(PAN)
  })
})
