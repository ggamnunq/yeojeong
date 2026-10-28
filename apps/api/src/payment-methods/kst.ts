// KST(UTC+9, 서머타임 없음) 날짜 계산. 인입 범위·Day 계산은 KST 고정(미결 Q-11).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date → KST 달력 날짜 "YYYY-MM-DD" */
export function kstDate(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" + n일 + "HH:mm[:ss]"(KST) → Date */
export function kstDateTime(date: string, dayOffset: number, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dayOffset, hh, mm, ss) - KST_OFFSET_MS);
}

/** Prisma @db.Date 값(UTC 자정) → "YYYY-MM-DD" */
export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** ISO 8601 KST 오프셋 문자열 "2026-11-13T08:50:00+09:00"(기능명세 6-1) */
export function toKstIso(at: Date): string {
  return `${new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}
