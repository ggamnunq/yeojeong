import {
  activeLockRiskFailures,
  cooldownUntil,
  lockRiskCooldownUntil,
} from './card-import-limits.js';

// 현대·하나 잠김 위험 카운터(S8c) 판정. 시각은 고정값만 쓴다
const T = new Date('2026-11-13T06:00:00Z');
const at = (minutes: number) => new Date(T.getTime() + minutes * 60_000);

describe('lock-risk counter (Hyundai·Hana, S8c)', () => {
  it('keeps failures for 24 hours after the last failure, then forgets them', () => {
    const row = { lockRiskFailures: 2, lockRiskLastFailedAt: T };
    expect(activeLockRiskFailures(row, at(0))).toBe(2);
    expect(activeLockRiskFailures(row, at(24 * 60 - 1))).toBe(2);
    expect(activeLockRiskFailures(row, at(24 * 60))).toBe(0);
    expect(
      activeLockRiskFailures(
        { lockRiskFailures: 0, lockRiskLastFailedAt: null },
        at(0),
      ),
    ).toBe(0);
  });

  it('cools down for 30 minutes from the 2nd failure, but the counter stays after the cooldown', () => {
    const one = { lockRiskFailures: 1, lockRiskLastFailedAt: T };
    const two = { lockRiskFailures: 2, lockRiskLastFailedAt: T };
    expect(lockRiskCooldownUntil(one, at(1))).toBeNull();
    expect(lockRiskCooldownUntil(two, at(1))).toEqual(at(30));
    expect(lockRiskCooldownUntil(two, at(30))).toBeNull();
    // 쿨다운이 끝나도 24시간 안에는 2회로 남는다(다음 시도는 확인 필요)
    expect(activeLockRiskFailures(two, at(31))).toBe(2);
  });

  it('does not change the general 3-in-30-minutes cooldown', () => {
    expect(cooldownUntil({ failures: 2, lastFailedAt: T }, at(1))).toBeNull();
    expect(cooldownUntil({ failures: 3, lastFailedAt: T }, at(1))).toEqual(
      at(30),
    );
  });
});
