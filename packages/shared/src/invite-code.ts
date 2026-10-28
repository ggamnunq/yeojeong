/** 초대코드 문자 집합. 헷갈리는 0·O·1·I·L을 뺐다 */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const INVITE_CODE_LENGTH = 6;
const INVITE_CODE = /^[2-9A-HJKMNP-Z]{6}$/;

/** 입력값을 저장 형식으로 바꾼다. 대소문자·하이픈·공백은 무시한다. 형식이 틀리면 null */
export function normalizeInviteCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return INVITE_CODE.test(code) ? code : null;
}

/** 표시용 3-3 분리: K7M2QX → K7M-2QX */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
