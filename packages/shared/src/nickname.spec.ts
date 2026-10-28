import { describe, expect, it } from 'vitest';
import {
  graphemeLength,
  normalizeNickname,
  truncateGraphemes,
} from './nickname.js';

describe('nickname', () => {
  it('trims and accepts 1 to 10 graphemes', () => {
    expect(normalizeNickname('  준용 ')).toEqual({ ok: true, value: '준용' });
    expect(normalizeNickname('가나다라마바사아자차')).toMatchObject({
      ok: true,
    });
  });

  it('counts emoji sequences as one character', () => {
    expect(graphemeLength('👨‍👩‍👧‍👦')).toBe(1);
    expect(normalizeNickname('👨‍👩‍👧‍👦'.repeat(10))).toMatchObject({ ok: true });
    expect(normalizeNickname('👍🏽'.repeat(11))).toEqual({
      ok: false,
      reason: 'TOO_LONG',
    });
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['가나다라마바사아자차카', 'TOO_LONG'],
    ['준\n용', 'INVALID_CHARACTER'],
    ['준\t용', 'INVALID_CHARACTER'],
    ['준\u2028용', 'INVALID_CHARACTER'],
  ])('rejects %j (%s)', (input, reason) => {
    expect(normalizeNickname(input)).toEqual({ ok: false, reason });
  });

  it('truncates by graphemes', () => {
    expect(truncateGraphemes('가나다라마바사아자차카타', 10)).toBe(
      '가나다라마바사아자차',
    );
    expect(truncateGraphemes('👨‍👩‍👧ab', 2)).toBe('👨‍👩‍👧a');
  });
});
