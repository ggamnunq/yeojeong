import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

// 환율 소스 어댑터 경계(기능명세 7-3). 수집 잡(POST /api/internal/jobs/fx)만 부른다.
// env FX_RATE_SOURCE로 고른다: demo(기본, 고정 샘플 값) | koreaexim(한국수출입은행 OpenAPI, 뼈대만).

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
 * 한국수출입은행 현재환율 OpenAPI(기능명세 7-3 추천안, 미결 Q-04). 어댑터 뼈대만 있다.
 * TODO(Q-04 확정 후):
 * - GET https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey={KOREAEXIM_API_KEY}&searchdate=YYYYMMDD&data=AP01
 * - 응답 cur_unit "JPY(100)"의 괄호 값이 고시 단위, deal_bas_r "919.2"(쉼표 포함 가능)가 고시 단위당 매매기준율 → 1단위당으로 나눈다.
 * - 영업일 오전 하루 1회 고시. 주말·공휴일·고시 전에는 빈 배열 → 직전 영업일 값을 쓴다(effectiveAt = 고시일 11:00 KST 가정).
 * - 키는 Secret Manager. 응답 원문은 로그에 남기지 않는다.
 */
export class KoreaEximFxRateSource implements FxRateSource {
  readonly id = 'koreaexim';
  readonly sourceLabel = '한국수출입은행 매매기준율';

  constructor(private readonly apiKey: string | undefined) {}

  fetchLatest(): Promise<FetchedRate[]> {
    return Promise.reject(
      new Error(
        this.apiKey
          ? 'KoreaEximFxRateSource는 아직 구현되지 않았습니다(미결 Q-04)'
          : 'KOREAEXIM_API_KEY가 없습니다',
      ),
    );
  }
}

/** env FX_RATE_SOURCE로 소스를 고른다. 모르는 값이면 서버가 뜨지 않게 예외 */
export function createFxRateSource(config: ConfigService): FxRateSource {
  const id = (config.get<string>('FX_RATE_SOURCE') || 'demo').toLowerCase();
  switch (id) {
    case 'demo':
      return new DemoFxRateSource();
    case 'koreaexim':
      new Logger('FxRateSource').warn(
        'FX_RATE_SOURCE=koreaexim은 뼈대만 있어 수집 잡이 503을 돌려줍니다',
      );
      return new KoreaEximFxRateSource(config.get<string>('KOREAEXIM_API_KEY'));
    default:
      throw new Error(`알 수 없는 FX_RATE_SOURCE: ${id} (demo | koreaexim)`);
  }
}
