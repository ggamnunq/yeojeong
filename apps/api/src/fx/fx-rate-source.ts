import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { KoreaEximFxRateSource } from './korea-exim-fx-rate-source.js';

// 환율 소스 어댑터 경계(기능명세 7-3). 수집 잡(POST /api/internal/jobs/fx)만 부른다.
// env FX_RATE_SOURCE로 고른다: demo(고정 샘플 값) | koreaexim(한국수출입은행 OpenAPI, korea-exim-fx-rate-source.ts).

export interface FetchedRate {
  currency: string;
  /** 1단위당 원, 소수 6자리까지("9.192") */
  ratePerUnit: string;
  displayUnit: number;
  /** 고시 시각 */
  effectiveAt: Date;
}

export interface FxRateSource {
  /** env 값과 같은 ID */
  readonly id: string;
  /** 화면 표기용 출처명. ExchangeRate.source(varchar 40)에 저장한다 */
  readonly sourceLabel: string;
  /** 요청한 통화 중 고시가 있는 것만 돌려준다. 장애면 예외 */
  fetchLatest(currencies: readonly string[], now: Date): Promise<FetchedRate[]>;
}

export const FX_RATE_SOURCE = Symbol('FX_RATE_SOURCE');

/**
 * 개발·시연용. 샘플 화면 수치(100엔 = 919.20원 등)를 매시 정각 고시로 돌려준다. 외부 호출 없음.
 * 값이 늘 같아서 테스트·데모 결과가 결정적이다.
 */
export class DemoFxRateSource implements FxRateSource {
  readonly id = 'demo';
  readonly sourceLabel = '데모 매매기준율';

  /** 1단위당 원 */
  static readonly RATES: Readonly<
    Record<string, { ratePerUnit: string; displayUnit: number }>
  > = {
    JPY: { ratePerUnit: '9.192', displayUnit: 100 },
    USD: { ratePerUnit: '1380.5', displayUnit: 1 },
    EUR: { ratePerUnit: '1495.3', displayUnit: 1 },
    GBP: { ratePerUnit: '1752.1', displayUnit: 1 },
    CNY: { ratePerUnit: '190.25', displayUnit: 1 },
    TWD: { ratePerUnit: '43.1', displayUnit: 1 },
    HKD: { ratePerUnit: '177.4', displayUnit: 1 },
    SGD: { ratePerUnit: '1030.2', displayUnit: 1 },
    AUD: { ratePerUnit: '905.6', displayUnit: 1 },
    NZD: { ratePerUnit: '830.1', displayUnit: 1 },
    CAD: { ratePerUnit: '1003.4', displayUnit: 1 },
    CHF: { ratePerUnit: '1580.2', displayUnit: 1 },
    THB: { ratePerUnit: '38.15', displayUnit: 1 },
    VND: { ratePerUnit: '0.0551', displayUnit: 100 },
    IDR: { ratePerUnit: '0.0872', displayUnit: 100 },
    PHP: { ratePerUnit: '23.8', displayUnit: 1 },
    MYR: { ratePerUnit: '295.4', displayUnit: 1 },
  };

  fetchLatest(currencies: readonly string[], now: Date) {
    const effectiveAt = new Date(now);
    effectiveAt.setUTCMinutes(0, 0, 0); // KST는 정시 오프셋이라 UTC 정시 = KST 정시
    return Promise.resolve(
      currencies.flatMap((currency) => {
        const known = DemoFxRateSource.RATES[currency];
        return known ? [{ currency, ...known, effectiveAt }] : [];
      }),
    );
  }
}

/**
 * env로 환율 소스를 고른다. 모르는 값이거나 필요한 키가 없으면 서버가 뜨지 않게 예외.
 * - FX_RATE_SOURCE=demo → 데모, FX_RATE_SOURCE=koreaexim → 한국수출입은행(EXIM_API_KEY 필수)
 * - FX_RATE_SOURCE가 비면 EXIM_API_KEY가 있을 때 한국수출입은행, 없으면 데모
 */
export function createFxRateSource(config: ConfigService): FxRateSource {
  const apiKey = config.get<string>('EXIM_API_KEY')?.trim() || undefined;
  const id =
    config.get<string>('FX_RATE_SOURCE')?.trim().toLowerCase() ||
    (apiKey ? 'koreaexim' : 'demo');
  const logger = new Logger('FxRateSource');
  switch (id) {
    case 'demo':
      logger.log('환율 소스: demo(샘플 값)');
      return new DemoFxRateSource();
    case 'koreaexim':
      if (!apiKey) {
        throw new Error(
          'FX_RATE_SOURCE=koreaexim에는 EXIM_API_KEY가 필요합니다',
        );
      }
      logger.log('환율 소스: koreaexim(한국수출입은행)');
      return new KoreaEximFxRateSource(apiKey);
    default:
      throw new Error(`알 수 없는 FX_RATE_SOURCE: ${id} (demo | koreaexim)`);
  }
}
