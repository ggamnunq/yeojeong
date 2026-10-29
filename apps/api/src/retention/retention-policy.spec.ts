import {
  RETENTION,
  WITHIN_30_DAYS,
  cutoff,
  isPastRetention,
} from './retention-policy.js';

const at = (iso: string) => new Date(iso);

describe('cutoff', () => {
  it('subtracts whole 24-hour days for day periods', () => {
    expect(cutoff(at('2026-11-15T03:00:00Z'), { days: 30 })).toEqual(
      at('2026-10-16T03:00:00Z'),
    );
    expect(cutoff(at('2026-11-15T03:00:00Z'), RETENTION.rawPayload)).toEqual(
      at('2026-08-17T03:00:00Z'),
    );
  });

  it('subtracts calendar years for year periods', () => {
    expect(cutoff(at('2026-11-15T03:00:00Z'), { years: 3 })).toEqual(
      at('2023-11-15T03:00:00Z'),
    );
    expect(cutoff(at('2026-11-15T03:00:00Z'), RETENTION.accessLog)).toEqual(
      at('2025-11-15T03:00:00Z'),
    );
  });

  it('moves Feb 29 back to Feb 28 so nothing is deleted a day early', () => {
    expect(cutoff(at('2028-02-29T10:00:00Z'), { years: 1 })).toEqual(
      at('2027-02-28T10:00:00Z'),
    );
    expect(cutoff(at('2028-02-29T10:00:00Z'), { years: 3 })).toEqual(
      at('2025-02-28T10:00:00Z'),
    );
    // 윤년끼리는 그대로
    expect(cutoff(at('2028-02-29T10:00:00Z'), { years: 4 })).toEqual(
      at('2024-02-29T10:00:00Z'),
    );
  });
});

describe('isPastRetention (경계)', () => {
  const now = at('2026-11-15T03:00:00.000Z');

  it('treats exactly the full period as past (inclusive)', () => {
    expect(
      isPastRetention(at('2026-10-16T03:00:00.000Z'), now, { days: 30 }),
    ).toBe(true);
    expect(
      isPastRetention(at('2023-11-15T03:00:00.000Z'), now, { years: 3 }),
    ).toBe(true);
  });

  it('keeps rows one millisecond short of the period', () => {
    expect(
      isPastRetention(at('2026-10-16T03:00:00.001Z'), now, { days: 30 }),
    ).toBe(false);
    expect(
      isPastRetention(at('2023-11-15T03:00:00.001Z'), now, { years: 3 }),
    ).toBe(false);
  });

  it('purges "within 30 days" items after 29 days so a daily run never exceeds 30', () => {
    expect(WITHIN_30_DAYS).toEqual({ days: 29 });
    // 29일 꽉 채운 행은 대상, 1ms 모자라면 아직
    expect(
      isPastRetention(at('2026-10-17T03:00:00.000Z'), now, WITHIN_30_DAYS),
    ).toBe(true);
    expect(
      isPastRetention(at('2026-10-17T03:00:00.001Z'), now, WITHIN_30_DAYS),
    ).toBe(false);
    // 배치를 놓친 행도 다음 날(30일째) 실행에서 지워진다
    const deletedAt = at('2026-10-16T03:00:00.001Z');
    const nextRun = at('2026-11-15T03:00:00.000Z');
    expect(nextRun.getTime() - deletedAt.getTime()).toBeLessThan(
      30 * 86_400_000,
    );
    expect(isPastRetention(deletedAt, nextRun, WITHIN_30_DAYS)).toBe(true);
  });

  it('matches the 8-8 table', () => {
    expect(RETENTION).toEqual({
      softDeletedGroup: { days: 29 },
      groupRecords: { years: 3 },
      rawPayload: { days: 90 },
      removedPaymentMethod: { days: 29 },
      revokedConnection: { days: 29 },
      inactiveUser: { years: 3 },
      withdrawnConsent: { years: 3 },
      accessLog: { years: 1 },
      accountDeletion: { years: 3 },
      cardImportCounters: { days: 7 },
    });
  });
});
