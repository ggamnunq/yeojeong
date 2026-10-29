import {
  KoreaEximFxRateSource,
  maskUrl,
  parseDealBasR,
} from './korea-exim-fx-rate-source.js';

const KEY = 'test-exim-secret-key-0000';
/** 2026-11-16(월) 11:10 KST */
const NOW = new Date('2026-11-16T02:10:00Z');

/** 실제 응답 형태를 줄인 것(필드 일부만) */
const item = (cur_unit: string, deal_bas_r: string, result = 1) => ({
  result,
  cur_unit,
  cur_nm: cur_unit,
  ttb: '0',
  tts: '0',
  deal_bas_r,
});
const NORMAL = [
  item('AED', '377.19'),
  item('CNH', '190.25'),
  item('EUR', '1,495.3'),
  item('IDR(100)', '8.72'),
  item('JPY(100)', '919.2'),
  item('KRW', '1'),
  item('USD', '1,385.5'),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** 호출마다 다음 응답(또는 예외)을 돌려주는 fetch. 받은 searchdate를 기록한다 */
function fakeFetch(...replies: (Response | Error)[]) {
  const searchdates: (string | null)[] = [];
  const urls: string[] = [];
  const fn = vi.fn((input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    urls.push(url.toString());
    searchdates.push(url.searchParams.get('searchdate'));
    const reply = replies.shift() ?? json([]);
    return reply instanceof Error
      ? Promise.reject(reply)
      : Promise.resolve(reply);
  });
  return { fn, searchdates, urls };
}

function makeSource(fetchFn: ReturnType<typeof fakeFetch>['fn']) {
  const sleep = vi.fn((_ms: number) => Promise.resolve());
  const source = new KoreaEximFxRateSource(KEY, {
    fetch: fetchFn as unknown as typeof fetch,
    sleep,
  });
  return { source, sleep };
}

describe('KoreaEximFxRateSource', () => {
  it('normalises units, commas and CNH, and returns only requested currencies', async () => {
    const http = fakeFetch(json(NORMAL));
    const { source } = makeSource(http.fn);
    const rates = await source.fetchLatest(
      ['CNY', 'EUR', 'IDR', 'JPY', 'KRW', 'TWD', 'USD'],
      NOW,
    );
    const effectiveAt = new Date('2026-11-16T11:00:00+09:00');
    expect(rates).toEqual([
      {
        currency: 'CNY',
        ratePerUnit: '190.250000',
        displayUnit: 1,
        effectiveAt,
      },
      {
        currency: 'EUR',
        ratePerUnit: '1495.300000',
        displayUnit: 1,
        effectiveAt,
      },
      {
        currency: 'IDR',
        ratePerUnit: '0.087200',
        displayUnit: 100,
        effectiveAt,
      },
      {
        currency: 'JPY',
        ratePerUnit: '9.192000',
        displayUnit: 100,
        effectiveAt,
      },
      {
        currency: 'USD',
        ratePerUnit: '1385.500000',
        displayUnit: 1,
        effectiveAt,
      },
    ]); // AED는 요청 안 함, KRW는 건너뜀, TWD는 고시 없음
    expect(http.searchdates).toEqual(['20261116']);
    const url = new URL(http.urls[0]);
    expect(url.origin + url.pathname).toBe(
      'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON',
    );
    expect(url.searchParams.get('authkey')).toBe(KEY);
    expect(url.searchParams.get('data')).toBe('AP01');
    const init = http.fn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init[1]).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(init[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('uses the KST calendar date for searchdate', async () => {
    const http = fakeFetch(json(NORMAL));
    const { source } = makeSource(http.fn);
    // UTC로는 11/15지만 KST로는 11/16 08:30
    await source.fetchLatest(['USD'], new Date('2026-11-15T23:30:00Z'));
    expect(http.searchdates).toEqual(['20261116']);
  });

  it('skips a malformed row without failing the others', async () => {
    const http = fakeFetch(
      json([
        item('USD', '1,38,5.5'),
        item('JPY(100)', '919.2'),
        item('EUR', ''),
      ]),
    );
    const { source } = makeSource(http.fn);
    const rates = await source.fetchLatest(['EUR', 'JPY', 'USD'], NOW);
    expect(rates.map((r) => r.currency)).toEqual(['JPY']);
  });

  it('looks back to the previous KST day on an empty response', async () => {
    const http = fakeFetch(json([]), json([]), json(NORMAL));
    const { source } = makeSource(http.fn);
    const rates = await source.fetchLatest(['USD'], NOW);
    expect(http.searchdates).toEqual(['20261116', '20261115', '20261114']);
    expect(rates).toEqual([
      {
        currency: 'USD',
        ratePerUnit: '1385.500000',
        displayUnit: 1,
        effectiveAt: new Date('2026-11-14T11:00:00+09:00'),
      },
    ]);
  });

  it('returns [] after 8 empty days (today + 7 back)', async () => {
    const http = fakeFetch();
    const { source } = makeSource(http.fn);
    await expect(source.fetchLatest(['USD'], NOW)).resolves.toEqual([]);
    expect(http.searchdates).toEqual([
      '20261116',
      '20261115',
      '20261114',
      '20261113',
      '20261112',
      '20261111',
      '20261110',
      '20261109',
    ]);
  });

  it('fails on an auth error without retrying or leaking the key', async () => {
    const http = fakeFetch(json([item('', '', 3)]));
    const { source, sleep } = makeSource(http.fn);
    const error = (await source
      .fetchLatest(['USD'], NOW)
      .catch((e: unknown) => e)) as Error;
    expect(error.message).toContain('인증코드 오류');
    expect(error.message).not.toContain(KEY);
    expect(JSON.stringify(error)).not.toContain(KEY);
    expect(error.cause).toBeUndefined();
    expect(http.fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails on the daily limit and on a data code error without retrying', async () => {
    for (const [result, message] of [
      [4, '일일 제한 횟수 마감'],
      [2, 'DATA 코드 오류'],
    ] as const) {
      const http = fakeFetch(json([item('USD', '1', result)]));
      const { source } = makeSource(http.fn);
      await expect(source.fetchLatest(['USD'], NOW)).rejects.toThrow(message);
      expect(http.fn).toHaveBeenCalledTimes(1);
    }
  });

  it('retries a 5xx and then succeeds', async () => {
    const http = fakeFetch(json({}, 503), json(NORMAL));
    const { source, sleep } = makeSource(http.fn);
    const rates = await source.fetchLatest(['USD'], NOW);
    expect(rates.map((r) => r.ratePerUnit)).toEqual(['1385.500000']);
    expect(http.searchdates).toEqual(['20261116', '20261116']);
    expect(sleep.mock.calls).toEqual([[300]]);
  });

  it('retries a non-JSON body', async () => {
    const http = fakeFetch(
      new Response('<html>점검 중</html>', { status: 200 }),
      json(NORMAL),
    );
    const { source } = makeSource(http.fn);
    await expect(source.fetchLatest(['USD'], NOW)).resolves.toHaveLength(1);
    expect(http.fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a redirect or 4xx', async () => {
    const http = fakeFetch(
      new Response(null, { status: 302, headers: { location: '/login' } }),
    );
    const { source } = makeSource(http.fn);
    await expect(source.fetchLatest(['USD'], NOW)).rejects.toThrow('302');
    expect(http.fn).toHaveBeenCalledTimes(1);
  });

  it('throws after the network retries are exhausted, without the key', async () => {
    const leaky = new TypeError(
      `fetch failed https://oapi.koreaexim.go.kr/x?authkey=${KEY}`,
      { cause: { code: 'ECONNRESET' } },
    );
    const http = fakeFetch(leaky, leaky, leaky);
    const { source, sleep } = makeSource(http.fn);
    const error = (await source
      .fetchLatest(['USD'], NOW)
      .catch((e: unknown) => e)) as Error;
    expect(error.message).toContain('ECONNRESET');
    expect(error.message).not.toContain(KEY);
    expect(error.cause).toBeUndefined();
    expect(http.fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[300], [900]]);
  });

  it('stops retrying when the time budget would be exceeded', async () => {
    let clock = 0;
    const http = fakeFetch(new TypeError('fetch failed'), json(NORMAL));
    const source = new KoreaEximFxRateSource(KEY, {
      fetch: http.fn as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      clock: () => clock,
      budgetMs: 1_000,
    });
    http.fn.mockImplementationOnce(() => {
      clock = 900; // 첫 호출이 오래 걸렸다 → 300ms 기다리면 예산 초과
      return Promise.reject(new TypeError('fetch failed'));
    });
    await expect(source.fetchLatest(['USD'], NOW)).rejects.toThrow('연결 실패');
    expect(http.fn).toHaveBeenCalledTimes(1);
  });

  it('requires a key', () => {
    expect(() => new KoreaEximFxRateSource('')).toThrow('EXIM_API_KEY');
  });
});

describe('Korea Exim helpers', () => {
  it('masks the authkey in a URL', () => {
    expect(
      maskUrl(
        `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${KEY}&searchdate=20261116&data=AP01`,
      ),
    ).toBe(
      'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=***&searchdate=20261116&data=AP01',
    );
    expect(maskUrl(`https://x.test/?data=AP01&AUTHKEY=${KEY}`)).toBe(
      'https://x.test/?data=AP01&AUTHKEY=***',
    );
    expect(maskUrl('https://x.test/?data=AP01')).toBe(
      'https://x.test/?data=AP01',
    );
  });

  it('parses deal_bas_r per unit with half-up rounding and no floats', () => {
    expect(parseDealBasR('1,385.5', 1)).toBe('1385.500000');
    expect(parseDealBasR('919.2', 100)).toBe('9.192000');
    expect(parseDealBasR('8.72', 100)).toBe('0.087200');
    expect(parseDealBasR('0.00005', 100)).toBe('0.000001'); // 0.0000005 → half-up
    expect(parseDealBasR(' 1,234,567.89 ', 1)).toBe('1234567.890000');
    for (const bad of ['', '-1', '0', '1.2.3', '1,2345', 'abc', '1e3']) {
      expect(parseDealBasR(bad, 1)).toBeNull();
    }
    expect(parseDealBasR(1385.5, 1)).toBeNull();
    expect(parseDealBasR('1', 0)).toBeNull();
  });
});
