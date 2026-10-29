// 카드번호 형식 규칙(S8c, 현대·하나 카드 불러오기 로그인). 화면(입력 검사)과 서버(요청 검증)가 같은 규칙을 쓴다.
// 카드번호는 저장·기록하지 않는다. 이 함수들은 값을 돌려주거나 참·거짓만 알려 주고, 에러 메시지에 값을 넣지 않는다.

/** 카드번호 자리수(ISO/IEC 7812 PAN: 최소 14 ~ 최대 19) */
export const CARD_NUMBER_MIN_DIGITS = 14;
export const CARD_NUMBER_MAX_DIGITS = 19;

const DIGITS = /^\d+$/;

/** Luhn(ISO/IEC 7812-1 부록 B) 검사 숫자가 맞는가 */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * 서버로 보낼 카드번호 형식인가: 숫자만, 14~19자리, Luhn.
 * 예외: 62로 시작하는 은련(UnionPay) 카드는 Luhn을 따르지 않는 번호가 발급돼 있어 Luhn을 보지 않는다(자리수·숫자만 본다)
 */
export function isValidCardNumber(digits: string): boolean {
  if (!DIGITS.test(digits)) return false;
  if (
    digits.length < CARD_NUMBER_MIN_DIGITS ||
    digits.length > CARD_NUMBER_MAX_DIGITS
  ) {
    return false;
  }
  return digits.startsWith('62') || luhnValid(digits);
}

/**
 * 화면 입력 → 서버 형식(숫자만). 공백·하이픈은 무시한다(CODEF 예시 "6253123456780000"처럼 구분자 없이 보낸다).
 * 형식이 틀리면 null
 */
export function normalizeCardNumber(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return isValidCardNumber(digits) ? digits : null;
}

/** 카드 비밀번호 입력 형식: 숫자만, 카드사가 정한 자리수(현대 4자리, 하나 앞 2자리 — CardImportOrganization.cardPasswordDigits) */
export function isValidCardPassword(value: string, digits: number): boolean {
  return value.length === digits && DIGITS.test(value);
}
