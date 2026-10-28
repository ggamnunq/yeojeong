import {
  TRIP_EDITABLE_FIELDS,
  TRIP_MAX_DAYS,
  TRIP_START_PAST_LIMIT_DAYS,
  type FieldError,
  type MemberRole,
  type TripEditableField,
  type TripPermissions,
  type TripShell,
  type TripStatus,
} from '@yeojeong/shared';
import { addDays, diffDays, parseDateOnly } from './kst.js';
import { currencyOf } from './places.js';

// 여정·멤버 규칙 중 DB 없이 판단할 수 있는 것(단위 테스트 대상). 근거는 기능명세 3-1·3-4·4-7·4-8, FR-201·302·305.

export interface PeriodCheckOptions {
  /** 오늘(KST) "YYYY-MM-DD" */
  today: string;
  /** 시작일이 새로 정해질 때만 "오늘 − 30일 이후" 규칙을 건다(미결 Q-29) */
  checkStartPast: boolean;
  /** 진행 중 종료일 변경: 이 날짜(오늘) 이후로만(FR-302) */
  minEndDate?: string;
}

/** 여정 기간 검사. 문제가 없으면 빈 배열 */
export function checkTripPeriod(
  startDate: string,
  endDate: string,
  options: PeriodCheckOptions,
): FieldError[] {
  const errors: FieldError[] = [];
  const startOk = parseDateOnly(startDate) !== null;
  const endOk = parseDateOnly(endDate) !== null;
  if (!startOk) {
    errors.push({
      path: 'startDate',
      code: 'isDate',
      message: '시작일을 다시 확인해 주세요',
    });
  }
  if (!endOk) {
    errors.push({
      path: 'endDate',
      code: 'isDate',
      message: '종료일을 다시 확인해 주세요',
    });
  }
  if (!startOk || !endOk) return errors;

  if (endDate < startDate) {
    errors.push({
      path: 'endDate',
      code: 'endBeforeStart',
      message: '종료일은 시작일과 같거나 그 뒤여야 해요',
    });
  } else if (diffDays(startDate, endDate) + 1 > TRIP_MAX_DAYS) {
    errors.push({
      path: 'endDate',
      code: 'maxDays',
      message: `여정은 최대 ${TRIP_MAX_DAYS}일까지예요`,
    });
  }
  if (
    options.checkStartPast &&
    startDate < addDays(options.today, -TRIP_START_PAST_LIMIT_DAYS)
  ) {
    errors.push({
      path: 'startDate',
      code: 'startTooEarly',
      message: `시작일은 ${TRIP_START_PAST_LIMIT_DAYS}일 전까지 고를 수 있어요`,
    });
  }
  if (options.minEndDate && endDate < options.minEndDate) {
    errors.push({
      path: 'endDate',
      code: 'endBeforeToday',
      message: '종료일은 오늘 이후로만 바꿀 수 있어요',
    });
  }
  return errors;
}

export interface PlaceValue {
  countryCode: string;
  city: string | null;
  label: string;
}

export interface TripSnapshot {
  status: TripStatus;
  groupName: string;
  place: PlaceValue;
  startDate: string;
  endDate: string;
  budgetKrw: number;
}

export interface TripUpdateInput {
  groupName?: string;
  place?: { countryCode: string; city?: string | null; label: string };
  startDate?: string;
  endDate?: string;
  budgetKrw?: number;
}

export interface TripUpdatePlan {
  /** 실제로 바뀌는 항목 */
  changed: TripEditableField[];
  /** 지금 단계에서 바꿀 수 없는데 다른 값이 온 항목 → 409 TRIP_PHASE_INVALID */
  lockedFields: TripEditableField[];
  /** 값 검증 실패 → 400 VALIDATION_FAILED */
  fieldErrors: FieldError[];
  next: TripSnapshot & { currency: string | null };
}

/**
 * PATCH /api/trips/:tripId의 변경 계획(FR-302). 잠긴 항목도 지금 값과 같으면 받아 준다(폼이 전체를 보내도 되게).
 * 종료일을 바꾸면 autoEndAt, 시작일을 바꾸면 startAt을 호출자가 다시 계산한다.
 */
export function planTripUpdate(
  current: TripSnapshot,
  input: TripUpdateInput,
  today: string,
): TripUpdatePlan {
  const allowed = TRIP_EDITABLE_FIELDS[current.status];
  const changed: TripEditableField[] = [];
  const lockedFields: TripEditableField[] = [];
  const nextPlace: PlaceValue | undefined = input.place && {
    countryCode: input.place.countryCode,
    city: input.place.city ?? null,
    label: input.place.label,
  };

  const differs: Record<TripEditableField, boolean> = {
    groupName:
      input.groupName !== undefined && input.groupName !== current.groupName,
    place:
      nextPlace !== undefined &&
      (nextPlace.countryCode !== current.place.countryCode ||
        nextPlace.city !== current.place.city ||
        nextPlace.label !== current.place.label),
    startDate:
      input.startDate !== undefined && input.startDate !== current.startDate,
    endDate: input.endDate !== undefined && input.endDate !== current.endDate,
    budgetKrw:
      input.budgetKrw !== undefined && input.budgetKrw !== current.budgetKrw,
  };
  for (const field of Object.keys(differs) as TripEditableField[]) {
    if (!differs[field]) continue;
    (allowed.includes(field) ? changed : lockedFields).push(field);
  }

  const next = {
    status: current.status,
    groupName: changed.includes('groupName')
      ? input.groupName!
      : current.groupName,
    place: changed.includes('place') ? nextPlace! : current.place,
    startDate: changed.includes('startDate')
      ? input.startDate!
      : current.startDate,
    endDate: changed.includes('endDate') ? input.endDate! : current.endDate,
    budgetKrw: changed.includes('budgetKrw')
      ? input.budgetKrw!
      : current.budgetKrw,
    currency: currencyOf(
      changed.includes('place')
        ? nextPlace!.countryCode
        : current.place.countryCode,
    ),
  };

  const fieldErrors: FieldError[] = [];
  if (changed.includes('place') && next.currency === null) {
    fieldErrors.push(unsupportedCountry('place.countryCode'));
  }
  if (changed.includes('startDate') || changed.includes('endDate')) {
    fieldErrors.push(
      ...checkTripPeriod(next.startDate, next.endDate, {
        today,
        checkStartPast: changed.includes('startDate'),
        minEndDate:
          current.status === 'ONGOING' && changed.includes('endDate')
            ? today
            : undefined,
      }),
    );
  }
  return { changed, lockedFields, fieldErrors, next };
}

export function unsupportedCountry(path: string): FieldError {
  return {
    path,
    code: 'unsupportedCountry',
    message: '지원하지 않는 여행지예요',
  };
}

/** 앱 셸(FR-001): 단계별 기본 탭·잠금·2번 탭 */
export function tripShell(status: TripStatus): TripShell {
  switch (status) {
    case 'UPCOMING':
      return {
        defaultTab: 'INFO',
        secondTab: 'SUMMARY',
        lockedTabs: ['EXPENSES', 'SUMMARY'],
      };
    case 'ONGOING':
      return { defaultTab: 'EXPENSES', secondTab: 'SUMMARY', lockedTabs: [] };
    case 'ENDED':
      return {
        defaultTab: 'SETTLEMENT',
        secondTab: 'SETTLEMENT',
        lockedTabs: [],
      };
  }
}

/** 시작하지 않은 채 종료일이 지난 여정은 시작할 수 없다(미결 Q-26 추천안: 기간을 고쳐서 시작) */
export function canStartTrip(autoEndAt: Date, now: Date): boolean {
  return now.getTime() < autoEndAt.getTime();
}

/** 버튼 노출용 권한(기능명세 README 5-1, 4-8) */
export function tripPermissions(input: {
  status: TripStatus;
  role: MemberRole;
  autoEndAt: Date;
  now: Date;
}): TripPermissions {
  const { status, now } = input;
  const leader = input.role === 'LEADER';
  const editableFields = leader ? [...TRIP_EDITABLE_FIELDS[status]] : [];
  return {
    canEdit: editableFields.length > 0,
    editableFields,
    canStart:
      leader && status === 'UPCOMING' && canStartTrip(input.autoEndAt, now),
    canEnd: leader && status === 'ONGOING',
    canDeleteGroup: leader && status === 'UPCOMING',
    canKick: leader && status !== 'ENDED',
    canInvite: status !== 'ENDED',
    canLeave: true,
    canChangeFx: leader && status !== 'ENDED',
  };
}

/** N박 M일, D-n, 오늘의 Day N(기능명세 4-9) */
export function tripCalendar(
  startDate: string,
  endDate: string,
  status: TripStatus,
  today: string,
) {
  const nights = diffDays(startDate, endDate);
  const days = nights + 1;
  const untilStart = diffDays(today, startDate);
  const dayIndex = diffDays(startDate, today) + 1;
  return {
    nights,
    days,
    dDay: status === 'UPCOMING' && untilStart >= 0 ? untilStart : null,
    todayDayIndex:
      status === 'ONGOING' && dayIndex >= 1 && dayIndex <= days
        ? dayIndex
        : null,
  };
}

/** 자동 종료 대상(FR-305): 진행 중이고 종료일 23:59:59 KST가 지났다 */
export function isAutoEndDue(
  trip: { status: TripStatus; autoEndAt: Date; deletedAt: Date | null },
  now: Date,
): boolean {
  return (
    trip.status === 'ONGOING' &&
    trip.deletedAt === null &&
    trip.autoEndAt.getTime() <= now.getTime()
  );
}

/** 그룹장 승계(4-7): 나가는 사람을 뺀 활성 멤버 중 가입 순서가 가장 빠른 사람. 없으면 null(마지막 멤버) */
export function pickSuccessor<
  T extends { id: string; joinOrder: number; leftAt: Date | null },
>(members: readonly T[], leavingMembershipId: string): T | null {
  return (
    members
      .filter((m) => m.leftAt === null && m.id !== leavingMembershipId)
      .sort((a, b) => a.joinOrder - b.joinOrder)[0] ?? null
  );
}
