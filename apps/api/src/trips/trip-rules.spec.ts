import type { TripStatus } from '@yeojeong/shared';
import {
  canStartTrip,
  checkTripPeriod,
  isAutoEndDue,
  pickSuccessor,
  planTripUpdate,
  tripCalendar,
  tripPermissions,
  tripShell,
  type TripSnapshot,
  startBlockReason,
} from './trip-rules.js';

const codesOf = (errors: { path: string; code?: string }[]) =>
  errors.map((e) => `${e.path}:${e.code}`);

describe('pickSuccessor (그룹장 승계, 4-7)', () => {
  const m = (id: string, joinOrder: number, left = false) => ({
    id,
    joinOrder,
    leftAt: left ? new Date() : null,
  });

  it('picks the active member with the smallest joinOrder, skipping the leaver', () => {
    const members = [m('d', 4), m('a', 1), m('c', 3), m('b', 2)];
    expect(pickSuccessor(members, 'a')?.id).toBe('b');
  });

  it('skips members who already left (including a smaller joinOrder)', () => {
    const members = [m('a', 1), m('b', 2, true), m('c', 3), m('d', 4)];
    expect(pickSuccessor(members, 'a')?.id).toBe('c');
  });

  it('does not depend on input order', () => {
    const members = [m('z', 9), m('y', 5), m('x', 7)];
    expect(pickSuccessor(members, 'none')?.id).toBe('y');
    expect(pickSuccessor([...members].reverse(), 'none')?.id).toBe('y');
  });

  it('returns null for the last member', () => {
    expect(pickSuccessor([m('a', 1)], 'a')).toBeNull();
    expect(pickSuccessor([m('a', 1), m('b', 2, true)], 'a')).toBeNull();
  });
});

describe('checkTripPeriod (FR-201, Q-29)', () => {
  const today = '2026-10-28';
  const opts = { today, checkStartPast: true };

  it('accepts a valid period, including a single day and 31 days', () => {
    expect(checkTripPeriod('2026-11-12', '2026-11-15', opts)).toEqual([]);
    expect(checkTripPeriod('2026-11-12', '2026-11-12', opts)).toEqual([]);
    expect(checkTripPeriod('2026-11-01', '2026-12-01', opts)).toEqual([]);
  });

  it('rejects end before start and periods longer than 31 days', () => {
    expect(codesOf(checkTripPeriod('2026-11-15', '2026-11-12', opts))).toEqual([
      'endDate:endBeforeStart',
    ]);
    expect(codesOf(checkTripPeriod('2026-11-01', '2026-12-02', opts))).toEqual([
      'endDate:maxDays',
    ]);
  });

  it('allows a start date up to 30 days in the past only when asked', () => {
    expect(checkTripPeriod('2026-09-28', '2026-09-30', opts)).toEqual([]);
    expect(codesOf(checkTripPeriod('2026-09-27', '2026-09-30', opts))).toEqual([
      'startDate:startTooEarly',
    ]);
    expect(
      checkTripPeriod('2026-09-01', '2026-09-03', {
        today,
        checkStartPast: false,
      }),
    ).toEqual([]);
  });

  it('rejects impossible calendar dates', () => {
    expect(codesOf(checkTripPeriod('2026-02-30', '2026-03-02', opts))).toEqual([
      'startDate:isDate',
    ]);
    expect(codesOf(checkTripPeriod('2026-11-01', '2026-13-01', opts))).toEqual([
      'endDate:isDate',
    ]);
  });

  it('enforces the minimum end date while ongoing', () => {
    expect(
      codesOf(
        checkTripPeriod('2026-10-25', '2026-10-27', {
          ...opts,
          minEndDate: today,
        }),
      ),
    ).toEqual(['endDate:endBeforeToday']);
    expect(
      checkTripPeriod('2026-10-25', '2026-10-28', {
        ...opts,
        minEndDate: today,
      }),
    ).toEqual([]);
  });
});

describe('planTripUpdate (단계별 수정 가능 항목, FR-302·Q-14)', () => {
  const base = (status: TripStatus): TripSnapshot => ({
    status,
    groupName: '오사카 3박 4일',
    place: { countryCode: 'JP', city: '오사카', label: '일본 오사카' },
    currency: 'JPY',
    startDate: '2026-11-12',
    endDate: '2026-11-15',
    budgetKrw: 1_200_000,
  });
  const kyoto = { countryCode: 'JP', city: '교토', label: '일본 교토' };

  it('lets everything change before the start and keeps the currency when only the place changes', () => {
    const plan = planTripUpdate(
      base('UPCOMING'),
      {
        groupName: '교토',
        place: kyoto,
        startDate: '2026-11-13',
        endDate: '2026-11-16',
        budgetKrw: 1,
      },
      '2026-10-28',
    );
    expect(plan.lockedFields).toEqual([]);
    expect(plan.fieldErrors).toEqual([]);
    expect(plan.changed).toEqual([
      'groupName',
      'place',
      'startDate',
      'endDate',
      'budgetKrw',
    ]);
    expect(plan.next).toMatchObject({
      place: kyoto,
      currency: 'JPY',
      startDate: '2026-11-13',
    });
  });

  it('takes a free-text place and clears the old list fields when the label changes', () => {
    const plan = planTripUpdate(
      base('UPCOMING'),
      { place: { label: '제주 + 부산' } },
      '2026-10-28',
    );
    expect(plan.changed).toEqual(['place']);
    expect(plan.next.place).toEqual({
      label: '제주 + 부산',
      countryCode: null,
      city: null,
    });
    // 장소가 바뀌어도 통화는 따로 고른 값 그대로(국가로 정하지 않는다)
    expect(plan.next.currency).toBe('JPY');
  });

  it('keeps the old list fields of a legacy trip when only the label is sent unchanged', () => {
    const plan = planTripUpdate(
      base('ONGOING'),
      { place: { label: '일본 오사카' } },
      '2026-11-13',
    );
    expect(plan).toMatchObject({ changed: [], lockedFields: [] });
    expect(plan.next.place).toEqual(base('ONGOING').place);
  });

  it('changes the currency only before the start, like the place', () => {
    const upcoming = planTripUpdate(
      base('UPCOMING'),
      { currency: 'KRW' },
      '2026-10-28',
    );
    expect(upcoming.changed).toEqual(['currency']);
    expect(upcoming.next.currency).toBe('KRW');
    expect(upcoming.next.place).toEqual(base('UPCOMING').place);

    const ongoing = planTripUpdate(
      base('ONGOING'),
      { currency: 'KRW', budgetKrw: 1 },
      '2026-11-13',
    );
    expect(ongoing.changed).toEqual(['budgetKrw']);
    expect(ongoing.lockedFields).toEqual(['currency']);
    expect(ongoing.next.currency).toBe('JPY');

    // 같은 값이면 진행 중에도 받아 준다
    expect(
      planTripUpdate(base('ONGOING'), { currency: 'JPY' }, '2026-11-13'),
    ).toMatchObject({ changed: [], lockedFields: [] });
    expect(
      planTripUpdate(base('ENDED'), { currency: 'USD' }, '2026-11-20')
        .lockedFields,
    ).toEqual(['currency']);
  });

  it('allows only groupName·place·budget·endDate while ongoing (currency·startDate locked)', () => {
    const plan = planTripUpdate(
      base('ONGOING'),
      {
        groupName: '새 이름',
        budgetKrw: 2_000_000,
        endDate: '2026-11-16',
        place: kyoto,
        startDate: '2026-11-11',
      },
      '2026-11-13',
    );
    expect(plan.changed).toEqual([
      'groupName',
      'place',
      'endDate',
      'budgetKrw',
    ]);
    expect(plan.lockedFields).toEqual(['startDate']);
  });

  it('accepts locked fields that did not change (forms may send everything)', () => {
    const plan = planTripUpdate(
      base('ONGOING'),
      {
        place: { countryCode: 'JP', city: '오사카', label: '일본 오사카' },
        startDate: '2026-11-12',
        budgetKrw: 1_200_000,
      },
      '2026-11-13',
    );
    expect(plan).toMatchObject({
      changed: [],
      lockedFields: [],
      fieldErrors: [],
    });
  });

  it('treats a missing city like null when comparing places', () => {
    const plan = planTripUpdate(
      {
        ...base('ONGOING'),
        place: { countryCode: 'SG', city: null, label: '싱가포르' },
      },
      { place: { countryCode: 'SG', label: '싱가포르' } },
      '2026-11-13',
    );
    expect(plan.lockedFields).toEqual([]);
  });

  it('moves the end date only to today or later while ongoing', () => {
    expect(
      codesOf(
        planTripUpdate(base('ONGOING'), { endDate: '2026-11-13' }, '2026-11-14')
          .fieldErrors,
      ),
    ).toEqual(['endDate:endBeforeToday']);
    expect(
      planTripUpdate(base('ONGOING'), { endDate: '2026-11-14' }, '2026-11-14')
        .fieldErrors,
    ).toEqual([]);
  });

  it('does not re-check an unchanged past start date', () => {
    const past = {
      ...base('UPCOMING'),
      startDate: '2026-10-01',
      endDate: '2026-10-03',
    };
    expect(
      planTripUpdate(past, { endDate: '2026-10-05' }, '2026-11-20').fieldErrors,
    ).toEqual([]);
  });

  it('locks everything after the end', () => {
    const plan = planTripUpdate(
      base('ENDED'),
      { groupName: '끝', budgetKrw: 1 },
      '2026-11-20',
    );
    expect(plan.changed).toEqual([]);
    expect(plan.lockedFields).toEqual(['groupName', 'budgetKrw']);
  });
});

describe('isAutoEndDue / canStartTrip (FR-305, Q-26)', () => {
  const autoEndAt = new Date('2026-11-15T23:59:59+09:00');
  const trip = { status: 'ONGOING' as TripStatus, autoEndAt, deletedAt: null };

  it('ends ongoing trips once 23:59:59 KST of the end date is reached', () => {
    expect(isAutoEndDue(trip, new Date('2026-11-15T23:59:58+09:00'))).toBe(
      false,
    );
    expect(isAutoEndDue(trip, autoEndAt)).toBe(true);
    expect(isAutoEndDue(trip, new Date('2026-11-16T00:00:01+09:00'))).toBe(
      true,
    );
  });

  it('ignores trips that are not ongoing or were deleted', () => {
    const later = new Date('2026-11-20T00:00:00+09:00');
    expect(isAutoEndDue({ ...trip, status: 'UPCOMING' }, later)).toBe(false);
    expect(isAutoEndDue({ ...trip, status: 'ENDED' }, later)).toBe(false);
    expect(isAutoEndDue({ ...trip, deletedAt: new Date() }, later)).toBe(false);
  });

  it('cannot start once the auto end time has passed', () => {
    expect(canStartTrip(autoEndAt, new Date('2026-11-15T23:59:58+09:00'))).toBe(
      true,
    );
    expect(canStartTrip(autoEndAt, autoEndAt)).toBe(false);
  });
});

describe('tripShell / tripPermissions (FR-001, 권한표 5-1)', () => {
  const now = new Date('2026-11-13T12:00:00+09:00');
  const autoEndAt = new Date('2026-11-15T23:59:59+09:00');

  it('locks the expense and summary tabs before the start', () => {
    expect(tripShell('UPCOMING')).toEqual({
      defaultTab: 'INFO',
      secondTab: 'SUMMARY',
      lockedTabs: ['EXPENSES', 'SUMMARY'],
    });
    expect(tripShell('ONGOING')).toEqual({
      defaultTab: 'EXPENSES',
      secondTab: 'SUMMARY',
      lockedTabs: [],
    });
    expect(tripShell('ENDED')).toEqual({
      defaultTab: 'SETTLEMENT',
      secondTab: 'SETTLEMENT',
      lockedTabs: [],
    });
  });

  it('gives leaders phase-dependent actions', () => {
    expect(
      tripPermissions({ status: 'UPCOMING', role: 'LEADER', autoEndAt, now }),
    ).toEqual({
      canEdit: true,
      editableFields: [
        'groupName',
        'place',
        'currency',
        'startDate',
        'endDate',
        'budgetKrw',
      ],
      canStart: true,
      startBlockReason: null,
      canEnd: false,
      canDeleteGroup: true,
      canKick: true,
      canInvite: true,
      canLeave: true,
      canChangeFx: true,
    });
    expect(
      tripPermissions({ status: 'ONGOING', role: 'LEADER', autoEndAt, now }),
    ).toMatchObject({
      editableFields: ['groupName', 'place', 'budgetKrw', 'endDate'],
      canStart: false,
      startBlockReason: 'NOT_UPCOMING',
      canEnd: true,
      canDeleteGroup: false,
      canKick: true,
    });
    expect(
      tripPermissions({ status: 'ENDED', role: 'LEADER', autoEndAt, now }),
    ).toMatchObject({
      canEdit: false,
      editableFields: [],
      canEnd: false,
      canKick: false,
      canInvite: false,
      canChangeFx: false,
      canLeave: true,
    });
  });

  it('gives members only invite and leave', () => {
    expect(
      tripPermissions({ status: 'ONGOING', role: 'MEMBER', autoEndAt, now }),
    ).toEqual({
      canEdit: false,
      editableFields: [],
      canStart: false,
      startBlockReason: 'NOT_LEADER',
      canEnd: false,
      canDeleteGroup: false,
      canKick: false,
      canInvite: true,
      canLeave: true,
      canChangeFx: false,
    });
  });

  it('hides the start button when the end date has passed', () => {
    const late = new Date('2026-11-16T00:00:00+09:00');
    expect(
      tripPermissions({
        status: 'UPCOMING',
        role: 'LEADER',
        autoEndAt,
        now: late,
      }),
    ).toMatchObject({ canStart: false, startBlockReason: 'PERIOD_OVER' });
  });

  it('gives the start block reason in the start API order (403 role → 409 phase → 409 period)', () => {
    const late = new Date('2026-11-16T00:00:00+09:00');
    const reason = (status: TripStatus, role: 'LEADER' | 'MEMBER', at: Date) =>
      startBlockReason({ status, role, autoEndAt, now: at });
    expect(reason('UPCOMING', 'LEADER', now)).toBeNull();
    // 23:59:59 KST(autoEndAt) 직전까지는 시작할 수 있고, 그 순간부터 PERIOD_OVER
    expect(
      reason('UPCOMING', 'LEADER', new Date(autoEndAt.getTime() - 1)),
    ).toBeNull();
    expect(reason('UPCOMING', 'LEADER', autoEndAt)).toBe('PERIOD_OVER');
    expect(reason('UPCOMING', 'LEADER', late)).toBe('PERIOD_OVER');
    expect(reason('UPCOMING', 'MEMBER', late)).toBe('NOT_LEADER');
    expect(reason('ONGOING', 'MEMBER', now)).toBe('NOT_LEADER');
    expect(reason('ONGOING', 'LEADER', late)).toBe('NOT_UPCOMING');
    expect(reason('ENDED', 'LEADER', now)).toBe('NOT_UPCOMING');
  });
});

describe('tripCalendar (4-9)', () => {
  it('computes nights, days, D-n and Day N', () => {
    expect(
      tripCalendar('2026-11-12', '2026-11-15', 'UPCOMING', '2026-10-28'),
    ).toEqual({
      nights: 3,
      days: 4,
      dDay: 15,
      todayDayIndex: null,
    });
    expect(
      tripCalendar('2026-11-12', '2026-11-15', 'ONGOING', '2026-11-13'),
    ).toMatchObject({ dDay: null, todayDayIndex: 2 });
    expect(
      tripCalendar('2026-11-12', '2026-11-12', 'UPCOMING', '2026-11-12'),
    ).toMatchObject({ nights: 0, days: 1, dDay: 0 });
  });

  it('returns null outside the period', () => {
    expect(
      tripCalendar('2026-11-12', '2026-11-15', 'UPCOMING', '2026-11-13').dDay,
    ).toBeNull();
    // 시작일보다 먼저 시작한 경우
    expect(
      tripCalendar('2026-11-12', '2026-11-15', 'ONGOING', '2026-11-11')
        .todayDayIndex,
    ).toBeNull();
  });
});
