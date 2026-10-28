import { toKrw, type FxPolicy } from '@yeojeong/shared';
import { Prisma } from '../generated/prisma/client.js';

// 기간 외 결제를 장부에 넣을 때의 원화 환산(기능명세 4-5). 환율 모듈(fx, S2C)이 생기면 그 서비스로 바꾼다.
// 정책: KRW는 그대로, FIXED는 고정 환율(여행 통화일 때), CARD_BILLED는 청구 확정 원화, 그 밖은 결제 시점 매매기준율.

/** 고시 단위가 100인 통화(100엔 = 919.20원) */
const HUNDRED_UNIT_CURRENCIES = new Set(['JPY', 'IDR', 'VND']);

export function displayUnitOf(currency: string): number {
  return HUNDRED_UNIT_CURRENCIES.has(currency) ? 100 : 1;
}

export interface FxSnapshot {
  fxPolicyApplied: FxPolicy;
  /** 1단위당 원. 청구 확정 원화처럼 환율이 없으면 null */
  fxRate: Prisma.Decimal | null;
  fxRateUnit: number | null;
  fxRateSource: string | null;
  fxRateAt: Date | null;
}

export interface KrwResult {
  krwAmount: number;
  /** KRW 결제면 null */
  fx: FxSnapshot | null;
}

export interface RateQuote {
  /** 1단위당 원 */
  rate: Prisma.Decimal;
  displayUnit: number;
  source: string;
  effectiveAt: Date;
}

export interface KrwSource {
  originalAmount: Prisma.Decimal;
  originalCurrency: string;
  providerKrwAmount: number | null;
  billedKrwAmount: number | null;
  spotKrwAmount: number | null;
  /** Transaction.spotRate(인입 때 잡은 결제 시점 매매기준율) */
  spotRate: RateQuote | null;
}

export interface TripFx {
  currency: string;
  fxPolicy: FxPolicy;
  /** 고시 단위당 원 */
  fxFixedRate: Prisma.Decimal | null;
}

/** toKrw가 받는 형식("-13200.5", 소수 4자리 이하) */
function amountString(amount: Prisma.Decimal): string {
  return amount.toDecimalPlaces(4).toFixed();
}

/**
 * 원화와 환율 스냅샷을 정한다. 환율을 알 수 없으면 null(호출하는 쪽이 ExchangeRate를 찾아 rateQuote로 다시 부른다).
 */
export function resolveKrw(
  source: KrwSource,
  trip: TripFx,
  rateQuote: RateQuote | null = null,
): KrwResult | null {
  if (source.originalCurrency === 'KRW') {
    return {
      krwAmount: source.originalAmount.toDecimalPlaces(0).toNumber(),
      fx: null,
    };
  }
  const amount = amountString(source.originalAmount);

  if (
    trip.fxPolicy === 'FIXED' &&
    trip.fxFixedRate &&
    source.originalCurrency === trip.currency
  ) {
    const unit = displayUnitOf(trip.currency);
    const perUnit = trip.fxFixedRate.div(unit).toDecimalPlaces(6);
    return {
      krwAmount: toKrw(amount, perUnit.toFixed()),
      fx: {
        fxPolicyApplied: 'FIXED',
        fxRate: perUnit,
        fxRateUnit: unit,
        fxRateSource: '고정 환율',
        fxRateAt: null,
      },
    };
  }

  if (trip.fxPolicy === 'CARD_BILLED') {
    const billed = source.billedKrwAmount ?? source.providerKrwAmount;
    if (billed !== null) {
      return {
        krwAmount: billed,
        fx: {
          fxPolicyApplied: 'CARD_BILLED',
          fxRate: null,
          fxRateUnit: null,
          fxRateSource: '카드사 청구 환율',
          fxRateAt: null,
        },
      };
    }
  }

  // 결제 시점 매매기준율(CARD_BILLED 청구 전 임시값 포함)
  const policy: FxPolicy =
    trip.fxPolicy === 'CARD_BILLED' ? 'CARD_BILLED' : 'SPOT_AT_PAYMENT';
  const quote = source.spotRate ?? rateQuote;
  if (quote) {
    return {
      krwAmount:
        source.spotRate && source.spotKrwAmount !== null
          ? source.spotKrwAmount
          : toKrw(amount, quote.rate.toDecimalPlaces(6).toFixed()),
      fx: {
        fxPolicyApplied: policy,
        fxRate: quote.rate,
        fxRateUnit: quote.displayUnit,
        fxRateSource: quote.source,
        fxRateAt: quote.effectiveAt,
      },
    };
  }
  if (source.spotKrwAmount !== null || source.providerKrwAmount !== null) {
    return {
      krwAmount: (source.spotKrwAmount ?? source.providerKrwAmount) as number,
      fx: {
        fxPolicyApplied: policy,
        fxRate: null,
        fxRateUnit: null,
        fxRateSource: null,
        fxRateAt: null,
      },
    };
  }
  return null;
}

/**
 * 취소 자식 원화(4-1-4 5단계): 부모와 같은 환율. 외화 = −roundTo10(부모 krw × |취소 원통화| / 부모 원통화),
 * KRW = 취소 금액 그대로. 전액 취소면 정확히 −부모 krw.
 */
export function refundKrw(
  parent: {
    krwAmount: number;
    originalAmount: Prisma.Decimal;
    originalCurrency: string;
  },
  cancelOriginalAmount: Prisma.Decimal,
): number {
  const cancelAbs = cancelOriginalAmount.abs();
  if (parent.originalCurrency === 'KRW') {
    return -cancelAbs.toDecimalPlaces(0).toNumber();
  }
  if (parent.originalAmount.isZero()) return 0;
  if (cancelAbs.gte(parent.originalAmount.abs())) return -parent.krwAmount;
  const tens = new Prisma.Decimal(parent.krwAmount)
    .mul(cancelAbs)
    .div(parent.originalAmount.abs())
    .div(10)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  return -tens.mul(10).toNumber();
}
