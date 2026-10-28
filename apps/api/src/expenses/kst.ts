// KST(UTC+9, 서머타임 없음) 날짜·시각 계산. 기간 판정·Day 계산·표시는 KST 고정이다(미결 Q-11).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026-11-13T08:50:00+09:00 (6-1 시각 형식) */
export function toKstIso(date: Date): string {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return (
    `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}` +
    `T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}+09:00`
  );
}

/** 시각 → KST 달력 날짜 "2026-11-13" */
export function kstDate(date: Date): string {
  return toKstIso(date).slice(0, 10);
}

/** Prisma @db.Date 값(UTC 자정 Date) → "2026-11-12" */
export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMidnight(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** b − a (일) */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / DAY_MS);
}

/** "2026-11-12" + n일 */
export function addDays(day: string, n: number): string {
  return new Date(utcMidnight(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** KST 날짜 하루의 [시작, 끝) 시각 */
export function kstDayRange(day: string): { gte: Date; lt: Date } {
  const start = utcMidnight(day) - KST_OFFSET_MS;
  return { gte: new Date(start), lt: new Date(start + DAY_MS) };
}

export interface TripPeriod {
  startDate: string;
  endDate: string;
}

/** Day N = (KST 날짜 − 시작일) + 1. 기간 밖이면 null(4-9) */
export function dayIndexOf(
  localDate: string,
  period: TripPeriod,
): number | null {
  if (localDate < period.startDate || localDate > period.endDate) return null;
  return daysBetween(period.startDate, localDate) + 1;
}

/** 기간 밖이면 여정 전/후. 기간 안이면 null */
export function periodSideOf(
  localDate: string,
  period: TripPeriod,
): 'BEFORE' | 'AFTER' | null {
  if (localDate < period.startDate) return 'BEFORE';
  if (localDate > period.endDate) return 'AFTER';
  return null;
}

/** 여정 일수 = 박 + 1 */
export function tripDays(period: TripPeriod): number {
  return daysBetween(period.startDate, period.endDate) + 1;
}
