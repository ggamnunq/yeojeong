import { RETENTION, cutoff, isPastRetention } from './retention-policy.js';

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

  it('matches the 8-8 table', () => {
    expect(RETENTION).toEqual({
      softDeletedGroup: { days: 30 },
      groupRecords: { years: 3 },
      rawPayload: { days: 90 },
      removedPaymentMethod: { days: 30 },
      revokedConnection: { days: 30 },
      inactiveUser: { years: 3 },
      withdrawnConsent: { years: 3 },
      accessLog: { years: 1 },
      accountDeletion: { years: 3 },
    });
  });
});
