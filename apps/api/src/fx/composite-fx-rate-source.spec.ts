import {
  EXIM_FULL_FIXTURE,
  ER_API_FIXTURE,
  ER_API_UPDATED_UNIX,
} from '../../test/fx-fixtures.js';
import { CompositeFxRateSource } from './composite-fx-rate-source.js';
import {
  DEFAULT_FX_CURRENCIES,
  KRW,
  SUPPORTED_CURRENCY_CODES,
} from './currencies.js';
import {
  ER_API_SOURCE_LABEL,
  ExchangeRateApiFxRateSource,
} from './exchange-rate-api-fx-rate-source.js';
import type { FetchedRate, FxRateSource } from './fx-rate-source.js';
import {
  KOREA_EXIM_PUBLISHED_CURRENCIES,
  KoreaEximFxRateSource,
} from './korea-exim-fx-rate-source.js';

const NOW = new Date('2026-10-29T02:10:00Z');
/** 여정 통화로 고를 수 있는 외화(GET /api/currencies) */
const SUPPORTED_FOREIGN = SUPPORTED_CURRENCY_CODES.filter((c) => c !== KRW);
const EXIM_LABEL = '한국수출입은행 매매기준율';
const AT = new Date('2026-10-29T11:00:00+09:00');

const rate = (currency: string, ratePerUnit: string): FetchedRate => ({
  currency,
  ratePerUnit,
  displayUnit: 1,
  effectiveAt: AT,
});

function stub(
  id: string,
  sourceLabel: string,
  result: FetchedRate[] | Error,
): FxRateSource & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    id,
    sourceLabel,
    calls,
    fetchLatest: (currencies) => {
      calls.push([...currencies]);
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(
            result.filter((r) => currencies.includes(r.currency)),
          );
    },
  };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** 실제 두 어댑터를 픽스처 응답으로 묶는다 */
function realComposite(eximBody: unknown, erApi: unknown) {
  const exim = new KoreaEximFxRateSource('test-exim-key', {
    fetch: (() => Promise.resolve(json(eximBody))) as unknown as typeof fetch,
    sleep: () => Promise.resolve(),
  });
  const er = new ExchangeRateApiFxRateSource({
    fetch: (() =>
      erApi instanceof Error
        ? Promise.reject(erApi)
        : Promise.resolve(json(erApi))) as unknown as typeof fetch,
    sleep: () => Promise.resolve(),
    retryDelaysMs: [],
  });
  return new CompositeFxRateSource(exim, er);
}

describe('CompositeFxRateSource', () => {
  it('fills only the currencies the primary did not return', async () => {
    const primary = stub('koreaexim', EXIM_LABEL, [
      rate('USD', '1385.5'),
      rate('JPY', '9.192'),
    ]);
    const fallback = stub('erapi', ER_API_SOURCE_LABEL, [
      rate('USD', '1340.24'),
      rate('TWD', '41.345071'),
      rate('VND', '0.051879'),
    ]);
    const composite = new CompositeFxRateSource(primary, fallback);
    expect(composite.id).toBe('koreaexim+erapi');
    expect(composite.sourceLabel).toBe('한국수출입은행 매매기준율 외');

    const rates = await composite.fetchLatest(
      ['JPY', 'KRW', 'PHP', 'TWD', 'USD', 'VND'],
      NOW,
    );
    expect(rates).toEqual([
      { ...rate('USD', '1385.5'), source: EXIM_LABEL }, // 겹치면 주 소스
      { ...rate('JPY', '9.192'), source: EXIM_LABEL },
      { ...rate('TWD', '41.345071'), source: ER_API_SOURCE_LABEL },
      { ...rate('VND', '0.051879'), source: ER_API_SOURCE_LABEL },
    ]); // PHP는 어디에도 없음 → 빠짐(직전 고시 유지)
    expect(primary.calls).toEqual([['JPY', 'KRW', 'PHP', 'TWD', 'USD', 'VND']]);
  });

  it('keeps the primary rates when the fallback fails', async () => {
    const primary = stub('koreaexim', EXIM_LABEL, [rate('USD', '1385.5')]);
    const fallback = stub('erapi', ER_API_SOURCE_LABEL, new Error('429'));
    const composite = new CompositeFxRateSource(primary, fallback);
    await expect(composite.fetchLatest(['TWD', 'USD'], NOW)).resolves.toEqual([
      { ...rate('USD', '1385.5'), source: EXIM_LABEL },
    ]);
  });

  it('propagates a primary failure (job fails and is retried, stored rates stay)', async () => {
    const primary = stub('koreaexim', EXIM_LABEL, new Error('인증코드 오류'));
    const fallback = stub('erapi', ER_API_SOURCE_LABEL, [
      rate('TWD', '41.345071'),
      rate('USD', '1340.24'),
    ]);
    const composite = new CompositeFxRateSource(primary, fallback);
    await expect(composite.fetchLatest(['TWD', 'USD'], NOW)).rejects.toThrow(
      '인증코드 오류',
    );
  });

  it('works end to end with the real adapters and fixtures', async () => {
    const composite = realComposite(EXIM_FULL_FIXTURE, ER_API_FIXTURE);
    const rates = await composite.fetchLatest(
      ['IDR', 'PHP', 'TWD', 'USD', 'VND'],
      NOW,
    );
    expect(rates).toEqual([
      {
        currency: 'IDR',
        ratePerUnit: '0.087200',
        displayUnit: 100,
        effectiveAt: new Date('2026-10-29T11:00:00+09:00'),
        source: EXIM_LABEL,
      },
      {
        currency: 'USD',
        ratePerUnit: '1385.500000',
        displayUnit: 1,
        effectiveAt: new Date('2026-10-29T11:00:00+09:00'),
        source: EXIM_LABEL,
      },
      {
        currency: 'PHP',
        ratePerUnit: '20.942089',
        displayUnit: 1,
        effectiveAt: new Date(ER_API_UPDATED_UNIX * 1000),
        source: ER_API_SOURCE_LABEL,
      },
      {
        currency: 'TWD',
        ratePerUnit: '41.345071',
        displayUnit: 1,
        effectiveAt: new Date(ER_API_UPDATED_UNIX * 1000),
        source: ER_API_SOURCE_LABEL,
      },
      {
        currency: 'VND',
        ratePerUnit: '0.051879',
        displayUnit: 100,
        effectiveAt: new Date(ER_API_UPDATED_UNIX * 1000),
        source: ER_API_SOURCE_LABEL,
      },
    ]);
  });

  it('falls back for a currency the primary skipped on a given day', async () => {
    const withoutMyr = EXIM_FULL_FIXTURE.filter((i) => i.cur_unit !== 'MYR');
    const composite = realComposite(withoutMyr, ER_API_FIXTURE);
    const [myr] = await composite.fetchLatest(['MYR'], NOW);
    expect(myr).toMatchObject({
      currency: 'MYR',
      ratePerUnit: '328.701878',
      source: ER_API_SOURCE_LABEL,
    });
  });
});

describe('FX source coverage', () => {
  it('the fx job always collects every supported currency', () => {
    expect([...DEFAULT_FX_CURRENCIES].sort()).toEqual(
      [...SUPPORTED_FOREIGN].sort(),
    );
  });

  it('Korea Exim does not publish exactly TWD, VND and PHP of the supported list', () => {
    const notPublished = SUPPORTED_FOREIGN.filter(
      (c) => !KOREA_EXIM_PUBLISHED_CURRENCIES.includes(c),
    );
    expect(notPublished.sort()).toEqual(['PHP', 'TWD', 'VND']);
  });

  it('every supported currency is covered by koreaexim or the ExchangeRate-API fallback', async () => {
    const composite = realComposite(EXIM_FULL_FIXTURE, ER_API_FIXTURE);
    const rates = await composite.fetchLatest(SUPPORTED_FOREIGN, NOW);
    const bySource = Object.fromEntries(
      rates.map((r) => [r.currency, r.source]),
    );
    expect(Object.keys(bySource).sort()).toEqual([...SUPPORTED_FOREIGN].sort());
    for (const currency of SUPPORTED_FOREIGN) {
      expect([currency, bySource[currency]]).toEqual([
        currency,
        KOREA_EXIM_PUBLISHED_CURRENCIES.includes(currency)
          ? EXIM_LABEL
          : ER_API_SOURCE_LABEL,
      ]);
    }
    // 보조 소스 픽스처(실제 응답)도 지원 통화를 모두 가진다: 주 소스가 어느 통화를 빠뜨려도 채울 수 있다
    for (const currency of SUPPORTED_FOREIGN) {
      expect(ER_API_FIXTURE.rates).toHaveProperty(currency);
    }
  });

  it('still returns all Korea Exim currencies when the fallback is down', async () => {
    const composite = realComposite(
      EXIM_FULL_FIXTURE,
      new TypeError('fetch failed'),
    );
    const rates = await composite.fetchLatest(SUPPORTED_FOREIGN, NOW);
    expect(rates.map((r) => r.currency).sort()).toEqual(
      SUPPORTED_FOREIGN.filter((c) =>
        KOREA_EXIM_PUBLISHED_CURRENCIES.includes(c),
      ).sort(),
    );
    expect(rates.every((r) => r.source === EXIM_LABEL)).toBe(true);
  });
});
