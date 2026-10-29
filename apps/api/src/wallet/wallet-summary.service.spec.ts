import { SpotRateTable } from '../fx/fx-rates.service.js';
import {
  kstMonthRange,
  monthTotalOf,
  walletEntryWhere,
  type MonthAggregate,
} from './wallet-summary.service.js';

const at = (iso: string) => new Date(iso);

describe('kstMonthRange', () => {
  it('starts at KST midnight on the 1st (UTC 15:00 of the previous day)', () => {
    expect(kstMonthRange(at('2026-11-13T05:00:00Z'))).toEqual({
      gte: at('2026-10-31T15:00:00Z'),
      lt: at('2026-11-30T15:00:00Z'),
    });
  });

  it('switches month exactly at KST midnight, not UTC midnight', () => {
    // 10.31 23:59:59.999 KST → 10월
    expect(kstMonthRange(at('2026-10-31T14:59:59.999Z')).gte).toEqual(
      at('2026-09-30T15:00:00Z'),
    );
    // 11.01 00:00 KST(UTC로는 아직 10.31) → 11월
    expect(kstMonthRange(at('2026-10-31T15:00:00Z')).gte).toEqual(
      at('2026-10-31T15:00:00Z'),
    );
    // UTC 11.01 00:00 = KST 11.01 09:00 → 11월
    expect(kstMonthRange(at('2026-11-01T00:00:00Z')).gte).toEqual(
      at('2026-10-31T15:00:00Z'),
    );
  });

  it('rolls over the year in December', () => {
    expect(kstMonthRange(at('2026-12-31T14:59:59Z'))).toEqual({
      gte: at('2026-11-30T15:00:00Z'),
      lt: at('2026-12-31T15:00:00Z'),
    });
    expect(kstMonthRange(at('2026-12-31T15:00:00Z')).gte).toEqual(
      at('2026-12-31T15:00:00Z'),
    );
  });
});

describe('walletEntryWhere', () => {
  it('matches the wallet list: own entries without account/card duplicates', () => {
    expect(walletEntryWhere('u1')).toEqual({
      userId: 'u1',
      sameUserDuplicateOfId: null,
    });
  });
});

describe('monthTotalOf', () => {
  // 1달러 1,400원, 1엔 9.192원
  const rates = new SpotRateTable(
    new Map([
      [
        'USD',
        [
          {
            rate: '1400',
            source: 'test',
            effectiveAt: at('2026-11-01T00:00:00Z'),
          },
        ],
      ],
      [
        'JPY',
        [
          {
            rate: '9.192',
            source: 'test',
            effectiveAt: at('2026-11-01T00:00:00Z'),
          },
        ],
      ],
    ]),
  );
  const base: MonthAggregate = {
    pricedKrw: 0,
    spotEstimatedCount: 0,
    unpriced: [],
  };

  it('is exact when every entry already has a firm KRW amount', () => {
    expect(monthTotalOf({ ...base, pricedKrw: 412_350 }, null)).toEqual({
      monthTotalKrw: 412_350,
      monthTotalEstimated: false,
    });
  });

  it('is zero and exact for an empty month', () => {
    expect(monthTotalOf(base, null)).toEqual({
      monthTotalKrw: 0,
      monthTotalEstimated: false,
    });
  });

  it('flags stored spot estimates as estimated', () => {
    expect(
      monthTotalOf({ ...base, pricedKrw: 10_000, spotEstimatedCount: 1 }, null),
    ).toEqual({ monthTotalKrw: 10_000, monthTotalEstimated: true });
  });

  it('estimates unpriced foreign entries at the payment-time spot rate (10원 반올림)', () => {
    const result = monthTotalOf(
      {
        ...base,
        pricedKrw: 5_000,
        unpriced: [
          {
            amount: '12.3400',
            currency: 'USD',
            occurredAt: at('2026-11-02T00:00:00Z'),
          },
        ],
      },
      rates,
    );
    // 12.34 × 1400 = 17,276 → 17,280
    expect(result).toEqual({
      monthTotalKrw: 22_280,
      monthTotalEstimated: true,
    });
  });

  it('offsets cancellations (negative amounts) in estimates', () => {
    const result = monthTotalOf(
      {
        ...base,
        unpriced: [
          {
            amount: '1000.0000',
            currency: 'JPY',
            occurredAt: at('2026-11-02T00:00:00Z'),
          },
          {
            amount: '-1000.0000',
            currency: 'JPY',
            occurredAt: at('2026-11-03T00:00:00Z'),
          },
        ],
      },
      rates,
    );
    expect(result).toEqual({ monthTotalKrw: 0, monthTotalEstimated: true });
  });

  it('leaves out entries without any published rate but still flags estimated', () => {
    const result = monthTotalOf(
      {
        ...base,
        pricedKrw: 7_000,
        unpriced: [
          {
            amount: '50.0000',
            currency: 'CHF',
            occurredAt: at('2026-11-02T00:00:00Z'),
          },
        ],
      },
      rates,
    );
    expect(result).toEqual({ monthTotalKrw: 7_000, monthTotalEstimated: true });
  });
});
