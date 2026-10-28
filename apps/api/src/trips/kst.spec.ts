import {
  addDays,
  dateOnly,
  diffDays,
  kstDate,
  kstEndOfDay,
  kstStartOfDay,
  parseDateOnly,
  toKstIso,
} from './kst.js';
import { COUNTRIES, PLACES, currencyOf, searchPlaces } from './places.js';

describe('kst', () => {
  it('uses the KST calendar date', () => {
    expect(kstDate(new Date('2026-11-12T14:59:59Z'))).toBe('2026-11-12');
    expect(kstDate(new Date('2026-11-12T15:00:00Z'))).toBe('2026-11-13');
  });

  it('computes startAt and autoEndAt in KST', () => {
    expect(kstStartOfDay('2026-11-12').toISOString()).toBe(
      '2026-11-11T15:00:00.000Z',
    );
    expect(kstEndOfDay('2026-11-15').toISOString()).toBe(
      '2026-11-15T14:59:59.000Z',
    );
    expect(toKstIso(kstEndOfDay('2026-11-15'))).toBe(
      '2026-11-15T23:59:59+09:00',
    );
  });

  it('parses only real calendar dates', () => {
    expect(dateOnly(parseDateOnly('2028-02-29')!)).toBe('2028-02-29');
    expect(parseDateOnly('2026-02-29')).toBeNull();
    expect(parseDateOnly('2026-1-01')).toBeNull();
  });

  it('adds and subtracts days across months', () => {
    expect(diffDays('2026-11-12', '2026-11-15')).toBe(3);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
    expect(addDays('2026-10-28', -30)).toBe('2026-09-28');
  });
});

describe('places', () => {
  it('derives the currency from the country', () => {
    expect(currencyOf('JP')).toBe('JPY');
    expect(currencyOf('KR')).toBe('KRW');
    expect(currencyOf('FR')).toBe('EUR');
    expect(currencyOf('ZZ')).toBeNull();
  });

  it('keeps every place consistent with the country table and DB checks', () => {
    for (const place of PLACES) {
      expect(place.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(place.currency).toMatch(/^[A-Z]{3}$/);
      expect(place.currency).toBe(COUNTRIES[place.countryCode].currency);
      // UTF-16 길이 ≥ 코드 포인트 수라 VarChar(40)보다 엄격하다
      expect(place.label.length).toBeLessThanOrEqual(40);
    }
    expect(new Set(PLACES.map((p) => p.label)).size).toBe(PLACES.length);
  });

  it('searches by city, country or label ignoring spaces', () => {
    expect(searchPlaces('오사카').map((p) => p.label)).toEqual(['일본 오사카']);
    expect(searchPlaces('일본오사카').map((p) => p.label)).toEqual([
      '일본 오사카',
    ]);
    expect(searchPlaces('베트남').every((p) => p.countryCode === 'VN')).toBe(
      true,
    );
    expect(searchPlaces('제주')[0]).toMatchObject({
      label: '제주',
      currency: 'KRW',
    });
    expect(searchPlaces(undefined)).toHaveLength(20);
    expect(searchPlaces('없는곳')).toEqual([]);
  });
});
