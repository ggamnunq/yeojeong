import {
  SYNC_OVERLAP_MS,
  computeSyncWindow,
  firstUncoveredAt,
} from './sync-window.js';

const t = (iso: string) => new Date(`${iso}+09:00`);
const trip = {
  startAt: t('2026-11-12T00:00:00'),
  autoEndAt: t('2026-11-15T23:59:59'),
};

describe('firstUncoveredAt', () => {
  const target = {
    fromAt: t('2026-11-12T00:00:00'),
    toAt: t('2026-11-13T00:00:00'),
  };

  it('returns null when intervals cover the target without gaps', () => {
    expect(
      firstUncoveredAt(target, [
        { fromAt: t('2026-11-12T12:00:00'), toAt: t('2026-11-13T01:00:00') },
        { fromAt: t('2026-11-11T00:00:00'), toAt: t('2026-11-12T12:00:00') },
      ]),
    ).toBeNull();
  });

  it('returns the first uncovered instant', () => {
    expect(firstUncoveredAt(target, [])).toEqual(target.fromAt);
    expect(
      firstUncoveredAt(target, [
        { fromAt: t('2026-11-12T00:00:00'), toAt: t('2026-11-12T06:00:00') },
        { fromAt: t('2026-11-12T08:00:00'), toAt: t('2026-11-13T00:00:00') },
      ]),
    ).toEqual(t('2026-11-12T06:00:00'));
  });
});

describe('computeSyncWindow (4-1-1)', () => {
  const now = t('2026-11-13T20:00:00');

  it('does nothing without an ongoing trip (FR-401 AC2)', () => {
    expect(
      computeSyncWindow({
        now,
        trips: [],
        lastSyncedAt: null,
        hasUnsyncedMethod: false,
        succeededRuns: [],
      }),
    ).toBeNull();
  });

  it('starts at the earliest trip start on the first sync', () => {
    expect(
      computeSyncWindow({
        now,
        trips: [trip],
        lastSyncedAt: null,
        hasUnsyncedMethod: true,
        succeededRuns: [],
      }),
    ).toEqual({
      fromAt: trip.startAt,
      toAt: now,
    });
  });

  it('overlaps the last sync by 72 hours when the trip is covered', () => {
    const last = t('2026-11-15T10:00:00');
    const later = t('2026-11-15T10:10:00');
    const runs = [{ fromAt: trip.startAt, toAt: last }];
    expect(
      computeSyncWindow({
        now: later,
        trips: [trip],
        lastSyncedAt: last,
        hasUnsyncedMethod: false,
        succeededRuns: runs,
      })?.fromAt,
    ).toEqual(new Date(last.getTime() - SYNC_OVERLAP_MS));
  });

  it('widens to the trip start when no successful run covered it (self-healing SH-2)', () => {
    const lastSynced = t('2026-11-13T19:50:00');
    // 다른 여정 때문에 최근 구간만 성공했고, 이 여정의 소급(TRIP_START)은 실패해 기록이 없다
    const runs = [{ fromAt: t('2026-11-13T09:00:00'), toAt: lastSynced }];
    expect(
      computeSyncWindow({
        now,
        trips: [trip],
        lastSyncedAt: lastSynced,
        hasUnsyncedMethod: false,
        succeededRuns: runs,
      })?.fromAt,
    ).toEqual(trip.startAt);
  });

  it('widens to the gap left while the connection was expired (beyond the 72h overlap)', () => {
    const longTrip = {
      startAt: trip.startAt,
      autoEndAt: t('2026-11-25T23:59:59'),
    };
    const later = t('2026-11-18T20:00:00');
    const runs = [
      { fromAt: trip.startAt, toAt: t('2026-11-13T09:00:00') },
      { fromAt: t('2026-11-18T19:00:00'), toAt: t('2026-11-18T19:50:00') },
    ];
    expect(
      computeSyncWindow({
        now: later,
        trips: [longTrip],
        lastSyncedAt: t('2026-11-18T19:50:00'),
        hasUnsyncedMethod: false,
        succeededRuns: runs,
      })?.fromAt,
    ).toEqual(t('2026-11-13T09:00:00'));
  });

  it('never reaches before the earliest trip start (minimum collection)', () => {
    expect(
      computeSyncWindow({
        now,
        trips: [trip],
        lastSyncedAt: null,
        hasUnsyncedMethod: false,
        requestedFromAt: t('2026-10-01T00:00:00'),
        succeededRuns: [],
      })?.fromAt,
    ).toEqual(trip.startAt);
  });

  it('keeps the pre-trip lookback (out-of-period candidates) until it is covered once', () => {
    const lookbackMs = 60 * 24 * 60 * 60 * 1000;
    const lookbackFrom = new Date(trip.startAt.getTime() - lookbackMs);
    expect(
      computeSyncWindow({
        now,
        trips: [trip],
        lastSyncedAt: null,
        hasUnsyncedMethod: true,
        succeededRuns: [],
        lookbackMs,
      })?.fromAt,
    ).toEqual(lookbackFrom);
    const last = t('2026-11-13T19:50:00');
    expect(
      computeSyncWindow({
        now,
        trips: [trip],
        lastSyncedAt: last,
        hasUnsyncedMethod: false,
        succeededRuns: [{ fromAt: lookbackFrom, toAt: last }],
        lookbackMs,
      })?.fromAt,
    ).toEqual(new Date(last.getTime() - SYNC_OVERLAP_MS));
  });
});
