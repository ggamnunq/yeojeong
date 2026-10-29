import { Logger } from '@nestjs/common';
import { divRoundHalfUp, formatScaled, parseScaled } from './convert.js';
import { KRW } from './currencies.js';
import type { FetchedRate, FxRateSource } from './fx-rate-source.js';
import { kstDate } from './kst.js';

// 한국수출입은행 현재환율 OpenAPI(기능명세 7-3, 미결 Q-04 추천안).
// GET .../exchangeJSON?authkey=…&searchdate=YYYYMMDD&data=AP01 → 그날 고시 배열.
// - 영업일 오전 11시 무렵 하루 1회 고시. 주말·공휴일·고시 전에는 빈 배열이라 직전 날짜로 최대 7일 거슬러 찾는다.
// - cur_unit "JPY(100)"의 괄호 값이 고시 단위, deal_bas_r "919.2"(쉼표 포함 가능)가 고시 단위당 매매기준율.
// - 대만 달러(TWD)·베트남 동(VND)·필리핀 페소(PHP)는 고시하지 않는다. 그 통화는 결과에서 빠진다.
// - 인증키는 로그·예외 메시지에 넣지 않는다. 응답 원문도 로그에 남기지 않는다.

export const KOREA_EXIM_ENDPOINT =
  'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';

/** 오늘 포함 8일(오늘 + 7일 전까지) */
const LOOKBACK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const CUR_UNIT = /^([A-Z]{3})(?:\((\d{1,6})\))?$/;
/** "1,385.5"처럼 세 자리 쉼표가 있거나 없는 양의 decimal */
const DEAL_BAS_R = /^(\d{1,3}(,\d{3})+|\d{1,12})(\.\d{1,8})?$/;
/** deal_bas_r를 이 자리수로 읽고 고시 단위로 나눠 소수 6자리로 반올림한다 */
const PARSE_SCALE = 8;

/**
 * 한국수출입은행은 역외 위안(CNH)으로 고시한다. 여정 통화는 ISO 4217 CNY라 CNH 값을 CNY로 쓴다
 * (역내·역외 위안 차이는 매매기준율 표시 용도에서는 무시할 만하다고 본다).
 */
const CURRENCY_ALIASES: Readonly<Record<string, string>> = { CNH: 'CNY' };

const RESULT_MESSAGES: Readonly<Record<number, string>> = {
  2: 'DATA 코드 오류',
  3: '인증코드 오류',
  4: '일일 제한 횟수 마감',
};

/** URL 쿼리의 authkey 값을 가린다. 로그에 URL을 남길 때는 반드시 거친다 */
export function maskUrl(url: string): string {
  return url.replace(/([?&]authkey=)[^&#]*/gi, '$1***');
}

/** 한국수출입은행 호출 실패. retryable=false면 같은 잡 안에서 다시 부르지 않는다 */
export class KoreaEximError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'KoreaEximError';
  }
}

interface EximItem {
  result?: unknown;
  cur_unit?: unknown;
  deal_bas_r?: unknown;
}

export interface KoreaEximOptions {
  fetch?: typeof fetch;
  /** 재시도 대기. 테스트에서 바꾼다 */
  sleep?: (ms: number) => Promise<void>;
  /** 시간 예산 계산용 시계(ms) */
  clock?: () => number;
  /** 요청 한 번의 제한 시간 */
  requestTimeoutMs?: number;
  /** 재시도 대기(첫 시도 뒤 몇 번 더 부를지 = 길이) */
  retryDelaysMs?: readonly number[];
  /** fetchLatest 전체 예산. Cloud Scheduler attempt_deadline 30초 안에 끝나야 한다 */
  budgetMs?: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** "2026-11-13" → "20261113" */
const searchDateOf = (date: string) => date.replaceAll('-', '');

export class KoreaEximFxRateSource implements FxRateSource {
  readonly id = 'koreaexim';
  readonly sourceLabel = '한국수출입은행 매매기준율';

  private readonly logger = new Logger(KoreaEximFxRateSource.name);
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly clock: () => number;
  private readonly requestTimeoutMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly budgetMs: number;

  constructor(
    private readonly apiKey: string,
    options: KoreaEximOptions = {},
  ) {
    if (!apiKey) throw new Error('EXIM_API_KEY가 없습니다');
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.clock = options.clock ?? Date.now;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.retryDelaysMs = options.retryDelaysMs ?? [300, 900];
    this.budgetMs = options.budgetMs ?? 20_000;
  }

  async fetchLatest(
    currencies: readonly string[],
    now: Date,
  ): Promise<FetchedRate[]> {
    const deadline = this.clock() + this.budgetMs;
    const today = Date.parse(`${kstDate(now)}T00:00:00Z`);
    for (let back = 0; back <= LOOKBACK_DAYS; back += 1) {
      const date = new Date(today - back * DAY_MS).toISOString().slice(0, 10);
      const items = await this.request(searchDateOf(date), deadline);
      if (items.length > 0) return this.toRates(items, currencies, date);
    }
    this.logger.warn(
      { lookbackDays: LOOKBACK_DAYS },
      '한국수출입은행 고시가 없어 저장된 직전 고시를 그대로 둠',
    );
    return [];
  }

  private toRates(
    items: EximItem[],
    currencies: readonly string[],
    date: string,
  ): FetchedRate[] {
    const wanted = new Set(currencies.map((c) => c.toUpperCase()));
    // 고시일 11:00 KST를 고시 시각으로 둔다(실제 고시 시각은 응답에 없다). 같은 날 다시 돌면 UNIQUE로 걸러진다
    const effectiveAt = new Date(`${date}T11:00:00+09:00`);
    const rates = new Map<string, FetchedRate>();
    for (const item of items) {
      const unit =
        typeof item.cur_unit === 'string'
          ? CUR_UNIT.exec(item.cur_unit.trim())
          : null;
      if (!unit) continue;
      const currency = CURRENCY_ALIASES[unit[1]] ?? unit[1];
      if (currency === KRW || !wanted.has(currency) || rates.has(currency)) {
        continue;
      }
      const displayUnit = unit[2] === undefined ? 1 : Number(unit[2]);
      const ratePerUnit = parseDealBasR(item.deal_bas_r, displayUnit);
      if (!ratePerUnit) {
        this.logger.warn(
          { currency },
          '한국수출입은행 고시 형식 오류로 건너뜀',
        );
        continue;
      }
      rates.set(currency, { currency, ratePerUnit, displayUnit, effectiveAt });
    }
    return [...rates.values()];
  }

  /** 하루치 고시를 받는다. 네트워크 오류·5xx·JSON 아님은 재시도, 결과 코드 오류·그 밖의 상태는 바로 실패 */
  private async request(searchdate: string, deadline: number) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.requestOnce(searchdate, deadline);
      } catch (error) {
        const failure =
          error instanceof KoreaEximError
            ? error
            : new KoreaEximError(this.redact(String(error)), true);
        const delay = this.retryDelaysMs[attempt];
        if (
          !failure.retryable ||
          delay === undefined ||
          this.clock() + delay >= deadline
        ) {
          throw failure;
        }
        this.logger.warn(
          { searchdate, attempt: attempt + 1, reason: failure.message },
          '한국수출입은행 호출 재시도',
        );
        await this.sleep(delay);
      }
    }
  }

  private async requestOnce(
    searchdate: string,
    deadline: number,
  ): Promise<EximItem[]> {
    const remaining = deadline - this.clock();
    if (remaining <= 0) {
      throw new KoreaEximError('한국수출입은행 호출 시간 예산 초과', false);
    }
    const url = new URL(KOREA_EXIM_ENDPOINT);
    url.searchParams.set('authkey', this.apiKey);
    url.searchParams.set('searchdate', searchdate);
    url.searchParams.set('data', 'AP01');

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(Math.min(this.requestTimeoutMs, remaining)),
      });
    } catch (error) {
      // 원래 예외는 붙이지 않는다(요청 URL·키가 섞여 로그로 나갈 수 있다)
      throw new KoreaEximError(
        `한국수출입은행 연결 실패(${describeNetworkError(error)})`,
        true,
      );
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new KoreaEximError(
        `한국수출입은행 응답 상태 ${response.status}`,
        response.status >= 500,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch {
      throw new KoreaEximError('한국수출입은행 응답이 JSON이 아닙니다', true);
    }
    if (!Array.isArray(body)) {
      throw new KoreaEximError('한국수출입은행 응답이 배열이 아닙니다', true);
    }
    const items = body.filter(
      (item): item is EximItem => typeof item === 'object' && item !== null,
    );
    const failed = items.find((item) => Number(item.result) !== 1);
    if (failed) {
      const code = Number(failed.result);
      const reason = RESULT_MESSAGES[code] ?? '알 수 없는 결과 코드';
      throw new KoreaEximError(
        `한국수출입은행 결과 코드 ${Number.isFinite(code) ? code : '없음'}: ${reason}`,
        false,
      );
    }
    return items;
  }

  /** 혹시라도 키가 섞인 문자열에서 키를 지운다 */
  private redact(text: string): string {
    return maskUrl(text).replaceAll(this.apiKey, '***');
  }
}

/** "1,385.5", 단위 1 → "1385.500000". 형식이 틀리거나 0 이하면 null */
export function parseDealBasR(
  value: unknown,
  displayUnit: number,
): string | null {
  if (typeof value !== 'string') return null;
  if (!Number.isSafeInteger(displayUnit) || displayUnit <= 0) return null;
  const trimmed = value.trim();
  if (!DEAL_BAS_R.test(trimmed)) return null;
  const scaled = parseScaled(trimmed.replaceAll(',', ''), PARSE_SCALE);
  const perUnit = divRoundHalfUp(
    scaled,
    BigInt(displayUnit) * 10n ** BigInt(PARSE_SCALE - 6),
  );
  return perUnit > 0n ? formatScaled(perUnit, 6) : null;
}

/** 예외에서 이름·코드만 뽑는다(메시지는 URL을 담을 수 있어 쓰지 않는다) */
function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const cause = error.cause as { code?: unknown } | undefined;
  const code = typeof cause?.code === 'string' ? cause.code : undefined;
  return code ? `${error.name} ${code}` : error.name;
}
