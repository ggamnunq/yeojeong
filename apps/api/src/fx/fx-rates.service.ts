import { Injectable } from '@nestjs/common';
import type { FxPolicy, FxRateView } from '@yeojeong/shared';
import { AppException } from '../common/errors/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  convertToKrw,
  displayRate,
  FxRateMissingError,
  fxRateLabel,
  type ConvertResult,
  type FxSpotRate,
} from './convert.js';
import { currencyMeta, KRW } from './currencies.js';
import { toKstIso } from './kst.js';

type Db = PrismaService | Prisma.TransactionClient;

const RATE_SELECT = {
  id: true,
  quoteCurrency: true,
  rate: true,
  displayUnit: true,
  rateType: true,
  source: true,
  effectiveAt: true,
  fetchedAt: true,
} as const satisfies Prisma.ExchangeRateSelect;

type RateRow = Prisma.ExchangeRateGetPayload<{ select: typeof RATE_SELECT }>;

/** 결제 한 건의 환산 입력(인입·재계산 공통) */
export interface ExpenseFxInput {
  amount: string;
  currency: string;
  occurredAt: Date;
  billedKrwAmount?: number | null;
  billedAt?: Date | null;
  providerKrwAmount?: number | null;
}

/** 여정의 환율 적용 기준(Trip.fxPolicy·fxFixedRate·fxPolicyChangedAt) */
export interface TripFxPolicy {
  policy: FxPolicy;
  /** 고시 단위당 원 */
  fixedRate: string | null;
  fixedAt: Date | null;
}

/** 시각 → 직전 고시를 빠르게 찾는 표(재계산처럼 여러 건을 한 번에 환산할 때) */
export class SpotRateTable {
  constructor(private readonly byCurrency: Map<string, FxSpotRate[]>) {}

  /** effectiveAt ≤ at인 가장 최근 고시. 없으면(서비스 첫 고시 이전) 가장 이른 고시 */
  find(currency: string, at: Date): FxSpotRate | null {
    const rates = this.byCurrency.get(currency);
    if (!rates || rates.length === 0) return null;
    const time = at.getTime();
    let low = 0;
    let high = rates.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (rates[mid].effectiveAt.getTime() <= time) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return rates[found === -1 ? 0 : found];
  }
}

function toSpot(row: RateRow): FxSpotRate {
  return {
    id: row.id,
    rate: row.rate.toFixed(6),
    source: row.source,
    effectiveAt: row.effectiveAt,
  };
}

/** 환율 조회와 결제 환산. 인입(S2B)·재계산·잡이 이 서비스를 쓴다 */
@Injectable()
export class FxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 결제 시점 매매기준율(기능명세 4-5 SPOT): effectiveAt ≤ at인 가장 최근 고시(주말·공휴일은 직전 고시).
   * 그런 고시가 없으면(서비스가 고시를 모으기 전 결제) 가장 이른 고시를 쓴다. 고시가 하나도 없으면 null.
   */
  async findSpotRate(
    currency: string,
    at: Date,
    db: Db = this.prisma,
  ): Promise<FxSpotRate | null> {
    const quoteCurrency = currency.toUpperCase();
    const before = await db.exchangeRate.findFirst({
      where: { quoteCurrency, effectiveAt: { lte: at } },
      orderBy: [{ effectiveAt: 'desc' }, { fetchedAt: 'desc' }],
      select: RATE_SELECT,
    });
    if (before) return toSpot(before);
    const after = await db.exchangeRate.findFirst({
      where: { quoteCurrency },
      orderBy: [{ effectiveAt: 'asc' }, { fetchedAt: 'desc' }],
      select: RATE_SELECT,
    });
    return after ? toSpot(after) : null;
  }

  /** 여러 결제를 한 번에 환산할 때 쓰는 고시 표. [from, to] 구간과 그 직전 고시 1건을 읽는다 */
  async loadSpotTable(
    currencies: readonly string[],
    from: Date,
    to: Date,
    db: Db = this.prisma,
  ): Promise<SpotRateTable> {
    const byCurrency = new Map<string, FxSpotRate[]>();
    for (const currency of new Set(currencies.map((c) => c.toUpperCase()))) {
      if (currency === KRW) continue;
      const anchor = await this.findSpotRate(currency, from, db);
      const inRange = await db.exchangeRate.findMany({
        where: { quoteCurrency: currency, effectiveAt: { gt: from, lte: to } },
        orderBy: [{ effectiveAt: 'asc' }, { fetchedAt: 'asc' }],
        select: RATE_SELECT,
      });
      const rates = [...(anchor ? [anchor] : []), ...inRange.map(toSpot)].sort(
        (a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime(),
      );
      byCurrency.set(currency, rates);
    }
    return new SpotRateTable(byCurrency);
  }

  /**
   * 여정 기준으로 결제 한 건의 원화를 정한다. 인입(S2B)은 이 함수의 결과를 Expense.krwAmount와 fx 스냅샷 컬럼에 넣는다.
   * @throws AppException FX_RATE_UNAVAILABLE(503) 매매기준율이 필요한데 고시가 하나도 없을 때
   */
  async convertForTrip(
    trip: TripFxPolicy,
    expense: ExpenseFxInput,
    db: Db = this.prisma,
  ): Promise<ConvertResult> {
    const needsSpot =
      expense.currency.toUpperCase() !== KRW &&
      (trip.policy === 'SPOT_AT_PAYMENT' ||
        (trip.policy === 'CARD_BILLED' &&
          expense.billedKrwAmount == null &&
          expense.providerKrwAmount == null));
    const spot = needsSpot
      ? await this.findSpotRate(expense.currency, expense.occurredAt, db)
      : null;
    try {
      return convertToKrw({
        amount: expense.amount,
        currency: expense.currency,
        policy: trip.policy,
        spot,
        fixedRate: trip.fixedRate,
        fixedAt: trip.fixedAt,
        billedKrwAmount: expense.billedKrwAmount,
        billedAt: expense.billedAt,
        providerKrwAmount: expense.providerKrwAmount,
      });
    } catch (error) {
      if (error instanceof FxRateMissingError) {
        throw AppException.of('FX_RATE_UNAVAILABLE', { cause: error });
      }
      throw error;
    }
  }

  /**
   * GET /api/fx: 그 시각(없으면 지금)에 유효한 고시. date가 날짜만이면 그날 KST 23:59:59.999까지.
   * @throws AppException FX_RATE_UNAVAILABLE 고시가 없을 때
   */
  async getRate(currency: string, at?: Date): Promise<FxRateView> {
    const quoteCurrency = currency.toUpperCase();
    const row = await this.prisma.exchangeRate.findFirst({
      where: { quoteCurrency, ...(at && { effectiveAt: { lte: at } }) },
      orderBy: [{ effectiveAt: 'desc' }, { fetchedAt: 'desc' }],
      select: RATE_SELECT,
    });
    if (!row) throw AppException.of('FX_RATE_UNAVAILABLE');
    return toRateView(row);
  }

  /** 최신 고시(없으면 null). 여정 환율 화면용 */
  async findLatest(currency: string): Promise<FxRateView | null> {
    const row = await this.prisma.exchangeRate.findFirst({
      where: { quoteCurrency: currency.toUpperCase() },
      orderBy: [{ effectiveAt: 'desc' }, { fetchedAt: 'desc' }],
      select: RATE_SELECT,
    });
    return row ? toRateView(row) : null;
  }
}

export function toRateView(row: RateRow): FxRateView {
  const rate = row.rate.toFixed(6);
  const meta = currencyMeta(row.quoteCurrency);
  return {
    baseCurrency: 'KRW',
    currency: meta.code,
    currencyNameKo: meta.nameKo,
    displayUnit: meta.displayUnit,
    rate,
    displayRate: displayRate(rate, meta.displayUnit),
    label: fxRateLabel(meta.code, rate),
    rateType: row.rateType,
    source: row.source,
    effectiveAt: toKstIso(row.effectiveAt),
    fetchedAt: toKstIso(row.fetchedAt),
  };
}
