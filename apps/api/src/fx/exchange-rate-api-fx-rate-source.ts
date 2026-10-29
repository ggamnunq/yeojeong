import { Logger } from '@nestjs/common';
import { divRoundHalfUp, formatScaled, parseScaled } from './convert.js';
import { currencyMeta, KRW } from './currencies.js';
import type { FetchedRate, FxRateSource } from './fx-rate-source.js';

// ExchangeRate-API 무료 공개 엔드포인트(키 없음, https://www.exchangerate-api.com/docs/free).
// GET https://open.er-api.com/v6/latest/USD → { result: "success", time_last_update_unix, base_code: "USD", rates: { KRW: 1340.24, TWD: 32.41, … } }
// - 하루 1회 갱신(UTC 00시 무렵). 한 시간에 한 번 이하로 부르면 제한이 없다(넘으면 429, 20분 뒤 풀림). 수집 잡은 하루 두 번이다.
// - 약관: 환율을 쓰는 화면에 "Rates By Exchange Rate API" 링크(https://www.exchangerate-api.com)를 달아야 한다.
//   그래서 출처명(ExchangeRate.source)을 그 문구 그대로 두고, 조회 응답 sourceUrl로 링크를 내려 준다(FX_SOURCE_LINKS).
//   데이터 재배포(제3자에게 환율 표 제공)는 금지라 앱 안 환산·표시에만 쓴다.
// - 한국수출입은행이 고시하지 않는 통화(TWD·VND·PHP 등)를 채우는 보조 소스로 쓴다(composite-fx-rate-source.ts).
// - KRW/통화 = (KRW/USD) ÷ (통화/USD). float을 decimal 문자열로 옮긴 뒤 bigint로만 계산한다.

export const ER_API_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
/** 약관이 요구하는 출처 문구. ExchangeRate.source(varchar 40)에 그대로 저장한다 */
export const ER_API_SOURCE_LABEL = 'Rates By Exchange Rate API';
export const ER_API_ATTRIBUTION_URL = 'https://www.exchangerate-api.com';

const BASE = 'USD';
/** 응답 float을 이 자리수로 읽는다 */
const PARSE_SCALE = 12;
/** 응답 본문 상한(정상 응답은 5KB 안팎) */
const MAX_BODY_BYTES = 256 * 1024;

export class ExchangeRateApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ExchangeRateApiError';
  }
}

export interface ExchangeRateApiOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  requestTimeoutMs?: number;
  retryDelaysMs?: readonly number[];
  /** fetchLatest 전체 예산 */
  budgetMs?: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ExchangeRateApiFxRateSource implements FxRateSource {
  readonly id = 'erapi';
  readonly sourceLabel = ER_API_SOURCE_LABEL;

  private readonly logger = new Logger(ExchangeRateApiFxRateSource.name);
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly clock: () => number;
  private readonly requestTimeoutMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly budgetMs: number;

  constructor(options: ExchangeRateApiOptions = {}) {
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.clock = options.clock ?? Date.now;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.retryDelaysMs = options.retryDelaysMs ?? [500];
    this.budgetMs = options.budgetMs ?? 8_000;
  }

  async fetchLatest(currencies: readonly string[]): Promise<FetchedRate[]> {
    const wanted = [...new Set(currencies.map((c) => c.toUpperCase()))].filter(
      (c) => c !== KRW,
    );
    if (wanted.length === 0) return [];
    const body = await this.request(this.clock() + this.budgetMs);
    return this.toRates(body, wanted);
  }

  private toRates(body: ErApiBody, wanted: readonly string[]): FetchedRate[] {
    const effectiveAt = new Date(body.time_last_update_unix * 1000);
    const krwPerUsd = scaledOf(body.rates[KRW]);
    if (krwPerUsd === null) {
      throw new ExchangeRateApiError(
        'ExchangeRate-API 응답에 KRW가 없습니다',
        false,
      );
    }
    const rates: FetchedRate[] = [];
    for (const currency of wanted) {
      const raw = body.rates[currency];
      if (raw === undefined) continue; // 이 소스에도 없는 통화
      const curPerUsd = scaledOf(raw);
      if (curPerUsd === null) {
        this.logger.warn(
          { currency },
          'ExchangeRate-API 환율 형식 오류로 건너뜀',
        );
        continue;
      }
      const ratePerUnit = crossRatePerUnit(krwPerUsd, curPerUsd);
      if (!ratePerUnit) {
        this.logger.warn(
          { currency },
          'ExchangeRate-API 환율이 0에 가까워 건너뜀',
        );
        continue;
      }
      rates.push({
        currency,
        ratePerUnit,
        displayUnit: currencyMeta(currency).displayUnit,
        effectiveAt,
        source: ER_API_SOURCE_LABEL,
      });
    }
    return rates;
  }

  private async request(deadline: number): Promise<ErApiBody> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.requestOnce(deadline);
      } catch (error) {
        const failure =
          error instanceof ExchangeRateApiError
            ? error
            : new ExchangeRateApiError(String(error), true);
        const delay = this.retryDelaysMs[attempt];
        if (
          !failure.retryable ||
          delay === undefined ||
          this.clock() + delay >= deadline
        ) {
          throw failure;
        }
        this.logger.warn(
          { attempt: attempt + 1, reason: failure.message },
          'ExchangeRate-API 호출 재시도',
        );
        await this.sleep(delay);
      }
    }
  }

  private async requestOnce(deadline: number): Promise<ErApiBody> {
    const remaining = deadline - this.clock();
    if (remaining <= 0) {
      throw new ExchangeRateApiError(
        'ExchangeRate-API 호출 시간 예산 초과',
        false,
      );
    }
    let response: Response;
    try {
      response = await this.fetchFn(ER_API_ENDPOINT, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(Math.min(this.requestTimeoutMs, remaining)),
      });
    } catch (error) {
      throw new ExchangeRateApiError(
        `ExchangeRate-API 연결 실패(${describeNetworkError(error)})`,
        true,
      );
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      // 429는 20분 동안 풀리지 않으니 같은 잡 안에서 다시 부르지 않는다
      throw new ExchangeRateApiError(
        `ExchangeRate-API 응답 상태 ${response.status}`,
        response.status >= 500,
      );
    }
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new ExchangeRateApiError(
        'ExchangeRate-API 응답이 너무 큽니다',
        false,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ExchangeRateApiError(
        'ExchangeRate-API 응답이 JSON이 아닙니다',
        true,
      );
    }
    return parseBody(body);
  }
}

interface ErApiBody {
  time_last_update_unix: number;
  rates: Record<string, unknown>;
}

function parseBody(body: unknown): ErApiBody {
  if (typeof body !== 'object' || body === null) {
    throw new ExchangeRateApiError('ExchangeRate-API 응답 형식 오류', true);
  }
  const b = body as Record<string, unknown>;
  if (b.result !== 'success') {
    const type =
      typeof b['error-type'] === 'string'
        ? b['error-type'].slice(0, 40)
        : '알 수 없음';
    throw new ExchangeRateApiError(`ExchangeRate-API 오류: ${type}`, false);
  }
  const updated = b.time_last_update_unix;
  if (
    b.base_code !== BASE ||
    typeof updated !== 'number' ||
    !Number.isSafeInteger(updated) ||
    updated <= 0 ||
    typeof b.rates !== 'object' ||
    b.rates === null
  ) {
    throw new ExchangeRateApiError('ExchangeRate-API 응답 형식 오류', false);
  }
  return {
    time_last_update_unix: updated,
    rates: b.rates as Record<string, unknown>,
  };
}

/** 양의 유한 float → 소수 12자리 bigint. 형식이 틀리거나 0이 되면 null */
export function scaledOf(value: unknown): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value >= 1e15) return null;
  // toFixed는 1e21 미만에서 지수 표기를 쓰지 않는다. 13번째 자리에서 반올림된다
  const scaled = parseScaled(value.toFixed(PARSE_SCALE), PARSE_SCALE);
  return scaled > 0n ? scaled : null;
}

/** (KRW/USD) ÷ (통화/USD) → 1단위당 원, 소수 6자리 half-up. 0이 되면 null */
export function crossRatePerUnit(
  krwPerUsd: bigint,
  curPerUsd: bigint,
): string | null {
  if (krwPerUsd <= 0n || curPerUsd <= 0n) return null;
  const perUnit = divRoundHalfUp(krwPerUsd * 10n ** 6n, curPerUsd);
  return perUnit > 0n ? formatScaled(perUnit, 6) : null;
}

function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const cause = error.cause as { code?: unknown } | undefined;
  const code = typeof cause?.code === 'string' ? cause.code : undefined;
  return code ? `${error.name} ${code}` : error.name;
}
