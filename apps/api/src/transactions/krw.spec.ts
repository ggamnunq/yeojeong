import { computeKrw, displayUnitOf, type TripFx } from './krw.js';

const spotTrip: TripFx = { fxPolicy: 'SPOT_AT_PAYMENT', fxFixedRate: null, fxPolicyChangedAt: null };
const yen = (amount: string, extra: Partial<Parameters<typeof computeKrw>[0]> = {}) => ({
  originalAmount: amount,
  originalCurrency: 'JPY',
  providerKrwAmount: null,
  billedKrwAmount: null,
  ...extra,
});
const hana = { rate: '9.192', displayUnit: 100, source: '하나은행 매매기준율', effectiveAt: new Date('2026-11-12T09:00:00Z') };

describe('computeKrw (4-5)', () => {
  it('uses the KRW amount as is', () => {
    expect(
      computeKrw({ originalAmount: '486000.0000', originalCurrency: 'KRW', providerKrwAmount: null, billedKrwAmount: null }, spotTrip, null),
    ).toMatchObject({ krwAmount: 486000, fxPolicyApplied: null, fxRate: null });
  });

  it('SPOT: original × rate, rounded to 10 won (¥5,960 → ₩54,780, ¥2,860 → ₩26,290)', () => {
    expect(computeKrw(yen('5960'), spotTrip, hana)).toMatchObject({
      krwAmount: 54780,
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
      fxRate: '9.192000',
      fxRateUnit: 100,
      fxRateSource: '하나은행 매매기준율',
    });
    expect(computeKrw(yen('2860'), spotTrip, hana)?.krwAmount).toBe(26290);
  });

  it('SPOT without a rate falls back to the provider KRW, else null (retry later)', () => {
    expect(computeKrw(yen('1280', { providerKrwAmount: 11770 }), spotTrip, null)).toMatchObject({
      krwAmount: 11770,
      fxRateSource: '제공자 원화',
    });
    expect(computeKrw(yen('1280'), spotTrip, null)).toBeNull();
  });

  it('FIXED: per display unit (100엔 = 900.00원 → MK택시 ₩25,740, FR-808 AC2)', () => {
    const fixed: TripFx = { fxPolicy: 'FIXED', fxFixedRate: '900.00', fxPolicyChangedAt: new Date('2026-11-13T00:00:00Z') };
    expect(computeKrw(yen('2860'), fixed, hana)).toMatchObject({
      krwAmount: 25740,
      fxPolicyApplied: 'FIXED',
      fxRate: '9.000000',
      fxRateUnit: 100,
    });
  });

  it('CARD_BILLED: billed → provider KRW → spot', () => {
    const billed: TripFx = { fxPolicy: 'CARD_BILLED', fxFixedRate: null, fxPolicyChangedAt: null };
    expect(computeKrw(yen('2860', { billedKrwAmount: 26600, providerKrwAmount: 26290 }), billed, hana)).toMatchObject({
      krwAmount: 26600,
      fxRateSource: '카드사 청구',
    });
    expect(computeKrw(yen('2860', { providerKrwAmount: 26290 }), billed, hana)?.krwAmount).toBe(26290);
    expect(computeKrw(yen('2860'), billed, hana)).toMatchObject({ krwAmount: 26290, fxPolicyApplied: 'CARD_BILLED' });
  });

  it('knows the display units', () => {
    expect(displayUnitOf('JPY')).toBe(100);
    expect(displayUnitOf('USD')).toBe(1);
  });
});
