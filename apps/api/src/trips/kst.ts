// 여정 날짜는 KST 달력 날짜다(미결 Q-11: MVP는 KST 고정). DB의 @db.Date는 UTC 자정 Date로 읽고 쓴다.

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 이 시각의 KST 날짜 "2026-11-12" */
export function kstDate(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-11-12" → 2026-11-12 00:00:00 KST (Trip.startAt) */
export function kstStartOfDay(date: string): Date {
  return new Date(`${date}T00:00:00+09:00`);
}

/** "2026-11-15" → 2026-11-15 23:59:59 KST (Trip.autoEndAt) */
export function kstEndOfDay(date: string): Date {
  return new Date(`${date}T23:59:59+09:00`);
}

/** 응답용 ISO 8601 KST 오프셋 문자열 "2026-11-15T23:59:59+09:00"(밀리초는 버린다) */
export function toKstIso(at: Date): string {
  return `${new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}

/** @db.Date 값(UTC 자정) → "2026-11-12" */
export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** "2026-11-12" → @db.Date에 넣을 UTC 자정 Date. 없는 날짜(2026-02-30)면 null */
export function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || dateOnly(date) !== value ? null : date;
}

/** to − from (일). 둘 다 "YYYY-MM-DD" */
export function diffDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

export function addDays(date: string, days: number): string {
  return dateOnly(new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS));
}
