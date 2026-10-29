import { AppException } from '../common/errors/index.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CARD_BILLED_SOURCE, FIXED_RATE_SOURCE } from './convert.js';
import { FxRatesService, type TripFxPolicy } from './fx-rates.service.js';

// 여정 결제 환산의 통화 분기(디자인 결정 C-32): KRW·여정 통화는 여정 정책, 그 밖의 외화는 결제 시점 시장 환율.

const PAID_AT = new Date('2026-11-13T05:10:00Z');
const USD_AT = new Date('2026-11-13T02:00:00Z');
const SOURCE = '한국수출입은행';

interface Row {
  id: string;
  quoteCurrency: string;
  rate: string;
  source: string;
  effectiveAt: Date;
}

const RATES: Row[] = [
  {
    id: 'usd-1',
    quoteCurrency: 'USD',
    rate: '1380.5',
    source: SOURCE,
    effectiveAt: USD_AT,
  },
  {
    id: 'jpy-1',
    quoteCurrency: 'JPY',
    rate: '9.192',
    source: SOURCE,
    effectiveAt: USD_AT,
  },
];

function setup(rates: Row[] = RATES) {
  const findFirst = vi.fn(
    (args: {
      where: { quoteCurrency: string; effectiveAt?: { lte: Date } };
    }) => {
      const { quoteCurrency, effectiveAt } = args.where;
      const row = rates.find(
        (r) =>
          r.quoteCurrency === quoteCurrency &&
          (!effectiveAt || r.effectiveAt <= effectiveAt.lte),
      );
      return Promise.resolve(
        row
          ? {
              ...row,
              rate: new Prisma.Decimal(row.rate),
              displayUnit: 1,
              rateType: 'SPOT',
              fetchedAt: row.effectiveAt,
            }
          : null,
      );
    },
  );
  const prisma = { exchangeRate: { findFirst } };
  return {
    service: new FxRatesService(prisma as unknown as PrismaService),
    findFirst,
  };
}

const jpyTrip = (over: Partial<TripFxPolicy> = {}): TripFxPolicy => ({
  policy: 'SPOT_AT_PAYMENT',
  currency: 'JPY',
  fixedRate: null,
  fixedAt: null,
  ...over,
});
const FIXED_AT = new Date('2026-11-12T00:00:00Z');
const fixedTrip = jpyTrip({
  policy: 'FIXED',
  fixedRate: '900.00',
  fixedAt: FIXED_AT,
});

describe('FxRatesService.convertForTrip currency branch (C-32)', () => {
  it('keeps the fixed rate for the trip currency without looking up a spot rate', async () => {
    const { service, findFirst } = setup();
    const result = await service.convertForTrip(fixedTrip, {
      amount: '2860',
      currency: 'JPY',
      occurredAt: PAID_AT,
    });
    expect(result).toMatchObject({
      krwAmount: 25_740,
      policyApplied: 'FIXED',
      rate: '9.000000',
      rateUnit: 100,
      rateSource: FIXED_RATE_SOURCE,
      rateAt: FIXED_AT,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('keeps KRW unconverted in any trip', async () => {
    const { service, findFirst } = setup();
    const result = await service.convertForTrip(fixedTrip, {
      amount: '13200',
      currency: 'KRW',
      occurredAt: PAID_AT,
    });
    expect(result).toMatchObject({
      krwAmount: 13_200,
      policyApplied: null,
      rate: null,
      rateSource: null,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('converts a third currency in a fixed-rate trip with the market rate at payment time', async () => {
    const { service, findFirst } = setup();
    const result = await service.convertForTrip(fixedTrip, {
      amount: '25.5',
      currency: 'usd',
      occurredAt: PAID_AT,
    });
    expect(result).toEqual({
      krwAmount: 35_200, // 25.5 × 1380.5 = 35202.75 → 10원 반올림
      policyApplied: 'SPOT_AT_PAYMENT',
      rate: '1380.500000',
      rateUnit: 1,
      rateSource: SOURCE,
      rateAt: USD_AT,
      provisional: false,
      spotRateId: 'usd-1',
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { quoteCurrency: 'USD', effectiveAt: { lte: PAID_AT } },
      }),
    );
  });

  it('uses the card amount for a third currency in a card-billed trip, and the market rate only without it', async () => {
    const { service, findFirst } = setup();
    const billedTrip = jpyTrip({ policy: 'CARD_BILLED' });
    const billed = await service.convertForTrip(billedTrip, {
      amount: '25.5',
      currency: 'USD',
      occurredAt: PAID_AT,
      billedKrwAmount: 36_000,
      billedAt: PAID_AT,
      providerKrwAmount: 35_500,
    });
    expect(billed).toMatchObject({
      krwAmount: 36_000,
      policyApplied: 'CARD_BILLED',
      rate: null,
      rateSource: CARD_BILLED_SOURCE,
      rateAt: PAID_AT,
      provisional: false,
    });
    const provider = await service.convertForTrip(billedTrip, {
      amount: '25.5',
      currency: 'USD',
      occurredAt: PAID_AT,
      providerKrwAmount: 35_500,
    });
    expect(provider).toMatchObject({
      krwAmount: 35_500,
      policyApplied: 'CARD_BILLED',
      provisional: true,
    });
    expect(findFirst).not.toHaveBeenCalled();

    // 카드사 원화가 없으면(직접 입력·지갑 연결) 시장 환율, 청구 확정 전 임시값
    const market = await service.convertForTrip(billedTrip, {
      amount: '25.5',
      currency: 'USD',
      occurredAt: PAID_AT,
    });
    expect(market).toMatchObject({
      krwAmount: 35_200,
      policyApplied: 'CARD_BILLED',
      rate: '1380.500000',
      rateUnit: 1,
      rateSource: SOURCE,
      rateAt: USD_AT,
      provisional: true,
      spotRateId: 'usd-1',
    });

    // 여정 통화도 같다(토스 연동 인입 동작 유지)
    const jpy = await service.convertForTrip(billedTrip, {
      amount: '2860',
      currency: 'JPY',
      occurredAt: PAID_AT,
      providerKrwAmount: 26_500,
    });
    expect(jpy).toMatchObject({
      krwAmount: 26_500,
      policyApplied: 'CARD_BILLED',
      rateSource: CARD_BILLED_SOURCE,
      provisional: true,
    });
  });

  it('treats every foreign currency of a KRW trip as a third currency', async () => {
    const { service } = setup();
    const result = await service.convertForTrip(
      jpyTrip({ currency: 'KRW', policy: 'SPOT_AT_PAYMENT' }),
      { amount: '10', currency: 'USD', occurredAt: PAID_AT },
    );
    expect(result).toMatchObject({
      krwAmount: 13_810,
      policyApplied: 'SPOT_AT_PAYMENT',
    });
  });

  it('throws FX_RATE_UNAVAILABLE when a third currency has no rate at all', async () => {
    const { service } = setup([]);
    const error = await service
      .convertForTrip(fixedTrip, {
        amount: '10',
        currency: 'EUR',
        occurredAt: PAID_AT,
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('FX_RATE_UNAVAILABLE');
  });
});
