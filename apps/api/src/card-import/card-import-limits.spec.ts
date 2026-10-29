import { cooldownUntil, lockRiskDecision } from './card-import-limits.js';

// 현대·하나 잠김 위험 카운터(S8c) 판정. 시각은 고정값만 쓴다
const T = new Date('2026-11-13T06:00:00Z');
const at = (minutes: number) => new Date(T.getTime() + minutes * 60_000);

describe('lock-risk counter (Hyundai·Hana, S8c)', () => {
  it('asks for confirmation only at 1 and locks from 2 until a success, ignoring the acknowledgement', () => {
    expect(lockRiskDecision(0, false)).toBe('OK');
    expect(lockRiskDecision(1, false)).toBe('CONFIRM');
    expect(lockRiskDecision(1, true)).toBe('OK');
    expect(lockRiskDecision(2, true)).toBe('LOCKED');
    expect(lockRiskDecision(2, false)).toBe('LOCKED');
    expect(lockRiskDecision(5, true)).toBe('LOCKED');
  });

  it('does not change the general 3-in-30-minutes cooldown', () => {
    expect(cooldownUntil({ failures: 2, lastFailedAt: T }, at(1))).toBeNull();
    expect(cooldownUntil({ failures: 3, lastFailedAt: T }, at(1))).toEqual(
      at(30),
    );
  });
});
