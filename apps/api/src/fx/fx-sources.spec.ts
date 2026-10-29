import type { ConfigService } from '@nestjs/config';
import {
  createFxRateSource,
  DemoFxRateSource,
  KoreaEximFxRateSource,
} from './fx-rate-source.js';
import { SpotRateTable } from './fx-rates.service.js';
import { asOfFromQuery, toKstIso } from './kst.js';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('SpotRateTable (SPOT = 직전 고시)', () => {
  const at = (iso: string) => new Date(iso);
  const table = new SpotRateTable(
    new Map([
      [
        'JPY',
        [
          {
            rate: '9.100000',
            source: 's',
            effectiveAt: at('2026-11-12T02:00:00Z'),
          },
          {
            rate: '9.192000',
            source: 's',
            effectiveAt: at('2026-11-13T02:00:00Z'),
          },
          {
            rate: '9.300000',
            source: 's',
            effectiveAt: at('2026-11-16T02:00:00Z'),
          },
        ],
      ],
    ]),
  );

  it('picks the latest rate at or before the payment', () => {
    expect(table.find('JPY', at('2026-11-13T02:00:00Z'))?.rate).toBe(
      '9.192000',
    ); // 경계 포함
    expect(table.find('JPY', at('2026-11-15T12:00:00Z'))?.rate).toBe(
      '9.192000',
    ); // 주말 = 직전 고시
    expect(table.find('JPY', at('2026-11-20T00:00:00Z'))?.rate).toBe(
      '9.300000',
    );
  });

  it('falls back to the earliest rate before the first publication, and null without rates', () => {
    expect(table.find('JPY', at('2026-01-01T00:00:00Z'))?.rate).toBe(
      '9.100000',
    );
    expect(table.find('USD', at('2026-11-13T00:00:00Z'))).toBeNull();
  });
});

describe('FxRateSource', () => {
  it('demo returns the sample rates at the top of the hour', async () => {
    const source = new DemoFxRateSource();
    const rates = await source.fetchLatest(
      ['JPY', 'USD', 'ZZZ'],
      new Date('2026-11-13T09:34:56.789Z'),
    );
    expect(rates).toEqual([
      {
        currency: 'JPY',
        ratePerUnit: '9.192',
        displayUnit: 100,
        effectiveAt: new Date('2026-11-13T09:00:00Z'),
      },
      {
        currency: 'USD',
        ratePerUnit: '1380.5',
        displayUnit: 1,
        effectiveAt: new Date('2026-11-13T09:00:00Z'),
      },
    ]);
  });

  it('is picked by FX_RATE_SOURCE', async () => {
    expect(createFxRateSource(config({}))).toBeInstanceOf(DemoFxRateSource);
    expect(
      createFxRateSource(config({ FX_RATE_SOURCE: 'DEMO' })),
    ).toBeInstanceOf(DemoFxRateSource);
    const exim = createFxRateSource(config({ FX_RATE_SOURCE: 'koreaexim' }));
    expect(exim).toBeInstanceOf(KoreaEximFxRateSource);
    await expect(exim.fetchLatest(['JPY'], new Date())).rejects.toThrow();
    expect(() =>
      createFxRateSource(config({ FX_RATE_SOURCE: 'scrape' })),
    ).toThrow('FX_RATE_SOURCE');
  });
});

describe('KST helpers', () => {
  it('formats with the +09:00 offset', () => {
    expect(toKstIso(new Date('2026-11-12T23:50:00.123Z'))).toBe(
      '2026-11-13T08:50:00+09:00',
    );
  });

  it('reads a date query as the end of that KST day', () => {
    expect(asOfFromQuery('2026-11-13')?.toISOString()).toBe(
      '2026-11-13T14:59:59.999Z',
    );
    expect(asOfFromQuery('2026-11-13T08:50:00+09:00')?.toISOString()).toBe(
      '2026-11-12T23:50:00.000Z',
    );
    expect(asOfFromQuery('2026-13-45')).toBeNull();
  });
});
