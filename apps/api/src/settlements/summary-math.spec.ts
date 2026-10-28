import {
  budgetRatio,
  budgetState,
  overBudget,
  spendingSplit,
  toPayReceive,
} from './summary-math.js';

describe('budget (4-6, FR-602)', () => {
  it('classifies the 80% and 100% boundaries with integer math', () => {
    expect(budgetState(79_999, 100_000)).toBe('NORMAL');
    expect(budgetState(80_000, 100_000)).toBe('CAUTION'); // 80% 경계는 Caution
    expect(budgetState(100_000, 100_000)).toBe('CAUTION'); // 100%까지 Caution
    expect(budgetState(100_001, 100_000)).toBe('OVER');
    expect(budgetState(0, 100_000)).toBe('NORMAL');
    // 0.8 × 3 = 2.4000000000000004 같은 부동소수점 함정이 없다
    expect(budgetState(12, 15)).toBe('CAUTION');
  });

  it('matches the spec samples', () => {
    expect(budgetState(352_790, 1_200_000)).toBe('NORMAL');
    expect(budgetRatio(352_790, 1_200_000)).toBe(0.294);
    expect(budgetState(1_000_000, 1_200_000)).toBe('CAUTION'); // 83%
    expect(budgetState(1_284_500, 1_200_000)).toBe('OVER');
    expect(overBudget(1_284_500, 1_200_000)).toBe(84_500);
    expect(overBudget(352_790, 1_200_000)).toBe(0);
  });

  it('rounds the ratio to four decimals for display only', () => {
    expect(budgetRatio(2, 3)).toBe(0.6667);
    expect(budgetRatio(0, 3)).toBe(0);
    expect(budgetRatio(1, 0)).toBe(0);
    expect(budgetState(1, 0)).toBe('OVER');
  });
});

describe('my spending (4-9, FR-603)', () => {
  it('splits shared and personal percentages that add up to 100', () => {
    expect(spendingSplit(94_770, 79_420)).toEqual({
      totalKrw: 174_190,
      sharedPct: 54,
      personalPct: 46,
    });
    expect(spendingSplit(1, 1)).toEqual({
      totalKrw: 2,
      sharedPct: 50,
      personalPct: 50,
    });
    expect(spendingSplit(10, 0)).toEqual({
      totalKrw: 10,
      sharedPct: 100,
      personalPct: 0,
    });
  });

  it('hides the ratio when there is no spending', () => {
    expect(spendingSplit(0, 0)).toEqual({
      totalKrw: 0,
      sharedPct: null,
      personalPct: null,
    });
  });
});

describe('to pay / to receive (FR-601)', () => {
  it('flips the sign of my net', () => {
    expect(toPayReceive(-32_080)).toEqual({
      toPayKrw: 32_080,
      toReceiveKrw: 0,
    });
    expect(toPayReceive(15_000)).toEqual({ toPayKrw: 0, toReceiveKrw: 15_000 });
    expect(toPayReceive(0)).toEqual({ toPayKrw: 0, toReceiveKrw: 0 });
  });
});
