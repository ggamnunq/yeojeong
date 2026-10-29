import { useCallback, useEffect, useRef, useState } from 'react'
import { CARD_NUMBER_MAX_DIGITS, CARD_NUMBER_MIN_DIGITS, isValidCardNumber, isValidCardPassword, type CardImportOrganization } from '@yeojeong/shared'

// 현대·하나 카드번호 로그인 입력 규칙(S8c). 화면(HF-53 변형 입력칸)은 디자인 확정 뒤 이 파일의 규칙·hook을 쓴다.
// 메모리 규칙(화면명세 L-0, 비밀번호와 같다): 카드번호·카드 비밀번호 원문은
// - 이 hook의 React state(메모리)와 buildFetchRequest의 인자로만 산다. history state·sessionStorage·localStorage·URL·
//   cardImportFlow(흐름 표시)·TanStack 캐시에 넣지 않는다.
// - 제출하면(take) 바로 비운다. 실패 후 로그인 화면으로 돌아오거나, 카드사가 바뀌거나, 화면을 떠나거나(unmount), pagehide면 비운다.
// - 카드 비밀번호는 buildFetchRequest가 비밀번호와 같은 공개키(지문 고정 경유)로 암호화해 암호문만 요청에 넣는다.
// - 카드번호는 CODEF가 원문으로 받아(암호화 표시 없음) 요청 빌더에서만 숫자 원문으로 요청 객체에 들어간다.

/** 카드사 규칙(config.organizations 항목) */
export type CardLoginRule = Pick<CardImportOrganization, 'requiresCardNo' | 'cardPasswordDigits'>

/** 카드번호 입력 중 표시: 숫자만 남기고 4자리씩 띄운다(최대 19자리). 붙여넣은 하이픈·공백도 정리한다 */
export function formatCardNumberInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, CARD_NUMBER_MAX_DIGITS)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** 서버로 보낼 형식: 공백·하이픈만 뺀다(다른 문자가 있으면 형식 검사에서 걸린다) */
export const cardNumberDigits = (raw: string) => raw.replace(/[\s-]/g, '')

/** 카드 비밀번호 입력: 숫자만, 카드사 자리수까지 */
export const cardPasswordInput = (raw: string, digits: number) => raw.replace(/\D/g, '').slice(0, digits)

/** 카드번호 입력 문구(값을 넣지 않는다). 맞으면 null */
export function cardNumberError(raw: string): string | null {
  const digits = cardNumberDigits(raw)
  if (digits.length === 0) return '카드번호를 입력해 주세요'
  if (!/^\d+$/.test(digits) || digits.length < CARD_NUMBER_MIN_DIGITS || digits.length > CARD_NUMBER_MAX_DIGITS) {
    return `카드번호 ${CARD_NUMBER_MIN_DIGITS}~${CARD_NUMBER_MAX_DIGITS}자리를 입력해 주세요`
  }
  return isValidCardNumber(digits) ? null : '카드번호를 다시 확인해 주세요'
}

/** 카드 비밀번호 안내: 현대 "카드 비밀번호 4자리", 하나 "카드 비밀번호 앞 2자리" */
export const cardPasswordLabel = (digits: number) => (digits >= 4 ? `카드 비밀번호 ${digits}자리` : `카드 비밀번호 앞 ${digits}자리`)

/** 카드 비밀번호 입력 문구. 맞으면 null */
export function cardPasswordError(value: string, digits: number): string | null {
  return isValidCardPassword(value, digits) ? null : `${cardPasswordLabel(digits)}를 입력해 주세요`
}

/**
 * 입력칸 속성. 브라우저 자동 완성·저장(카드 정보 저장 제안)을 끈다. name을 cc-number 같은 표준 이름으로 두지 않는다.
 * 카드 비밀번호는 type=password(화면에 보이지 않게)
 */
export const CARD_NUMBER_INPUT_PROPS = {
  inputMode: 'numeric',
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  // 19자리 + 띄어쓰기 4
  maxLength: CARD_NUMBER_MAX_DIGITS + 4,
} as const

export const cardPasswordInputProps = (digits: number) =>
  ({
    type: 'password',
    inputMode: 'numeric',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    maxLength: digits,
  }) as const

/** buildFetchRequest가 화면 입력이 형식에 맞지 않을 때 던진다(값은 담지 않는다). 보내기 전에 막는다 */
export class CardLoginInputError extends Error {
  readonly field: 'cardNumber' | 'cardPassword'
  constructor(field: 'cardNumber' | 'cardPassword') {
    super(field === 'cardNumber' ? '카드번호를 다시 확인해 주세요' : '카드 비밀번호를 다시 확인해 주세요')
    this.name = 'CardLoginInputError'
    this.field = field
  }
}

/**
 * 카드번호·카드 비밀번호 입력 state(메모리만). organization이 바뀌면 비운다. pagehide·unmount에도 비운다.
 * - take(): 제출할 때 부른다 — 지금 값을 돌려주고 state는 바로 비운다(돌려받은 값은 buildFetchRequest에 바로 넘긴다).
 * - clear(): 실패 후 로그인 화면으로 돌아올 때·취소할 때 부른다.
 */
export function useCardSecrets(organization: string | undefined, rule: CardLoginRule | undefined) {
  const digits = rule?.cardPasswordDigits ?? 0
  const [cardNumber, setNumber] = useState('')
  const [cardPassword, setPassword] = useState('')
  // take()가 렌더 사이 최신 값을 읽게 ref에도 둔다(같은 메모리 수명)
  const current = useRef({ cardNumber: '', cardPassword: '' })
  const clear = useCallback(() => {
    current.current = { cardNumber: '', cardPassword: '' }
    setNumber('')
    setPassword('')
  }, [])
  useEffect(() => {
    window.addEventListener('pagehide', clear)
    return () => {
      window.removeEventListener('pagehide', clear)
      current.current = { cardNumber: '', cardPassword: '' }
    }
  }, [clear])
  // 카드사가 바뀌면 이전 카드사 입력을 버린다
  useEffect(() => clear, [organization, clear])
  const setCardNumber = useCallback((raw: string) => {
    const value = formatCardNumberInput(raw)
    current.current = { ...current.current, cardNumber: value }
    setNumber(value)
  }, [])
  const setCardPassword = useCallback(
    (raw: string) => {
      const value = cardPasswordInput(raw, digits)
      current.current = { ...current.current, cardPassword: value }
      setPassword(value)
    },
    [digits],
  )
  const take = useCallback(() => {
    const value = current.current
    clear()
    return value
  }, [clear])
  return { cardNumber, cardPassword, setCardNumber, setCardPassword, clear, take }
}
