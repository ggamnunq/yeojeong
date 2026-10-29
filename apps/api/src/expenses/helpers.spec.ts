import { Prisma } from '../generated/prisma/client.js';
import { afterCursor, decodeCursor, encodeCursor } from './cursor.js';
import {
  isDuplicatePair,
  merchantKeyOf,
  type DuplicateCandidate,
} from './duplicates.js';
import {
  addDays,
  dayIndexOf,
  kstDate,
  kstDayRange,
  periodSideOf,
  toKstIso,
  tripDays,
} from './kst.js';
import { displayUnitOf, refundKrw, resolveKrw, type KrwSource } from './krw.js';
import {
  isFullyCancelled,
  outOfPeriodWindow,
} from './out-of-period.service.js';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('KST helpers', () => {
  const period = { startDate: '2026-11-12', endDate: '2026-11-15' };

  it('formats instants in KST', () => {
    expect(toKstIso(new Date('2026-11-12T23:50:00Z'))).toBe(
      '2026-11-13T08:50:00+09:00',
    );
    expect(kstDate(new Date('2026-11-12T14:59:59Z'))).toBe('2026-11-12');
    expect(kstDate(new Date('2026-11-12T15:00:00Z'))).toBe('2026-11-13');
  });

  it('computes Day N and the period side', () => {
    expect(dayIndexOf('2026-11-12', period)).toBe(1);
    expect(dayIndexOf('2026-11-13', period)).toBe(2);
    expect(dayIndexOf('2026-11-16', period)).toBeNull();
    expect(periodSideOf('2026-11-11', period)).toBe('BEFORE');
    expect(periodSideOf('2026-11-16', period)).toBe('AFTER');
    expect(periodSideOf('2026-11-15', period)).toBeNull();
    expect(tripDays(period)).toBe(4);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('maps a KST day to an instant range', () => {
    expect(kstDayRange('2026-11-13')).toEqual({
      gte: new Date('2026-11-12T15:00:00Z'),
      lt: new Date('2026-11-13T15:00:00Z'),
    });
  });
});

describe('cursor', () => {
  it('round-trips and rejects garbage', () => {
    const cursor = {
      occurredAt: new Date('2026-11-13T05:10:00.123Z'),
      id: '6f1c1f6e-8a43-4f53-9a6b-1c2d3e4f5a6b',
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor('nope')).toBeNull();
    expect(
      decodeCursor(Buffer.from('{"o":"x","i":"y"}').toString('base64url')),
    ).toBeNull();
  });

  it('continues in the list direction', () => {
    const cursor = { occurredAt: new Date(0), id: 'i' };
    expect(afterCursor(cursor, 'desc')).toEqual({
      OR: [
        { occurredAt: { lt: new Date(0) } },
        { occurredAt: new Date(0), id: { lt: 'i' } },
      ],
    });
    expect(afterCursor(cursor, 'asc').OR?.[0]).toEqual({
      occurredAt: { gt: new Date(0) },
    });
  });
});

describe('duplicate pairs (4-1-5)', () => {
  const base: DuplicateCandidate = {
    id: 'a',
    payerMembershipId: 'subin',
    merchantKey: merchantKeyOf('오사카성 천수각'),
    originalCurrency: 'JPY',
    originalAmount: D('4800').toFixed(4),
    occurredAt: new Date('2026-11-13T01:30:00Z'),
  };

  it('normalizes merchant names like Transaction.merchantKey', () => {
    expect(merchantKeyOf(' Ｏｓａｋａ-Castle ')).toBe('OSAKACASTLE');
    expect(merchantKeyOf('오사카성 천수각')).toBe('오사카성천수각');
  });

  it('pairs different payers with the same merchant and amount within 2 minutes', () => {
    const other = {
      ...base,
      id: 'b',
      payerMembershipId: 'minji',
      occurredAt: new Date('2026-11-13T01:31:00Z'),
    };
    expect(isDuplicatePair(base, other)).toBe(true);
    expect(
      isDuplicatePair(base, { ...other, payerMembershipId: 'subin' }),
    ).toBe(false);
    expect(
      isDuplicatePair(base, {
        ...other,
        occurredAt: new Date('2026-11-13T01:32:01Z'),
      }),
    ).toBe(false);
    expect(
      isDuplicatePair(base, { ...other, originalAmount: D('4801').toFixed(4) }),
    ).toBe(false);
    expect(isDuplicatePair(base, { ...other, originalCurrency: 'USD' })).toBe(
      false,
    );
  });
});

describe('KRW conversion for out-of-period expenses', () => {
  const source = (over: Partial<KrwSource> = {}): KrwSource => ({
    originalAmount: D('5960'),
    originalCurrency: 'JPY',
    providerKrwAmount: null,
    billedKrwAmount: null,
    spotKrwAmount: null,
    spotRate: null,
    ...over,
  });
  const spot = {
    rate: D('9.192'),
    displayUnit: 100,
    source: '하나은행 매매기준율',
    effectiveAt: new Date(),
  };
  const trip = {
    currency: 'JPY',
    fxPolicy: 'SPOT_AT_PAYMENT' as const,
    fxFixedRate: null,
  };

  it('keeps KRW as is', () => {
    expect(
      resolveKrw(
        source({ originalCurrency: 'KRW', originalAmount: D('486000') }),
        trip,
      ),
    ).toEqual({
      krwAmount: 486000,
      fx: null,
    });
  });

  it('uses the spot rate with 10-won rounding', () => {
    expect(resolveKrw(source(), trip, spot)?.krwAmount).toBe(54780);
    expect(
      resolveKrw(source({ spotRate: spot, spotKrwAmount: 54780 }), trip)?.fx,
    ).toMatchObject({
      fxPolicyApplied: 'SPOT_AT_PAYMENT',
      fxRateUnit: 100,
    });
    expect(resolveKrw(source(), trip)).toBeNull();
  });

  it('uses the fixed rate per display unit for the trip currency', () => {
    const fixed = {
      ...trip,
      fxPolicy: 'FIXED' as const,
      fxFixedRate: D('919.20'),
    };
    expect(resolveKrw(source(), fixed)).toMatchObject({
      krwAmount: 54780,
      fx: { fxPolicyApplied: 'FIXED', fxRateUnit: 100 },
    });
    expect(displayUnitOf('USD')).toBe(1);
  });

  it('prefers the billed amount for CARD_BILLED', () => {
    const billed = { ...trip, fxPolicy: 'CARD_BILLED' as const };
    expect(
      resolveKrw(source({ billedKrwAmount: 55000 }), billed)?.krwAmount,
    ).toBe(55000);
    expect(resolveKrw(source(), billed, spot)?.fx?.fxPolicyApplied).toBe(
      'CARD_BILLED',
    );
  });

  it('replaces the fixed rate with the market rate for a currency that is neither KRW nor the trip currency (C-32)', () => {
    const usd = source({
      originalAmount: D('25.5'),
      originalCurrency: 'USD',
      billedKrwAmount: 36000,
      providerKrwAmount: 35500,
    });
    const usdSpot = {
      rate: D('1380.5'),
      displayUnit: 1,
      source: '한국수출입은행',
      effectiveAt: new Date('2026-11-13T00:00:00Z'),
    };
    const expected = {
      krwAmount: 35200, // 25.5 × 1380.5 = 35202.75 → 35200
      fx: {
        fxPolicyApplied: 'SPOT_AT_PAYMENT',
        fxRateUnit: 1,
        fxRateSource: '한국수출입은행',
        fxRateAt: usdSpot.effectiveAt,
      },
    };
    // 고정 환율 여정: 고정 환율(919.20/100엔)을 USD에 쓰지 않는다
    const fixed = {
      ...trip,
      fxPolicy: 'FIXED' as const,
      fxFixedRate: D('919.20'),
    };
    expect(resolveKrw(usd, fixed, usdSpot)).toMatchObject(expected);
    // 카드사 청구 원화 여정: 제3통화도 카드사 원화가 있으면 그 값, 없을 때만 시장 환율
    const billed = { ...trip, fxPolicy: 'CARD_BILLED' as const };
    expect(resolveKrw(usd, billed, usdSpot)).toMatchObject({
      krwAmount: 36000,
      fx: { fxPolicyApplied: 'CARD_BILLED', fxRate: null },
    });
    expect(
      resolveKrw(
        { ...usd, billedKrwAmount: null, providerKrwAmount: null },
        billed,
        usdSpot,
      ),
    ).toMatchObject({
      krwAmount: 35200,
      fx: {
        fxPolicyApplied: 'CARD_BILLED',
        fxRateUnit: 1,
        fxRateSource: '한국수출입은행',
      },
    });
    // 여정 통화는 그대로 여정 정책
    expect(
      resolveKrw(source({ billedKrwAmount: 55000 }), billed, spot)?.fx
        ?.fxPolicyApplied,
    ).toBe('CARD_BILLED');
  });

  it('computes refund children at the parent rate', () => {
    const parent = {
      krwAmount: 121330,
      originalAmount: D('13200'),
      originalCurrency: 'JPY',
    };
    expect(refundKrw(parent, D('-13200'))).toBe(-121330);
    expect(refundKrw(parent, D('-3300'))).toBe(-30330);
    expect(
      refundKrw(
        {
          krwAmount: 36000,
          originalAmount: D('36000'),
          originalCurrency: 'KRW',
        },
        D('-6000'),
      ),
    ).toBe(-6000);
  });

  it('skips fully cancelled transactions', () => {
    expect(
      isFullyCancelled(D('13200'), [{ originalAmount: D('-13200') }]),
    ).toBe(true);
    expect(isFullyCancelled(D('13200'), [{ originalAmount: D('-3300') }])).toBe(
      false,
    );
    expect(isFullyCancelled(D('13200'), [])).toBe(false);
  });

  it('computes the candidate windows', () => {
    const t = {
      startAt: new Date('2026-11-11T15:00:00Z'),
      autoEndAt: new Date('2026-11-15T14:59:59Z'),
    };
    expect(outOfPeriodWindow(t, 'BEFORE', new Date())).toEqual({
      gte: new Date('2026-09-12T15:00:00Z'),
      lt: t.startAt,
    });
    expect(
      outOfPeriodWindow(t, 'AFTER', new Date('2026-11-13T00:00:00Z')),
    ).toBeNull();
  });
});
