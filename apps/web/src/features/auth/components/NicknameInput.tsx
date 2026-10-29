import { useRef } from 'react'
import { Input } from '../../../ds'
import { COPY } from '../copy'
import { graphemeLength, NICKNAME_MAX_LENGTH, sanitizeNicknameInput } from '../nickname'

export type NicknameInputProps = {
  value: string
  /** 정리된 값(제어 문자 제거, 한글 조합이 끝나면 10자로 자름) */
  onChange: (value: string) => void
  /** 서버·검증 오류 문구. 있으면 헬퍼 자리에 오류로 보인다 */
  error?: string | null
  /** 라벨 "닉네임"을 보일지. 가입(HF-03)은 큰 제목이 있어 숨김, 내 정보(HF-63)는 보임 */
  labelVisible?: boolean
  /** 헬퍼 "중복 가능 · n/10"을 보일지. 기본 true(가입 HF-03), 내 정보(HF-63)는 false — 오류 문구는 그래도 보인다 */
  counter?: boolean
  autoFocus?: boolean
  enterKeyHint?: 'next' | 'done'
}

/**
 * 닉네임 입력(HF-03 · HF-63 공용). Input L + (헬퍼 "중복 가능 · n/10") + 지우기. 10자를 넘는 입력은 잘라 막는다.
 * 규칙은 서버와 같은 shared normalizeNickname(앞뒤 공백 제거 후 1~10자, 제어 문자 불가, 중복 허용) — 저장 가능 여부는 isNicknameValid.
 * 한글 조합 중에는 자르지 않는다(조합이 깨진다).
 */
export function NicknameInput({
  value,
  onChange,
  error = null,
  labelVisible = false,
  counter = true,
  autoFocus,
  enterKeyHint = 'next',
}: NicknameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const change = (next: string) => onChange(sanitizeNicknameInput(next, { truncate: !composing.current }))

  return (
    <Input
      ref={inputRef}
      size="l"
      labelVisible={labelVisible}
      label="닉네임"
      name="nickname"
      autoComplete="nickname"
      enterKeyHint={enterKeyHint}
      autoFocus={autoFocus}
      value={value}
      error={error !== null}
      helper={error ?? (counter ? COPY.nicknameHelper(graphemeLength(value), NICKNAME_MAX_LENGTH) : undefined)}
      onChange={(e) => change(e.currentTarget.value)}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(e) => {
        composing.current = false
        change(e.currentTarget.value)
      }}
      onClear={() => {
        change('')
        inputRef.current?.focus()
      }}
    />
  )
}
