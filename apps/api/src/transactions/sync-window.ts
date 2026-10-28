// 동기화 조회 창 계산(기능명세 4-1-1·4-1-7). DB와 무관한 계산만 둔다.

/** 늦게 게시되는 승인·취소·청구 확정을 잡으려고 지난 동기화와 겹치는 시간 */
export const SYNC_OVERLAP_MS = 72 * 60 * 60 * 1000;

export interface Interval {
  fromAt: Date;
  toAt: Date;
}

export interface WindowTrip {
  startAt: Date;
  autoEndAt: Date;
}

/**
 * [target.fromAt, target.toAt]를 intervals가 빈틈없이 덮는지 보고, 처음 덮이지 않는 시각을 돌려준다.
 * 모두 덮이면 null.
 */
export function firstUncoveredAt(
  target: Interval,
  intervals: readonly Interval[],
): Date | null {
  if (target.fromAt >= target.toAt) return null;
  let cursor = target.fromAt.getTime();
  const end = target.toAt.getTime();
  const sorted = [...intervals].sort(
    (a, b) => a.fromAt.getTime() - b.fromAt.getTime(),
  );
  for (const interval of sorted) {
    if (interval.toAt.getTime() <= cursor) continue;
    if (interval.fromAt.getTime() > cursor) break;
    cursor = interval.toAt.getTime();
    if (cursor >= end) return null;
  }
  return cursor >= end ? null : new Date(cursor);
}

export interface WindowInput {
  now: Date;
  /** 이 사용자가 활성 멤버인 ONGOING 여정들(비어 있으면 동기화하지 않는다) */
  trips: readonly WindowTrip[];
  /** 연결의 마지막 성공 동기화 */
  lastSyncedAt: Date | null;
  /** 아직 한 번도 동기화하지 않은 ACTIVE 결제수단이 있다(새로 추가·다시 연결) */
  hasUnsyncedMethod: boolean;
  /** 소급 트리거가 요청한 시작(TRIP_START·JOIN = 그 여정 startAt, RECONNECT = 끊긴 시점 − 72시간) */
  requestedFromAt?: Date | null;
  /** 이 연결의 성공한 SyncRun 구간들(자가 복구 판정용) */
  succeededRuns: readonly Interval[];
}

/**
 * 조회 창 = [from, now].
 * - 기본: max(lastSyncedAt − 72시간, 대상 여정 중 가장 이른 startAt). 처음이면 가장 이른 startAt
 * - 새 결제수단이 있으면 가장 이른 startAt부터(창은 연결 단위 하나라 SyncRun 구간이 정직해진다)
 * - 소급 트리거면 그 시작까지 넓힌다
 * - 자가 복구(v0.4.2): 성공한 SyncRun 구간들이 각 여정 [startAt, min(now, autoEndAt)]을 덮지 못하면
 *   처음 덮이지 않은 시각부터로 넓힌다 → 소급 리스너가 실패해도 다음 주기 잡이 따라잡는다
 * - 진행 중 여정 기간 밖은 가져오지 않는다(최소 수집, 8-2): from ≥ 가장 이른 startAt
 * @returns 대상 여정이 없으면 null
 */
export function computeSyncWindow(
  input: WindowInput,
): { fromAt: Date; toAt: Date } | null {
  if (input.trips.length === 0) return null;
  const now = input.now.getTime();
  const earliest = Math.min(...input.trips.map((t) => t.startAt.getTime()));

  let from =
    input.lastSyncedAt && !input.hasUnsyncedMethod
      ? input.lastSyncedAt.getTime() - SYNC_OVERLAP_MS
      : earliest;
  if (input.requestedFromAt) {
    from = Math.min(from, input.requestedFromAt.getTime());
  }
  for (const trip of input.trips) {
    const gap = firstUncoveredAt(
      {
        fromAt: trip.startAt,
        toAt: new Date(Math.min(now, trip.autoEndAt.getTime())),
      },
      input.succeededRuns,
    );
    if (gap) from = Math.min(from, gap.getTime());
  }
  from = Math.min(Math.max(from, earliest), now);
  return { fromAt: new Date(from), toAt: input.now };
}
