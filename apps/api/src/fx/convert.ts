import { toKrw, type FxPolicy } from '@yeojeong/shared';
import { currencyMeta, KRW } from './currencies.js';

// 결제 원화 환산(기능명세 4-5, FR-808). 인입(S2B)·환율 재계산·현황·정산이 모두 이 파일의 함수를 쓴다.
// 순수 함수다(DB·시계 없음). 금액은 문자열 decimal → bigint로 계산하고 부동소수점을 쓰지 않는다.

/** FIXED 정책 결제의 출처 표기 */
export const FIXED_RATE_SOURCE = '고정 환율';
/** CARD_BILLED 정책에서 카드사 원화 금액을 쓴 결제의 출처 표기 */
export const CARD_BILLED_SOURCE = '카드사 청구 환율';

const DECIMAL = /^-?\d+(\.\d+)?$/;
const FIXED_RATE = /^\d{1,12}(\.\d{1,2})?$/;

/** "12.5" → 125000n(scale 4). 넘치는 소수 자리는 0일 때만 허용한다 */
export function parseScaled(value: string, scale: number): bigint {
  if (!DECIMAL.test(value)) throw new RangeError(`decimal 형식 오류: ${value}`);
  const negative = value.startsWith('-');
  const [integer, fraction = ''] = value.replace('-', '').split('.');
  if (/[^0]/.test(fraction.slice(scale))) {
    throw new RangeError(`소수 자리가 ${scale}자리를 넘습니다: ${value}`);
  }
  const digits = BigInt(integer + fraction.slice(0, scale).padEnd(scale, '0'));
  return negative ? -digits : digits;
}

/** 125000n, 4 → "12.5000" */
export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(scale + 1, '0');
  const integer = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${integer}${scale > 0 ? `.${fraction}` : ''}`;
}

/** 정수 나눗셈 반올림(half-up, 0에서 먼 쪽). denom > 0 */
export function divRoundHalfUp(numer: bigint, denom: bigint): bigint {
  if (denom <= 0n) throw new RangeError('나누는 수는 양수여야 합니다');
  const abs = numer < 0n ? -numer : numer;
  const quotient = (abs * 2n + denom) / (denom * 2n);
  return numer < 0n ? -quotient : quotient;
}

function toSafeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('원화 금액이 너무 큽니다');
  }
  return result;
}

/**
 * 외화 × (per 단위당 원) → 원화, 10원 단위 반올림(half-up). per = 1이면 shared toKrw와 같다.
 * foreignToKrw('2860', '900.00', 100) === 25740 (FR-808 수락 기준 2)
 */
export function foreignToKrw(amount: string, rate: string, per = 1): number {
  if (!Number.isSafeInteger(per) || per <= 0) {
    throw new RangeError('고시 단위는 1 이상의 정수여야 합니다');
  }
  const product = parseScaled(amount, 4) * parseScaled(rate, 6); // 1e10 배
  const tenWon = 10n ** 11n * BigInt(per);
  return toSafeNumber(divRoundHalfUp(product, tenWon) * 10n);
}

/** KRW 결제: 환산 없음. 소수가 섞여 오면 1원 단위 반올림 */
export function krwAmountOf(amount: string): number {
  return toSafeNumber(divRoundHalfUp(parseScaled(amount, 4), 10_000n));
}

/** 고시 단위당 원 → 1단위당 원(소수 6자리). ratePerUnit('919.20', 100) === '9.192000' */
export function ratePerUnit(ratePerDisplayUnit: string, displayUnit: number) {
  return formatScaled(
    divRoundHalfUp(parseScaled(ratePerDisplayUnit, 6), BigInt(displayUnit)),
    6,
  );
}

/** 1단위당 원 → 고시 단위당 원, 소수 둘째 자리 반올림. displayRate('9.192', 100) === '919.20' */
export function displayRate(rate: string, displayUnit: number): string {
  const perDisplayUnit = parseScaled(rate, 6) * BigInt(displayUnit);
  return formatScaled(divRoundHalfUp(perDisplayUnit, 10_000n), 2);
}

/** "1380.50" → "1,380.50" */
export function withThousands(decimal: string): string {
  const [integer, fraction] = decimal.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** 화면 표기 "100엔 = 919.20원", "1달러 = 1,380.50원"(화면명세 0-5) */
export function fxRateLabel(currency: string, rate: string): string {
  const meta = currencyMeta(currency);
  const value = withThousands(displayRate(rate, meta.displayUnit));
  return `${meta.displayUnit}${meta.nameKo} = ${value}원`;
}

/**
 * 그룹장이 입력한 고정 환율(고시 단위당 원, 소수 둘째 자리까지)을 검사해 "919.20" 형태로 맞춘다.
 * 0 이하·형식 오류면 null.
 */
export function normalizeFixedRate(input: string): string | null {
  const trimmed = input.trim();
  if (!FIXED_RATE.test(trimmed)) return null;
  const scaled = parseScaled(trimmed, 2);
  return scaled > 0n ? formatScaled(scaled, 2) : null;
}

/**
 * 결제 한 건에 실제로 적용할 환율 기준(디자인 결정 C-32).
 * KRW·여정 통화 결제는 여정 정책(Trip.fxPolicy) 그대로. 여정 통화도 KRW도 아닌 외화(예: 일본 여정의 USD 결제)는
 * 여정 고정 환율을 쓰지 않는다:
 * - FIXED 여정 → 결제 시점 시장 환율(SPOT_AT_PAYMENT: 수출입은행 우선, 보조 소스 포함).
 * - CARD_BILLED 여정 → 그대로 CARD_BILLED. 카드사 원화(청구 확정 → 제공자)가 있으면 그 값, 없을 때만 시장 환율(임시).
 * - SPOT_AT_PAYMENT 여정 → 그대로.
 * effectiveFxPolicy('FIXED', 'JPY', 'USD') === 'SPOT_AT_PAYMENT'
 */
export function effectiveFxPolicy(
  tripPolicy: FxPolicy,
  tripCurrency: string,
  currency: string,
): FxPolicy {
  if (tripPolicy !== 'FIXED') return tripPolicy;
  const code = currency.toUpperCase();
  if (code === KRW || code === tripCurrency.toUpperCase()) return tripPolicy;
  return 'SPOT_AT_PAYMENT';
}

/** 매매기준율 고시 한 건(ExchangeRate) */
export interface FxSpotRate {
  /** 1단위당 원 */
  rate: string;
  source: string;
  effectiveAt: Date;
  /** ExchangeRate.id(있으면 Transaction.spotRateId 스냅샷용) */
  id?: string;
}

export interface ConvertInput {
  /** 원통화 금액(부호 포함, 소수 4자리까지) */
  amount: string;
  /** 원통화 ISO 4217 */
  currency: string;
  /** 이 결제에 적용할 환율 기준. 여정 결제는 effectiveFxPolicy(Trip.fxPolicy, 여정 통화, 결제 통화)를 넘긴다 */
  policy: FxPolicy;
  /** effectiveAt ≤ 결제 시각인 가장 최근 고시. FxRatesService.findSpotRate로 찾는다 */
  spot?: FxSpotRate | null;
  /** FIXED: 고시 단위당 원(Trip.fxFixedRate) */
  fixedRate?: string | null;
  /** FIXED 값을 정한 시각(Trip.fxPolicyChangedAt). 스냅샷 rateAt으로 남긴다 */
  fixedAt?: Date | null;
  /** CARD_BILLED: 카드사 청구 확정 원화(Transaction.billedKrwAmount) */
  billedKrwAmount?: number | null;
  billedAt?: Date | null;
  /** CARD_BILLED: 청구 확정 전 제공자 원화(Transaction.providerKrwAmount) */
  providerKrwAmount?: number | null;
}

/** Expense의 krwAmount와 환율 스냅샷 컬럼(fxPolicyApplied·fxRate·fxRateUnit·fxRateSource·fxRateAt)에 그대로 넣는다 */
export interface ConvertResult {
  krwAmount: number;
  /** KRW 결제면 null */
  policyApplied: FxPolicy | null;
  /** 1단위당 원(소수 6자리). 카드사 원화를 쓴 결제·KRW는 null */
  rate: string | null;
  /** 고시 단위(표시 "100엔 = …") */
  rateUnit: number | null;
  rateSource: string | null;
  rateAt: Date | null;
  /** CARD_BILLED인데 청구 확정 전(제공자 원화 또는 매매기준율로 임시 계산). 확정이 오면 다시 계산한다 */
  provisional: boolean;
  /** 쓴 고시의 ExchangeRate.id */
  spotRateId: string | null;
}

/** 매매기준율이 필요한데 고시가 하나도 없을 때. 서비스가 503 FX_RATE_UNAVAILABLE로 바꾼다 */
export class FxRateMissingError extends Error {
  constructor(readonly currency: string) {
    super(`${currency} 매매기준율 고시가 없습니다`);
    this.name = 'FxRateMissingError';
  }
}

/**
 * 결제 한 건의 원화를 정한다(기능명세 4-5 표).
 * - KRW: 환산 없음.
 * - SPOT_AT_PAYMENT: 결제 시점 매매기준율 × 금액, 10원 반올림.
 * - CARD_BILLED: 청구 확정 원화 → 없으면 제공자 원화 → 없으면 매매기준율(임시). 앞의 둘은 그대로 쓴다(반올림 없음).
 * - FIXED: 금액 × 고정 환율 ÷ 고시 단위, 10원 반올림.
 * @throws FxRateMissingError 매매기준율이 필요한데 spot이 없을 때
 */
export function convertToKrw(input: ConvertInput): ConvertResult {
  const currency = input.currency.toUpperCase();
  if (currency === KRW) {
    return {
      krwAmount: krwAmountOf(input.amount),
      policyApplied: null,
      rate: null,
      rateUnit: null,
      rateSource: null,
      rateAt: null,
      provisional: false,
      spotRateId: null,
    };
  }
  const { displayUnit } = currencyMeta(currency);

  const fromSpot = (provisional: boolean): ConvertResult => {
    if (!input.spot) throw new FxRateMissingError(currency);
    return {
      krwAmount: toKrw(input.amount, input.spot.rate),
      policyApplied: input.policy,
      rate: formatScaled(parseScaled(input.spot.rate, 6), 6),
      rateUnit: displayUnit,
      rateSource: input.spot.source,
      rateAt: input.spot.effectiveAt,
      provisional,
      spotRateId: input.spot.id ?? null,
    };
  };

  switch (input.policy) {
    case 'SPOT_AT_PAYMENT':
      return fromSpot(false);
    case 'FIXED': {
      if (!input.fixedRate) {
        throw new RangeError('FIXED 정책에는 고정 환율이 필요합니다');
      }
      return {
        krwAmount: foreignToKrw(input.amount, input.fixedRate, displayUnit),
        policyApplied: 'FIXED',
        rate: ratePerUnit(input.fixedRate, displayUnit),
        rateUnit: displayUnit,
        rateSource: FIXED_RATE_SOURCE,
        rateAt: input.fixedAt ?? null,
        provisional: false,
        spotRateId: null,
      };
    }
    case 'CARD_BILLED': {
      const billed = input.billedKrwAmount ?? input.providerKrwAmount ?? null;
      if (billed === null) return fromSpot(true);
      if (!Number.isSafeInteger(billed)) {
        throw new RangeError('카드사 원화 금액은 정수여야 합니다');
      }
      return {
        krwAmount: billed,
        policyApplied: 'CARD_BILLED',
        rate: null,
        rateUnit: null,
        rateSource: CARD_BILLED_SOURCE,
        rateAt: input.billedKrwAmount != null ? (input.billedAt ?? null) : null,
        provisional: input.billedKrwAmount == null,
        spotRateId: null,
      };
    }
  }
}
