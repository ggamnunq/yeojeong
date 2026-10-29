import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FxJobResult } from '@yeojeong/shared';
import { AppException } from '../common/errors/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatScaled, parseScaled } from './convert.js';
import { DEFAULT_FX_CURRENCIES, KRW } from './currencies.js';
import { FxPolicyService } from './fx-policy.service.js';
import {
  FX_RATE_SOURCE,
  type FetchedRate,
  type FxRateSource,
} from './fx-rate-source.js';

const CURRENCY = /^[A-Z]{3}$/;
/** ExchangeRate.source 길이(varchar 40) */
const SOURCE_MAX = 40;

/** 이상값 방어: 직전 고시보다 이 비율(%)을 넘게 바뀐 고시는 저장하지 않는다 */
export const FX_OUTLIER_MAX_CHANGE_PERCENT = 20n;
/**
 * 직전 고시가 새 고시보다 이만큼 넘게 오래됐으면 비교하지 않는다. 진짜로 크게 움직인 통화가
 * 영영 막히지 않게 하는 장치다(막힌 동안 직전 고시가 늙어 가다가 이 기간이 지나면 받아들인다).
 */
export const FX_OUTLIER_LOOKBACK_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** prev 대비 next 변화가 maxPercent%를 넘는가(소수 6자리 decimal 문자열, bigint 비교) */
export function exceedsChange(
  prev: string,
  next: string,
  maxPercent = FX_OUTLIER_MAX_CHANGE_PERCENT,
): boolean {
  const p = parseScaled(prev, 6);
  const n = parseScaled(next, 6);
  if (p <= 0n) return false;
  const diff = n > p ? n - p : p - n;
  return diff * 100n > p * maxPercent;
}

/**
 * 환율 수집 잡(기능명세 6-3 내부 잡, 4-5 "환율 수집"). 영업일 매시 정각 호출을 가정한다.
 * 같은 (통화, 출처, 고시 시각)은 한 번만 저장되므로(UNIQUE) 겹쳐 돌거나 다시 돌려도 안전하다.
 */
@Injectable()
export class FxJobService {
  private readonly logger = new Logger(FxJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FxPolicyService,
    @Inject(FX_RATE_SOURCE) private readonly source: FxRateSource,
  ) {}

  async collect(now = new Date()): Promise<FxJobResult> {
    const tripCurrencies = await this.prisma.trip.findMany({
      where: {
        status: { in: ['UPCOMING', 'ONGOING'] },
        deletedAt: null,
        currency: { not: KRW },
      },
      select: { currency: true },
      distinct: ['currency'],
    });
    const currencies = [
      ...new Set([
        ...DEFAULT_FX_CURRENCIES,
        ...tripCurrencies.map((t) => t.currency),
      ]),
    ].sort();

    let fetched: FetchedRate[];
    try {
      fetched = await this.source.fetchLatest(currencies, now);
    } catch (error) {
      this.logger.error(
        { err: error, source: this.source.id },
        '환율 소스 호출 실패',
      );
      throw AppException.of('FX_RATE_UNAVAILABLE', { cause: error });
    }

    const rows = fetched.flatMap((rate) => {
      const source = rate.source ?? this.source.sourceLabel;
      const valid =
        source.length > 0 &&
        source.length <= SOURCE_MAX &&
        CURRENCY.test(rate.currency) &&
        rate.currency !== KRW &&
        Number.isSafeInteger(rate.displayUnit) &&
        rate.displayUnit > 0 &&
        !Number.isNaN(rate.effectiveAt.getTime());
      let normalized: string | null = null;
      try {
        const scaled = parseScaled(rate.ratePerUnit, 6);
        normalized = scaled > 0n ? formatScaled(scaled, 6) : null;
      } catch {
        normalized = null;
      }
      if (!valid || !normalized) {
        this.logger.warn(
          { source: this.source.id, currency: rate.currency },
          '형식이 맞지 않는 고시를 건너뜀',
        );
        return [];
      }
      return [
        {
          quoteCurrency: rate.currency,
          rate: normalized,
          displayUnit: rate.displayUnit,
          rateType: 'MID' as const,
          source,
          effectiveAt: rate.effectiveAt,
          fetchedAt: now,
        },
      ];
    });
    const accepted = await this.rejectOutliers(rows);
    const rejected = rows.length - accepted.length;
    const { count: inserted } = await this.prisma.exchangeRate.createMany({
      data: accepted,
      skipDuplicates: true,
    });

    // 새 고시·청구 확정을 진행 중 외화 여정에 반영한다(값이 같은 결제는 쓰지 않는다)
    const trips = await this.prisma.trip.findMany({
      where: {
        status: 'ONGOING',
        deletedAt: null,
        currency: { not: KRW },
        fxPolicy: { in: ['SPOT_AT_PAYMENT', 'CARD_BILLED'] },
      },
      select: { id: true },
    });
    let recalculatedTrips = 0;
    const failedTripIds: string[] = [];
    for (const trip of trips) {
      try {
        if ((await this.policy.recalculateOngoing(trip.id)) > 0) {
          recalculatedTrips += 1;
        }
      } catch (error) {
        this.logger.error({ err: error, tripId: trip.id }, '환율 재계산 실패');
        failedTripIds.push(trip.id);
      }
    }
    const result: FxJobResult = {
      source: this.source.sourceLabel,
      currencies,
      fetched: fetched.length,
      inserted,
      rejected,
      recalculatedTrips,
    };
    if (failedTripIds.length > 0) {
      // 스케줄러가 재시도하게 실패로 응답한다. 고시 저장·재계산은 다시 돌려도 안전하다
      throw AppException.of('INTERNAL_ERROR', {
        details: { ...result, failedTrips: failedTripIds.length },
      });
    }
    this.logger.log(
      {
        source: this.source.id,
        fetched: result.fetched,
        inserted,
        rejected,
        bySource: countBySource(accepted),
      },
      '환율 수집 완료',
    );
    return result;
  }

  /**
   * 통화마다 새 고시 시각 이전의 가장 최근 저장 고시(출처 무관)와 비교해 20% 넘게 다르면 버린다(경고 로그).
   * 버린 통화는 저장된 직전 고시를 계속 쓴다. 직전 고시가 없거나 14일 넘게 오래됐으면 비교하지 않는다.
   */
  private async rejectOutliers<
    T extends {
      quoteCurrency: string;
      rate: string;
      source: string;
      effectiveAt: Date;
    },
  >(rows: T[]): Promise<T[]> {
    const checks = await Promise.all(
      rows.map(async (row) => {
        const prev = await this.prisma.exchangeRate.findFirst({
          where: {
            quoteCurrency: row.quoteCurrency,
            effectiveAt: { lte: row.effectiveAt },
          },
          orderBy: [{ effectiveAt: 'desc' }, { fetchedAt: 'desc' }],
          select: { rate: true, source: true, effectiveAt: true },
        });
        if (
          !prev ||
          row.effectiveAt.getTime() - prev.effectiveAt.getTime() >
            FX_OUTLIER_LOOKBACK_DAYS * DAY_MS
        ) {
          return true;
        }
        const prevRate = prev.rate.toFixed(6);
        if (!exceedsChange(prevRate, row.rate)) return true;
        this.logger.warn(
          {
            currency: row.quoteCurrency,
            source: row.source,
            rate: row.rate,
            previousRate: prevRate,
            previousSource: prev.source,
          },
          `직전 고시와 ${FX_OUTLIER_MAX_CHANGE_PERCENT}% 넘게 달라 저장하지 않음(이상값). 직전 고시 유지`,
        );
        return false;
      }),
    );
    return rows.filter((_, i) => checks[i]);
  }
}

function countBySource(rows: readonly { source: string }[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.source] = (counts[row.source] ?? 0) + 1;
  return counts;
}
