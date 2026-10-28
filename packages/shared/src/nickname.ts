/** 닉네임 최대 길이(글자 = grapheme 기준). 중복은 허용한다(FR-103) */
export const NICKNAME_MAX_LENGTH = 10;

// 제어 문자(줄바꿈·탭 포함)와 줄·문단 구분자는 받지 않는다. 이모지 결합용 ZWJ(Cf)는 허용한다.
const FORBIDDEN = /[\p{Cc}\u2028\u2029]/u;

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

/** 사람이 보는 글자 수(이모지·결합 문자를 한 글자로 센다) */
export function graphemeLength(value: string): number {
  let count = 0;
  for (const _ of segmenter.segment(value)) count++;
  return count;
}

/** 앞에서부터 max 글자만 남긴다(카카오 닉네임 미리 채움 등) */
export function truncateGraphemes(value: string, max: number): string {
  let out = '';
  let count = 0;
  for (const { segment } of segmenter.segment(value)) {
    if (count++ >= max) break;
    out += segment;
  }
  return out;
}

export type NicknameResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'EMPTY' | 'TOO_LONG' | 'INVALID_CHARACTER' };

/** 앞뒤 공백을 지운 뒤 1~10자, 제어 문자 없음. 화면 입력 검사와 서버 저장이 같은 함수를 쓴다 */
export function normalizeNickname(input: string): NicknameResult {
  const value = input.trim();
  if (FORBIDDEN.test(value)) return { ok: false, reason: 'INVALID_CHARACTER' };
  if (value.length === 0) return { ok: false, reason: 'EMPTY' };
  if (graphemeLength(value) > NICKNAME_MAX_LENGTH) {
    return { ok: false, reason: 'TOO_LONG' };
  }
  return { ok: true, value };
}
