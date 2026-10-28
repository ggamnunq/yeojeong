// 닉네임 규칙(FR-103): 앞뒤 공백 제거 후 1~10자(grapheme), 줄바꿈·제어문자 불가, 중복 허용.
// TODO(shared): 서버 1차(S1)의 @yeojeong/shared normalizeNickname·graphemeLength가 들어오면 그것으로 바꾼다(같은 규칙).

export const NICKNAME_MAX_LENGTH = 10

// 제어 문자(줄바꿈·탭 포함)와 줄·문단 구분자. 이모지 결합용 ZWJ(Cf)는 남긴다.
const FORBIDDEN = /[\p{Cc}\u2028\u2029]/gu

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' })

/** 사람이 보는 글자 수(이모지·결합 문자를 한 글자로 센다) */
export function graphemeLength(value: string): number {
  let count = 0
  for (const _ of segmenter.segment(value)) count++
  return count
}

/** 앞에서부터 max 글자만 남긴다 */
export function truncateGraphemes(value: string, max = NICKNAME_MAX_LENGTH): string {
  let out = ''
  let count = 0
  for (const { segment } of segmenter.segment(value)) {
    if (count++ >= max) break
    out += segment
  }
  return out
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
  const trimmed = value.trim()
  return trimmed.length > 0 && !new RegExp(FORBIDDEN.source, 'u').test(trimmed) && graphemeLength(trimmed) <= NICKNAME_MAX_LENGTH
}
