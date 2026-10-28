import { describe, expect, it } from 'vitest';
import { formatKrw, splitEvenly, toKrw } from './money.js';

const members = (...ids: string[]) =>
  ids.map((membershipId, i) => ({ membershipId, joinOrder: i + 1 }));

describe('splitEvenly', () => {
  it('gives the remainder to the payer (FR-509 #1)', () => {
    const result = splitEvenly(26290, members('payer', 'b', 'c', 'd'), 'payer');
    expect(result.perPersonKrw).toBe(6572);
    expect(result.remainderKrw).toBe(2);
    expect(result.remainderHolderMembershipId).toBe('payer');
    expect(result.shares.map((s) => s.amountKrw)).toEqual([
      6574, 6572, 6572, 6572,
    ]);
    expect(result.shares.map((s) => s.isRemainderHolder)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it('splits zero without a remainder holder (FR-509 #2)', () => {
    const result = splitEvenly(0, members('a', 'b', 'c', 'd'), 'a');
    expect(result.shares.every((s) => s.amountKrw === 0)).toBe(true);
    expect(result.remainderKrw).toBe(0);
    expect(result.remainderHolderMembershipId).toBeNull();
    expect(result.shares.some((s) => s.isRemainderHolder)).toBe(false);
  });

  it.each([
    [25740, 4, 6435],
    [25740, 3, 8580],
    [79420, 4, 19855],
    [26290, 2, 13145],
  ])('splits %i among %i people into %i each', (net, n, each) => {
    const ids = ['p', 'q', 'r', 's'].slice(0, n);
    const result = splitEvenly(net, members(...ids), 'p');
    expect(result.perPersonKrw).toBe(each);
    expect(result.shares.reduce((sum, s) => sum + s.amountKrw, 0)).toBe(net);
  });

  it('keeps the input order and the sum for any remainder', () => {
    const result = splitEvenly(100, members('a', 'payer', 'c'), 'payer');
    expect(result.shares.map((s) => s.membershipId)).toEqual([
      'a',
      'payer',
      'c',
    ]);
    expect(result.shares.map((s) => s.amountKrw)).toEqual([33, 34, 33]);
  });

  it('gives the remainder to the earliest member when the payer is not a participant', () => {
    const participants = [
      { membershipId: 'late', joinOrder: 4 },
      { membershipId: 'early', joinOrder: 2 },
    ];
    const result = splitEvenly(101, participants, 'payer');
    expect(result.remainderHolderMembershipId).toBe('early');
    expect(result.shares).toEqual([
      { membershipId: 'late', amountKrw: 50, isRemainderHolder: false },
      { membershipId: 'early', amountKrw: 51, isRemainderHolder: true },
    ]);
  });

  it('rejects invalid input', () => {
    expect(() => splitEvenly(100, [], 'a')).toThrow('PARTICIPANTS_REQUIRED');
    expect(() => splitEvenly(100, members('a', 'a'), 'a')).toThrow();
    expect(() => splitEvenly(-1, members('a'), 'a')).toThrow();
    expect(() => splitEvenly(1.5, members('a'), 'a')).toThrow();
  });
});

describe('toKrw', () => {
  it.each([
    ['5960', '9.192', 54780],
    ['2860', '9.192', 26290],
    ['12.50', '1380.5', 17260],
    ['-5960', '9.192', -54780],
    ['0', '9.192', 0],
  ])('%s × %s → %i', (amount, rate, krw) => {
    expect(toKrw(amount, rate)).toBe(krw);
  });

  it('rounds half up to 10 won', () => {
    expect(toKrw('1', '5')).toBe(10);
    expect(toKrw('1', '4.9999')).toBe(0);
  });

  it('rejects malformed numbers', () => {
    expect(() => toKrw('1e3', '9.192')).toThrow();
    expect(() => toKrw('1.23456', '9.192')).toThrow();
    expect(() => toKrw('100', '-1')).toThrow();
  });
});

describe('formatKrw', () => {
  it('formats with a minus sign and an optional plus sign', () => {
    expect(formatKrw(-26340)).toBe('−₩26,340');
    expect(formatKrw(103090, { sign: true })).toBe('+₩103,090');
    expect(formatKrw(0, { sign: true })).toBe('₩0');
  });
});
