// 보존 기간(기능명세 8-2·8-8, 개인정보처리방침 제3조). 바꿀 때는 처리방침을 먼저 고친다.

export type RetentionPeriod = { days: number } | { years: number };

export const RETENTION = {
  /** 1단계: 소프트 삭제(deletedAt)한 그룹·여정. "30일 이내 영구 삭제" */
  softDeletedGroup: { days: 30 },
  /** 2단계: 여정 종료일 + 3년 → 그룹 기록 일체 */
  groupRecords: { years: 3 },
  /** 3단계: 거래 원문(암호화) 수집일 + 90일 → NULL */
  rawPayload: { days: 90 },
  /** 6단계: 연결 해제한 결제수단 + 30일(그 결제수단의 거래가 남아 있으면 남긴다) */
  removedPaymentMethod: { days: 30 },
  /** 6단계 보조: 해제(REVOKED)되고 결제수단이 하나도 없는 연결 + 30일 */
  revokedConnection: { days: 30 },
  /** 7단계: 마지막 로그인 + 3년 → 탈퇴로 보고 FR-109 */
  inactiveUser: { years: 3 },
  /** 8단계: 동의 철회·탈퇴 + 3년 */
  withdrawnConsent: { years: 3 },
  /** 9단계: 금융정보 접근 기록 1년 */
  accessLog: { years: 1 },
  /** 10단계: 권리 행사 처리 완료 + 3년 */
  accountDeletion: { years: 3 },
} as const satisfies Record<string, RetentionPeriod>;

const DAY_MS = 86_400_000;

/**
 * 보존 기간 경계. 기준 시각이 이 값 이하(<=)면 보존 기간이 끝난 것이다.
 * 일 단위는 24시간 × n, 연 단위는 달력 기준(UTC)이고 2월 29일은 2월 28일로 당긴다(하루 일찍 지우지 않게).
 * @example cutoff(2026-11-15T03:00Z, { days: 30 }) → 2026-10-16T03:00Z
 */
export function cutoff(now: Date, period: RetentionPeriod): Date {
  if ('days' in period) return new Date(now.getTime() - period.days * DAY_MS);
  const result = new Date(now.getTime());
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear() - period.years);
  // 2/29에서 평년으로 가면 3/1이 된다 → 그 전달 마지막 날(2/28)로
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return result;
}

/** 기준 시각(삭제·종료·철회 시각 등)이 보존 기간을 다 채웠는지 */
export function isPastRetention(
  at: Date,
  now: Date,
  period: RetentionPeriod,
): boolean {
  return at.getTime() <= cutoff(now, period).getTime();
}
