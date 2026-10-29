import { Logger } from '@nestjs/common';
import { KRW } from './currencies.js';
import type { FetchedRate, FxRateSource } from './fx-rate-source.js';

/**
 * 주 소스(한국수출입은행) 값을 쓰고, 주 소스가 돌려주지 않은 통화만 보조 소스(ExchangeRate-API) 값으로 채운다.
 * - 통화별로 합친다. 두 소스가 다 가진 통화는 늘 주 소스 값을 쓴다(보조 값은 버린다).
 * - 각 고시에 출처를 붙인다(FetchedRate.source → ExchangeRate.source). 화면에 통화별 실제 출처가 나온다.
 * - 보조 소스는 주 소스와 동시에 부르되(한 번 호출에 전 통화), 값은 주 소스에 없는 통화에만 쓴다.
 * - 주 소스가 실패하면 예외를 그대로 던진다(기존 동작: 잡 실패 → 스케줄러 재시도, 저장된 고시 유지).
 * - 보조 소스가 실패하면 경고만 남기고 주 소스 결과만 돌려준다(빠진 통화는 저장된 직전 고시를 계속 쓴다).
 */
export class CompositeFxRateSource implements FxRateSource {
  readonly id: string;
  readonly sourceLabel: string;
  private readonly logger = new Logger(CompositeFxRateSource.name);

  constructor(
    private readonly primary: FxRateSource,
    private readonly fallback: FxRateSource,
  ) {
    this.id = `${primary.id}+${fallback.id}`;
    // 잡 결과 표기용. 저장되는 출처는 고시마다 붙인 source다
    this.sourceLabel = `${primary.sourceLabel} 외`;
  }

  async fetchLatest(
    currencies: readonly string[],
    now: Date,
  ): Promise<FetchedRate[]> {
    const requested = [
      ...new Set(currencies.map((c) => c.toUpperCase())),
    ].filter((c) => c !== KRW);
    // 보조 소스는 한 번 호출로 모든 통화를 주므로 주 소스와 동시에 부른다(스케줄러 제한 30초 안에 끝나게).
    // 값은 주 소스가 돌려주지 않은 통화에만 쓴다
    const fallbackResult = this.fallback.fetchLatest(requested, now).then(
      (rates) => ({ ok: true as const, rates }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    let primaryRates: FetchedRate[];
    try {
      primaryRates = (await this.primary.fetchLatest(currencies, now)).map(
        (rate) => ({
          ...rate,
          source: rate.source ?? this.primary.sourceLabel,
        }),
      );
    } finally {
      // 주 소스가 실패해도 보조 호출이 매달린 채 남지 않게 끝을 기다린다(결과는 버린다)
      await fallbackResult;
    }
    const covered = new Set(primaryRates.map((r) => r.currency.toUpperCase()));
    const missing = new Set(requested.filter((c) => !covered.has(c)));
    if (missing.size === 0) return primaryRates;

    const fallback = await fallbackResult;
    if (!fallback.ok) {
      this.logger.warn(
        {
          source: this.fallback.id,
          missing: [...missing],
          reason:
            fallback.error instanceof Error
              ? fallback.error.message
              : String(fallback.error),
        },
        '보조 환율 소스 실패. 빠진 통화는 저장된 직전 고시를 유지',
      );
      return primaryRates;
    }
    const filled = fallback.rates
      .filter((rate) => missing.delete(rate.currency.toUpperCase()))
      .map((rate) => ({
        ...rate,
        source: rate.source ?? this.fallback.sourceLabel,
      }));
    if (filled.length > 0) {
      this.logger.log(
        { source: this.fallback.id, currencies: filled.map((r) => r.currency) },
        '주 소스에 없는 통화를 보조 소스로 채움',
      );
    }
    if (missing.size > 0) {
      this.logger.warn(
        { currencies: [...missing] },
        '어느 환율 소스에도 없는 통화. 저장된 직전 고시를 유지',
      );
    }
    return [...primaryRates, ...filled];
  }
}
