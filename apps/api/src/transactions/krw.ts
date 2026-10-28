import type { FxPolicy } from '@yeojeong/shared';
import { absScaled, roundTo10, roundToWon, toScaled } from './import-rules.js';

// 인입 시점 원화 계산(기능명세 4-5). 환율 수집·정책 변경·재계산(FR-806~808)은 S2C(fx) 몫이고,
// 여기서는 인입할 때 Expense.krwAmount(NOT NULL)를 채우는 데 필요한 만큼만 계산한다.
// S2C가 fx 서비스를 만들면 computeKrw를 그쪽 함수로 바꾼다.

/** 고시 단위: JPY·IDR·VND = 100, 그 외 1 */
export function displayUnitOf(currency: string): number {
  return ['JPY', 'IDR', 'VND'].includes(currency) ? 100 : 1;
}

export interface KrwInput {
  /** 원통화 금액(부호 무시) */
  originalAmount: string;
  originalCurrency: string;
  providerKrwAmount: number | null;
  billedKrwAmount: number | null;
}

export interface TripFx {
  fxPolicy: FxPolicy;
  /** 고시 단위당 원(100엔당 919.20 → "919.2") */
  fxFixedRate: string | null;
  fxPolicyChangedAt: Date | null;
}

/** ExchangeRate 한 행: rate는 1단위당 원 */
export interface SpotRate {
  rate: string;
  displayUnit: number;
  source: string;
  effectiveAt: Date;
}

export interface KrwResult {
  krwAmount: number;
  fxPolicyApplied: FxPolicy | null;
  /** 1단위당 원(ExchangeRate.rate와 같은 기준). 제공자 원화를 그대로 쓰면 null */
  fxRate: string | null;
  fxRateUnit: number | null;
  fxRateSource: string | null;
  fxRateAt: Date | null;
}

const RATE_SCALE = 6;

function scaledRate(rate: string): bigint {
  const [int, frac = ''] = rate.trim().split('.');
  if (!/^\d+$/.test(int) || !/^\d*$/.test(frac)) {
    throw new RangeError('환율 형식이 아닙니다');
  }
  const trimmed = frac.replace(/0+$/, '');
  if (trimmed.length > RATE_SCALE) throw new RangeError('환율 소수 6자리 초과');
  return (
    BigInt(int) * 10n ** BigInt(RATE_SCALE) +
    BigInt(trimmed.padEnd(RATE_SCALE, '0'))
  );
}

function rateToString(scaled: bigint): string {
  const factor = 10n ** BigInt(RATE_SCALE);
  const frac = (scaled % factor).toString().padStart(RATE_SCALE, '0');
  return `${scaled / factor}.${frac}`;
}

/** 원통화 × 환율(÷ 고시 단위) → 10원 반올림 */
function convert(amount: string, rate: string, unit: number): number {
  const numerator = absScaled(toScaled(amount)) * scaledRate(rate);
  // 금액 소수 4자리 × 환율 소수 6자리
  return roundTo10(numerator, 10n ** 10n * BigInt(unit));
}

/**
 * 여정 환율 정책으로 이 거래의 원화를 정한다. 계산할 수 없으면 null(다음 동기화에서 다시 시도).
 * - KRW: 금액 그대로(반올림 없음)
 * - FIXED: 원통화 × 고정 환율 ÷ 고시 단위, 10원 반올림
 * - CARD_BILLED: 청구 확정 원화 → 제공자 원화 → (없으면) SPOT
 * - SPOT_AT_PAYMENT: occurredAt 직전 매매기준율 × 원통화, 10원 반올림. 고시가 없으면 제공자 원화(임시)
 */
export function computeKrw(
  input: KrwInput,
  trip: TripFx,
  spot: SpotRate | null,
  now: Date = new Date(),
): KrwResult | null {
  if (input.originalCurrency === 'KRW') {
    return {
      krwAmount: roundToWon(absScaled(toScaled(input.originalAmount))),
      fxPolicyApplied: null,
      fxRate: null,
      fxRateUnit: null,
      fxRateSource: null,
      fxRateAt: null,
    };
  }
  const unit = displayUnitOf(input.originalCurrency);

  if (trip.fxPolicy === 'FIXED' && trip.fxFixedRate) {
    const perUnit = scaledRate(trip.fxFixedRate) / BigInt(unit);
    return {
      krwAmount: convert(input.originalAmount, trip.fxFixedRate, unit),
      fxPolicyApplied: 'FIXED',
      fxRate: rateToString(perUnit),
      fxRateUnit: unit,
      fxRateSource: '고정 환율',
      fxRateAt: trip.fxPolicyChangedAt ?? now,
    };
  }

  if (trip.fxPolicy === 'CARD_BILLED') {
    const billed = input.billedKrwAmount ?? input.providerKrwAmount;
    if (billed !== null) {
      return {
        krwAmount: Math.abs(billed),
        fxPolicyApplied: 'CARD_BILLED',
        fxRate: null,
        fxRateUnit: null,
        fxRateSource:
          input.billedKrwAmount !== null ? '카드사 청구' : '제공자 원화',
        fxRateAt: null,
      };
    }
  }

  if (spot) {
    return {
      krwAmount: convert(input.originalAmount, spot.rate, 1),
      fxPolicyApplied: trip.fxPolicy,
      fxRate: rateToString(scaledRate(spot.rate)),
      fxRateUnit: spot.displayUnit,
      fxRateSource: spot.source,
      fxRateAt: spot.effectiveAt,
    };
  }
  if (input.providerKrwAmount !== null) {
    return {
      krwAmount: Math.abs(input.providerKrwAmount),
      fxPolicyApplied: trip.fxPolicy,
      fxRate: null,
      fxRateUnit: null,
      fxRateSource: '제공자 원화',
      fxRateAt: null,
    };
  }
  return null;
}
