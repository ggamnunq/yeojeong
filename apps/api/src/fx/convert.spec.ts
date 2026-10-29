import { toKrw } from '@yeojeong/shared';
import {
  CARD_BILLED_SOURCE,
  convertToKrw,
  displayRate,
  divRoundHalfUp,
  FIXED_RATE_SOURCE,
  foreignToKrw,
  formatScaled,
  FxRateMissingError,
  fxRateLabel,
  krwAmountOf,
  normalizeFixedRate,
  parseScaled,
  ratePerUnit,
  withThousands,
} from './convert.js';
import { currencyMeta } from './currencies.js';

const spot = {
  id: 'rate-1',
  rate: '9.192000',
  source: '하나은행 매매기준율',
  effectiveAt: new Date('2026-11-13T09:00:00Z'),
};

describe('decimal helpers', () => {
  it('parses and formats scaled decimals without floats', () => {
    expect(parseScaled('12.5', 4)).toBe(125_000n);
    expect(parseScaled('-0.0001', 4)).toBe(-1n);
    expect(parseScaled('9.192000000', 6)).toBe(9_192_000n); // 넘치는 자리가 0이면 허용
    expect(() => parseScaled('9.1920001', 6)).toThrow(RangeError);
    expect(() => parseScaled('1e3', 4)).toThrow(RangeError);
    expect(formatScaled(125_000n, 4)).toBe('12.5000');
    expect(formatScaled(-1n, 4)).toBe('-0.0001');
    expect(formatScaled(5n, 0)).toBe('5');
  });

  it('rounds half away from zero', () => {
    expect(divRoundHalfUp(15n, 10n)).toBe(2n);
    expect(divRoundHalfUp(14n, 10n)).toBe(1n);
    expect(divRoundHalfUp(-15n, 10n)).toBe(-2n);
    expect(() => divRoundHalfUp(1n, 0n)).toThrow(RangeError);
  });
});

describe('foreign → KRW (4-5, FR-808)', () => {
  it('rounds to 10 won half-up and matches shared toKrw', () => {
    expect(foreignToKrw('5960', '9.192')).toBe(54_780); // 54,784.32
    expect(foreignToKrw('2860', '9.192')).toBe(26_290); // 26,289.12 (FR-808 #1)
    expect(foreignToKrw('5', '1')).toBe(10); // 5 → 10 (half-up)
    expect(foreignToKrw('4.9999', '1')).toBe(0);
    expect(foreignToKrw('-5960', '9.192')).toBe(-54_780); // 취소 자식
    for (const [amount, rate] of [
      ['12.5', '1380.5'],
      ['-3', '0.0551'],
      ['999999', '9.19256'],
    ]) {
      expect(foreignToKrw(amount, rate)).toBe(toKrw(amount, rate));
    }
  });

  it('divides by the display unit for rates quoted per 100', () => {
    expect(foreignToKrw('2860', '900.00', 100)).toBe(25_740); // FR-808 #2
    expect(() => foreignToKrw('1', '1', 0)).toThrow(RangeError);
  });

  it('keeps KRW as is (1 won rounding only if decimals sneak in)', () => {
    expect(krwAmountOf('13200')).toBe(13_200);
    expect(krwAmountOf('13200.0000')).toBe(13_200);
    expect(krwAmountOf('-4500')).toBe(-4_500);
    expect(krwAmountOf('0.5')).toBe(1);
  });
});

describe('convertToKrw policies', () => {
  const base = { amount: '2860', currency: 'JPY' };

  it('SPOT_AT_PAYMENT uses the rate at payment time', () => {
    expect(convertToKrw({ ...base, policy: 'SPOT_AT_PAYMENT', spot })).toEqual({
      krwAmount: 26_290,
      policyApplied: 'SPOT_AT_PAYMENT',
      rate: '9.192000',
      rateUnit: 100,
      rateSource: '하나은행 매매기준율',
      rateAt: spot.effectiveAt,
      provisional: false,
      spotRateId: 'rate-1',
    });
    expect(() =>
      convertToKrw({ ...base, policy: 'SPOT_AT_PAYMENT', spot: null }),
    ).toThrow(FxRateMissingError);
  });

  it('FIXED uses the leader rate per display unit', () => {
    const fixedAt = new Date('2026-11-14T01:00:00Z');
    expect(
      convertToKrw({ ...base, policy: 'FIXED', fixedRate: '900.00', fixedAt }),
    ).toEqual({
      krwAmount: 25_740,
      policyApplied: 'FIXED',
      rate: '9.000000',
      rateUnit: 100,
      rateSource: FIXED_RATE_SOURCE,
      rateAt: fixedAt,
      provisional: false,
      spotRateId: null,
    });
    expect(
      convertToKrw({
        amount: '12.50',
        currency: 'USD',
        policy: 'FIXED',
        fixedRate: '1380.50',
      }).krwAmount,
    ).toBe(17_260); // 17,256.25
    expect(() => convertToKrw({ ...base, policy: 'FIXED' })).toThrow(
      RangeError,
    );
  });

  it('CARD_BILLED prefers the billed amount, then the provider amount, then spot (provisional)', () => {
    const billedAt = new Date('2026-11-20T00:00:00Z');
    expect(
      convertToKrw({
        ...base,
        policy: 'CARD_BILLED',
        billedKrwAmount: 26_513,
        billedAt,
        providerKrwAmount: 26_400,
        spot,
      }),
    ).toMatchObject({
      krwAmount: 26_513,
      policyApplied: 'CARD_BILLED',
      rate: null,
      rateSource: CARD_BILLED_SOURCE,
      rateAt: billedAt,
      provisional: false,
    });
    expect(
      convertToKrw({
        ...base,
        policy: 'CARD_BILLED',
        providerKrwAmount: 26_400,
        spot,
      }),
    ).toMatchObject({ krwAmount: 26_400, rateAt: null, provisional: true });
    expect(
      convertToKrw({ ...base, policy: 'CARD_BILLED', spot }),
    ).toMatchObject({
      krwAmount: 26_290,
      policyApplied: 'CARD_BILLED',
      rate: '9.192000',
      provisional: true,
    });
    expect(() => convertToKrw({ ...base, policy: 'CARD_BILLED' })).toThrow(
      FxRateMissingError,
    );
  });

  it('does not convert KRW payments under any policy', () => {
    for (const policy of ['SPOT_AT_PAYMENT', 'CARD_BILLED', 'FIXED'] as const) {
      expect(
        convertToKrw({ amount: '13200', currency: 'krw', policy }),
      ).toMatchObject({
        krwAmount: 13_200,
        policyApplied: null,
        rate: null,
        rateSource: null,
      });
    }
  });
});

describe('display rule (4-5 표시, 화면명세 0-5)', () => {
  it('shows the rate per display unit with two decimals', () => {
    expect(displayRate('9.192', 100)).toBe('919.20');
    expect(displayRate('9.19256', 100)).toBe('919.26');
    expect(displayRate('1380.5', 1)).toBe('1380.50');
    expect(fxRateLabel('JPY', '9.192000')).toBe('100엔 = 919.20원');
    expect(fxRateLabel('USD', '1380.5')).toBe('1달러 = 1,380.50원');
    expect(fxRateLabel('VND', '0.0551')).toBe('100동 = 5.51원');
    expect(fxRateLabel('XTS', '2')).toBe('1XTS = 2.00원');
  });

  it('converts between per-unit and per-display-unit rates', () => {
    expect(ratePerUnit('919.20', 100)).toBe('9.192000');
    expect(ratePerUnit('1380.50', 1)).toBe('1380.500000');
    expect(withThousands('1234567.89')).toBe('1,234,567.89');
    expect(withThousands('919')).toBe('919');
  });

  it('knows display units and Korean names', () => {
    expect(currencyMeta('jpy')).toEqual({
      code: 'JPY',
      nameKo: '엔',
      displayUnit: 100,
      fractionDigits: 0,
    });
    expect(currencyMeta('USD').fractionDigits).toBe(2);
    expect(currencyMeta('VND').fractionDigits).toBe(0);
    expect(currencyMeta('IDR').displayUnit).toBe(100);
    expect(currencyMeta('USD').displayUnit).toBe(1);
    expect(currencyMeta('ABC')).toEqual({
      code: 'ABC',
      nameKo: 'ABC',
      displayUnit: 1,
      fractionDigits: 2,
    });
  });

  it('normalizes the leader fixed rate', () => {
    expect(normalizeFixedRate('919.2')).toBe('919.20');
    expect(normalizeFixedRate(' 900 ')).toBe('900.00');
    expect(normalizeFixedRate('0')).toBeNull();
    expect(normalizeFixedRate('0.00')).toBeNull();
    expect(normalizeFixedRate('1.234')).toBeNull();
    expect(normalizeFixedRate('-1')).toBeNull();
    expect(normalizeFixedRate('abc')).toBeNull();
  });
});
