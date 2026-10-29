import {
  MANUAL_AMOUNT_MAX_INTEGER_DIGITS,
  MANUAL_DEFAULT_MERCHANT_NAME,
  MANUAL_KRW_AMOUNT_MAX,
  MANUAL_MEMO_MAX_LENGTH,
  MANUAL_OCCURRED_AT_FUTURE_SECONDS,
  MANUAL_OCCURRED_AT_PAST_DAYS,
  type FieldError,
  type TripStatus,
} from '@yeojeong/shared';
import { currencyMeta } from '../fx/currencies.js';

// 직접 입력 결제(S7)의 입력 규칙. DB 없이 판단한다(단위 테스트 대상).

const AMOUNT = new RegExp(
  `^\\d{1,${MANUAL_AMOUNT_MAX_INTEGER_DIGITS}}(\\.\\d{1,20})?$`,
);

const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_MS = MANUAL_OCCURRED_AT_FUTURE_SECONDS * 1000;

/**
 * 금액 검사: 양수 decimal, 정수부 12자리까지, 소수 자리는 통화 기준(KRW·JPY·VND·IDR 0, 그 밖 2).
 * 문제가 없으면 null
 */
export function manualAmountError(
  amount: string,
  currency: string,
  path = 'amount',
): FieldError | null {
  const value = amount.trim();
  if (!AMOUNT.test(value)) {
    return { path, code: 'isAmount', message: '금액을 다시 확인해 주세요' };
  }
  const [, fraction = ''] = value.split('.');
  const digits = currencyMeta(currency).fractionDigits;
  // 끝자리 0은 자릿수에서 뺀다(정규식 /0+$/는 0이 길게 이어지면 느려서 직접 센다)
  let significant = fraction.length;
  while (significant > 0 && fraction[significant - 1] === '0') significant--;
  if (significant > digits) {
    return {
      path,
      code: 'fractionDigits',
      message:
        digits === 0
          ? `${currency}는 소수점 없이 입력해 주세요`
          : `${currency}는 소수점 ${digits}자리까지 입력할 수 있어요`,
    };
  }
  if (!/[1-9]/.test(value)) {
    return { path, code: 'positive', message: '0보다 큰 금액을 입력해 주세요' };
  }
  return null;
}

/** 원화 환산 금액 상한(₩100,000,000) */
export function manualKrwError(
  krwAmount: number,
  path = 'amount',
): FieldError | null {
  return krwAmount > MANUAL_KRW_AMOUNT_MAX
    ? {
        path,
        code: 'max',
        message: '한 번에 1억 원까지 기록할 수 있어요',
      }
    : null;
}

/** 줄바꿈·제어문자 → 공백, 연속 공백 하나로, 앞뒤 공백 제거(FR-427) */
export function cleanMemo(memo: string | null | undefined): string {
  return (memo ?? '')
    .replace(/[\p{Cc}\u2028\u2029]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const graphemes = new Intl.Segmenter('ko', { granularity: 'grapheme' });

/** 화면에 보이는 글자 수(이모지·결합 문자는 한 글자) */
function charCount(value: string): number {
  let count = 0;
  for (const _ of graphemes.segment(value)) count += 1;
  return count;
}

/** 정리한 메모가 40자를 넘으면 오류 */
export function memoError(
  memo: string | null | undefined,
  path = 'memo',
): FieldError | null {
  return charCount(cleanMemo(memo)) > MANUAL_MEMO_MAX_LENGTH
    ? {
        path,
        code: 'maxLength',
        message: `내용은 ${MANUAL_MEMO_MAX_LENGTH}자까지 쓸 수 있어요`,
      }
    : null;
}

/** 메모 → 저장할 이름(Expense.merchantName·Transaction.merchantNameRaw). 비면 "결제" */
export function merchantNameOf(memo: string | null | undefined): string {
  const value = cleanMemo(memo);
  return value.length > 0 ? value : MANUAL_DEFAULT_MERCHANT_NAME;
}

/** 저장된 이름 → 화면의 메모 값. 기본 이름이면 null(메모 없음) */
export function memoOf(merchantName: string): string | null {
  return merchantName === MANUAL_DEFAULT_MERCHANT_NAME ? null : merchantName;
}

/** 결제 시각 범위 검사. 문제가 없으면 null */
export function occurredAtError(
  occurredAt: Date,
  now: Date,
  path = 'occurredAt',
): FieldError | null {
  const time = occurredAt.getTime();
  if (Number.isNaN(time)) {
    return { path, code: 'isDate', message: '결제 시각을 다시 확인해 주세요' };
  }
  if (time > now.getTime() + FUTURE_MS) {
    return {
      path,
      code: 'future',
      message: '아직 오지 않은 날짜예요',
    };
  }
  if (time < now.getTime() - MANUAL_OCCURRED_AT_PAST_DAYS * DAY_MS) {
    return {
      path,
      code: 'tooOld',
      message: `${MANUAL_OCCURRED_AT_PAST_DAYS}일 안의 결제만 기록할 수 있어요`,
    };
  }
  return null;
}

// ─── 지갑 → 여정 자동 연결(S7, 명세 v0.6.0) ───

export interface TripCandidateInput {
  tripId: string;
  status: TripStatus;
  /** 시작일 00:00 KST */
  startAt: Date;
  /** 종료일 23:59:59 KST */
  autoEndAt: Date;
  currency: string;
}

export interface RankedTripCandidate<T extends TripCandidateInput> {
  trip: T;
  inPeriod: boolean;
}

/**
 * 연결 후보 정렬: 기간 안(KST 시작일 00:00 ~ 종료일 23:59:59) 먼저 → 진행 중 먼저 → 시작일이 at에 가까운 순 → tripId.
 * 예정·진행 중 여정만 받는다(종료된 여정은 호출자가 뺀다).
 */
export function rankTripCandidates<T extends TripCandidateInput>(
  trips: readonly T[],
  at: Date,
): RankedTripCandidate<T>[] {
  const time = at.getTime();
  return trips
    .filter((t) => t.status === 'UPCOMING' || t.status === 'ONGOING')
    .map((trip) => ({
      trip,
      inPeriod:
        trip.startAt.getTime() <= time && time <= trip.autoEndAt.getTime(),
    }))
    .sort(
      (a, b) =>
        Number(b.inPeriod) - Number(a.inPeriod) ||
        Number(b.trip.status === 'ONGOING') -
          Number(a.trip.status === 'ONGOING') ||
        Math.abs(a.trip.startAt.getTime() - time) -
          Math.abs(b.trip.startAt.getTime() - time) ||
        a.trip.tripId.localeCompare(b.trip.tripId),
    );
}

/** 자동 연결 대상: 정렬 첫 번째가 기간 안이면 그 여정, 아니면 null(지갑에만) */
export function suggestedTripOf<T extends TripCandidateInput>(
  ranked: readonly RankedTripCandidate<T>[],
): T | null {
  return ranked[0]?.inPeriod ? ranked[0].trip : null;
}

/** 지갑 통화 기본값: 같은 정렬에서 첫 진행 중 여정의 통화, 없으면 KRW */
export function defaultWalletCurrency<T extends TripCandidateInput>(
  ranked: readonly RankedTripCandidate<T>[],
): string {
  return (
    ranked.find((r) => r.trip.status === 'ONGOING')?.trip.currency ?? 'KRW'
  );
}
