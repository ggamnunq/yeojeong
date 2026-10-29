import {
  crossRatePerUnit,
  ER_API_ENDPOINT,
  ER_API_SOURCE_LABEL,
  ExchangeRateApiFxRateSource,
  scaledOf,
} from './exchange-rate-api-fx-rate-source.js';
import {
  ER_API_FIXTURE,
  ER_API_UPDATED_UNIX as UPDATED,
} from '../../test/fx-fixtures.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fakeFetch(...replies: (Response | Error)[]) {
  const fn = vi.fn((_input: string | URL | Request, _init?: RequestInit) => {
    const reply = replies.shift() ?? json(ER_API_FIXTURE);
    return reply instanceof Error
      ? Promise.reject(reply)
      : Promise.resolve(reply);
  });
  return fn;
}

function makeSource(fetchFn: ReturnType<typeof fakeFetch>) {
  const sleep = vi.fn((_ms: number) => Promise.resolve());
  const source = new ExchangeRateApiFxRateSource({
    fetch: fetchFn as unknown as typeof fetch,
    sleep,
  });
  return { source, sleep };
}

describe('ExchangeRateApiFxRateSource', () => {
  it('computes KRW per unit via the USD cross rate with display units and attribution', async () => {
    const http = fakeFetch(json(ER_API_FIXTURE));
    const { source } = makeSource(http);
    const rates = await source.fetchLatest([
      'TWD',
      'VND',
      'PHP',
      'IDR',
      'USD',
      'KRW',
      'ZZZ',
    ]);
    const effectiveAt = new Date(UPDATED * 1000);
    expect(rates).toEqual([
      // 1340.24082 / 32.415976 = 41.3450710…
      {
        currency: 'TWD',
        ratePerUnit: '41.345071',
        displayUnit: 1,
        effectiveAt,
        source: ER_API_SOURCE_LABEL,
      },
      // 1340.24082 / 25834.040863 = 0.0518788…, 고시 단위 100동
      {
        currency: 'VND',
        ratePerUnit: '0.051879',
        displayUnit: 100,
        effectiveAt,
        source: ER_API_SOURCE_LABEL,
      },
      {
        currency: 'PHP',
        ratePerUnit: '20.942089',
        displayUnit: 1,
        effectiveAt,
        source: ER_API_SOURCE_LABEL,
      },
      {
        currency: 'IDR',
        ratePerUnit: '0.073714',
        displayUnit: 100,
        effectiveAt,
        source: ER_API_SOURCE_LABEL,
      },
      {
        currency: 'USD',
        ratePerUnit: '1340.240820',
        displayUnit: 1,
        effectiveAt,
        source: ER_API_SOURCE_LABEL,
      },
    ]); // KRW는 건너뜀, ZZZ는 이 소스에도 없음
    expect(http).toHaveBeenCalledTimes(1);
    const [url, init] = http.mock.calls[0];
    expect(url).toBe(ER_API_ENDPOINT);
    expect(ER_API_ENDPOINT).toBe('https://open.er-api.com/v6/latest/USD');
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not call out when only KRW is requested', async () => {
    const http = fakeFetch();
    const { source } = makeSource(http);
    await expect(source.fetchLatest(['KRW'])).resolves.toEqual([]);
    expect(http).not.toHaveBeenCalled();
  });

  it('skips a malformed rate without failing the others', async () => {
    const http = fakeFetch(
      json({
        ...ER_API_FIXTURE,
        rates: { ...ER_API_FIXTURE.rates, TWD: '32.4', PHP: -1, VND: 0 },
      }),
    );
    const { source } = makeSource(http);
    const rates = await source.fetchLatest(['PHP', 'THB', 'TWD', 'VND']);
    expect(rates.map((r) => r.currency)).toEqual(['THB']);
  });

  it('fails without retrying on an API error result, a 429 or a missing KRW', async () => {
    for (const [reply, message] of [
      [
        json({ result: 'error', 'error-type': 'unsupported-code' }),
        'unsupported-code',
      ],
      [json({}, 429), '429'],
      [json({ ...ER_API_FIXTURE, rates: { USD: 1, TWD: 32.4 } }), 'KRW'],
      [json({ ...ER_API_FIXTURE, base_code: 'EUR' }), '형식 오류'],
    ] as const) {
      const http = fakeFetch(reply);
      const { source, sleep } = makeSource(http);
      await expect(source.fetchLatest(['TWD'])).rejects.toThrow(message);
      expect(http).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('retries once on a network error or 5xx, then gives up', async () => {
    const ok = fakeFetch(json({}, 502), json(ER_API_FIXTURE));
    const first = makeSource(ok);
    await expect(first.source.fetchLatest(['TWD'])).resolves.toHaveLength(1);
    expect(first.sleep.mock.calls).toEqual([[500]]);

    const down = fakeFetch(
      new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }),
      new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }),
    );
    const second = makeSource(down);
    await expect(second.source.fetchLatest(['TWD'])).rejects.toThrow(
      'ECONNREFUSED',
    );
    expect(down).toHaveBeenCalledTimes(2);
  });
});

describe('ExchangeRate-API helpers', () => {
  it('reads floats as fixed decimals without exponent notation', () => {
    expect(scaledOf(1340.24082)).toBe(1340240820000000n);
    expect(scaledOf(0.000123)).toBe(123000000n);
    expect(scaledOf(1e-7)).toBe(100000n);
    for (const bad of [0, -1, Number.NaN, Infinity, '1', null, 1e16]) {
      expect(scaledOf(bad)).toBeNull();
    }
  });

  it('rounds the cross rate half-up to 6 decimals', () => {
    expect(crossRatePerUnit(scaledOf(1380.5)!, scaledOf(1)!)).toBe(
      '1380.500000',
    );
    expect(crossRatePerUnit(scaledOf(3)!, scaledOf(2)!)).toBe('1.500000');
    // 1 / 3 = 0.3333333… → 0.333333
    expect(crossRatePerUnit(scaledOf(1)!, scaledOf(3)!)).toBe('0.333333');
    // 2 / 3 = 0.6666666… → 0.666667
    expect(crossRatePerUnit(scaledOf(2)!, scaledOf(3)!)).toBe('0.666667');
    // 0이 되면 null
    expect(crossRatePerUnit(1n, 10n ** 20n)).toBeNull();
  });
});
