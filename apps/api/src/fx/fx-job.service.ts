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
      const valid =
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
          source: this.source.sourceLabel,
          effectiveAt: rate.effectiveAt,
          fetchedAt: now,
        },
      ];
    });
    const { count: inserted } = await this.prisma.exchangeRate.createMany({
      data: rows,
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
      recalculatedTrips,
    };
    if (failedTripIds.length > 0) {
      // 스케줄러가 재시도하게 실패로 응답한다. 고시 저장·재계산은 다시 돌려도 안전하다
      throw AppException.of('INTERNAL_ERROR', {
        details: { ...result, failedTrips: failedTripIds.length },
      });
    }
    this.logger.log(
      { source: this.source.id, fetched: result.fetched, inserted },
      '환율 수집 완료',
    );
    return result;
  }
}
