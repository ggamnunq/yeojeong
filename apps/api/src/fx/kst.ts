// 응답 시각은 ISO 8601 KST 오프셋(기능명세 6-1 "2026-11-13T08:50:00+09:00"), 날짜는 "2026-11-12".
// MVP는 기간 판정·Day 계산을 KST로 고정한다(미결 Q-11).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 2026-11-12T23:50:00Z → "2026-11-13T08:50:00+09:00" */
export function toKstIso(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return `${shifted.toISOString().slice(0, 19)}+09:00`;
}

/** 그 시각의 KST 달력 날짜 "2026-11-13" */
export function kstDate(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Prisma @db.Date 값(UTC 자정) → "2026-11-12" */
export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-11-12"끼리의 날짜 차이(b − a, 일) */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS,
  );
}

/**
 * 쿼리의 날짜·시각을 "이 시각까지 유효한 고시" 기준 시각으로 바꾼다.
 * 날짜만 오면 그날 KST 23:59:59.999, 시각이면 그대로. 형식이 틀리면 null.
 */
export function asOfFromQuery(value: string): Date | null {
  if (DATE_ONLY.test(value)) {
    const start = Date.parse(`${value}T00:00:00+09:00`);
    return Number.isNaN(start) ? null : new Date(start + DAY_MS - 1);
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}
