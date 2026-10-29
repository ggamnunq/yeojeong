import { SUPPORTED_CURRENCY_CODES, currencyMeta } from '../fx/currencies.js';
import {
  CURRENCY_NAMES,
  SUPPORTED_CURRENCIES,
  TRIP_CURRENCY_CODES,
} from './currencies.js';

describe('여정 통화 목록(GET /api/currencies)', () => {
  it('puts KRW first and keeps the server table order', () => {
    expect(SUPPORTED_CURRENCIES[0]).toEqual({
      code: 'KRW',
      name: '대한민국 원',
      unitName: '원',
      displayUnit: 1,
    });
    expect(TRIP_CURRENCY_CODES).toEqual([
      'KRW',
      ...SUPPORTED_CURRENCY_CODES.filter((code) => code !== 'KRW'),
    ]);
    expect(SUPPORTED_CURRENCIES.map((c) => c.code)).toEqual(
      TRIP_CURRENCY_CODES,
    );
  });

  it('has a Korean name for every currency in the fx table and nothing else', () => {
    expect(Object.keys(CURRENCY_NAMES).sort()).toEqual(
      [...SUPPORTED_CURRENCY_CODES].sort(),
    );
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(currency.code).toMatch(/^[A-Z]{3}$/);
      expect(currency.name).not.toBe(currency.code);
      expect(currency.unitName).toBe(currencyMeta(currency.code).nameKo);
    }
  });

  it('carries the display unit from the fx table', () => {
    const byCode = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code, c]));
    expect(byCode.get('JPY')).toEqual({
      code: 'JPY',
      name: '일본 엔',
      unitName: '엔',
      displayUnit: 100,
    });
    expect(byCode.get('USD')?.displayUnit).toBe(1);
  });
});
