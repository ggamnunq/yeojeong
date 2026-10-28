import {
  graphemeLength,
  NICKNAME_MAX_LENGTH,
  normalizeNickname,
  truncateGraphemes as truncateShared,
} from '@yeojeong/shared'

// 닉네임 저장 규칙은 서버와 같은 @yeojeong/shared normalizeNickname을 쓴다.
export { graphemeLength, NICKNAME_MAX_LENGTH }

// 제어 문자(줄바꿈·탭 포함)와 줄·문단 구분자. 이모지 결합용 ZWJ(Cf)는 남긴다.
const FORBIDDEN = /[\p{Cc}\u2028\u2029]/gu

/** 앞에서부터 max 글자만 남긴다 */
export function truncateGraphemes(value: string, max = NICKNAME_MAX_LENGTH): string {
  return truncateShared(value, max)
}

/** 입력 중 값: 제어 문자를 지우고(붙여 넣기 포함) 10자를 넘으면 자른다. 앞뒤 공백은 제출 때 지운다 */
export function sanitizeNicknameInput(value: string, { truncate = true } = {}): string {
  const clean = value.replace(FORBIDDEN, '')
  return truncate ? truncateGraphemes(clean) : clean
}

/** 카카오 닉네임 → 입력 초기값(앞 10자) */
export function nicknameFromDraft(kakaoNickname: string | null | undefined): string {
  return sanitizeNicknameInput((kakaoNickname ?? '').trim())
}

/** "다음"을 누를 수 있는가: 앞뒤 공백 제거 후 1~10자 */
export function isNicknameValid(value: string): boolean {
  return normalizeNickname(value).ok
}
