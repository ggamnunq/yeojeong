import { parseWebOrigins } from './web-origins.js';

describe('parseWebOrigins', () => {
  it('returns an empty list when unset', () => {
    expect(parseWebOrigins(undefined)).toEqual([]);
    expect(parseWebOrigins('')).toEqual([]);
  });

  it('accepts a comma separated list of exact origins', () => {
    expect(
      parseWebOrigins('https://yeojeong.example.com, http://localhost:5173 ,'),
    ).toEqual(['https://yeojeong.example.com', 'http://localhost:5173']);
  });

  it.each([
    '*',
    'https://*.example.com',
    'https://yeojeong.example.com/',
    'https://yeojeong.example.com/app',
    'yeojeong.example.com',
    'ftp://yeojeong.example.com',
  ])('rejects %s', (origin) => {
    expect(() => parseWebOrigins(origin)).toThrow();
  });
});
