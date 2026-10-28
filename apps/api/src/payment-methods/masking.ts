import type { PaymentMethodType } from '@yeojeong/shared';

// 카드·계좌 번호 마스킹(I-9, 기능명세 8-1, 확정 규칙 v0.5.1). 전체 번호는 저장·응답·로그 어디에도 두지 않는다.
// - 카드: 끝 4자리만 남긴다 "**** **** **** 1934"(앞자리 BIN도 저장·응답 금지). 표시는 "{shortLabel} {last4}"
// - 계좌: 앞 4자리·끝 3자리만 남긴다 "3333-**-****821"
// 제공자가 실번호를 주는 경우 어댑터가 이 함수로 마스킹해서 넘기고, 서버는 저장 직전에 assertSafelyMasked로 한 번 더 막는다.

const CARD_MASK = /^\*{4} \*{4} \*{4} \d{4}$/;
/** 계좌 마스킹 값에 드러나도 되는 숫자의 최대 개수(앞 4 + 끝 3) */
const ACCOUNT_MAX_VISIBLE_DIGITS = 7;

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/** "5365123456781934" 또는 "5365-1234-5678-1934" → "**** **** **** 1934" */
export function maskCardNumber(raw: string): string {
  const digits = digitsOf(raw);
  if (digits.length < 12 || digits.length > 19) {
    throw new RangeError('카드 번호 형식이 아닙니다');
  }
  return `**** **** **** ${digits.slice(-4)}`;
}

/**
 * 계좌 번호: 하이픈 구조는 그대로 두고 앞 4자리·끝 3자리만 남긴다.
 * "3333-01-2345821" → "3333-**-****821", "100012345621" → "1000*****621"
 */
export function maskAccountNumber(raw: string): string {
  const total = digitsOf(raw).length;
  if (total < 8 || total > 20)
    throw new RangeError('계좌 번호 형식이 아닙니다');
  let seen = 0;
  return raw
    .trim()
    .split('')
    .filter((ch) => /[\d-]/.test(ch))
    .map((ch) => {
      if (ch === '-') return ch;
      seen += 1;
      return seen <= 4 || seen > total - 3 ? ch : '*';
    })
    .join('');
}

/**
 * 저장·응답해도 되는 마스킹 값인지.
 * 카드는 정확히 "**** **** **** 1234", 계좌는 '*'를 포함하고 드러난 숫자가 앞 4·끝 3 이하(30자 이하).
 */
export function isSafelyMasked(
  masked: string,
  type: PaymentMethodType,
): boolean {
  if (type === 'CARD') return CARD_MASK.test(masked);
  if (masked.length === 0 || masked.length > 30 || !masked.includes('*')) {
    return false;
  }
  if (!/^[\d*\- ]+$/.test(masked)) return false;
  const visible = digitsOf(masked);
  if (visible.length > ACCOUNT_MAX_VISIBLE_DIGITS) return false;
  // 드러난 숫자는 맨 앞 4자리 안과 맨 끝 3자리 안에만 있어야 한다
  const lead = /^[\d-]*/.exec(masked)![0];
  const tail = /[\d-]*$/.exec(masked)![0];
  return (
    digitsOf(lead).length <= 4 &&
    digitsOf(tail).length <= 3 &&
    digitsOf(lead).length + digitsOf(tail).length === visible.length
  );
}

/** 어댑터 경계 위반(전체 번호·앞자리가 넘어옴)이면 저장하지 않고 멈춘다. 메시지에 값을 넣지 않는다 */
export function assertSafelyMasked(
  masked: string,
  type: PaymentMethodType,
): void {
  if (!isSafelyMasked(masked, type)) {
    throw new Error('결제수단 번호가 마스킹되지 않았습니다');
  }
}

/** 마스킹 값 끝의 숫자(2~4자리) → PaymentMethod.last4. "**** **** **** 1934" → "1934", "3333-**-****821" → "821" */
export function last4FromMasked(masked: string): string {
  const tail = /(\d+)\D*$/.exec(masked)?.[1] ?? '';
  const last = tail.slice(-4);
  if (last.length < 2) throw new Error('마스킹 값에 끝자리가 없습니다');
  return last;
}

/** 결제 상세 줄용 이름(제안 규칙): 은행 체크카드 → "{은행} 체크카드", 카드사 카드 → 카드사명, 계좌 → "{은행} 통장" */
export function deriveShortLabel(input: {
  type: PaymentMethodType;
  institutionName: string;
  productName: string;
}): string {
  if (input.type === 'ACCOUNT') return `${input.institutionName} 통장`;
  return input.productName.includes('체크')
    ? `${input.institutionName} 체크카드`
    : input.institutionName;
}

/** 결제 상세 표시 "{shortLabel} {last4}" — "토스뱅크 체크카드 1934" */
export function paymentMethodLabel(method: {
  shortLabel: string;
  last4: string;
}): string {
  return `${method.shortLabel} ${method.last4}`;
}

/**
 * 가맹점 정규화 키(Transaction.merchantKey): NFKC → 대문자 → 공백·기호 제거.
 * 중복 의심·환불 매칭에서 "이치란 라멘 도톤보리점"과 "이치란라멘 도톤보리점"을 같게 본다.
 */
export function normalizeMerchantKey(name: string): string {
  return name
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .slice(0, 100);
}
