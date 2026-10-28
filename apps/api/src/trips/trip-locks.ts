import type { TripStatus } from '@yeojeong/shared';
import { AppException, NotFoundError } from '../common/errors/index.js';
import type { Prisma } from '../generated/prisma/client.js';

// 상태 변경 트랜잭션의 공통 단계(기능명세 8-3, apps/api/README.md "인증과 권한").
// 가드는 요청 시점의 1차 관문이고, 여기서 Trip 행을 FOR UPDATE로 잠근 뒤 단계·멤버십·역할을 다시 확인한다.
// 잠금 순서는 항상 Trip 행 → Membership 행이다(교착 방지). 그룹 1 : 여정 1이라 Trip 행 잠금이 그룹 잠금을 겸한다.

export type Tx = Prisma.TransactionClient;

export interface LockedTrip {
  id: string;
  groupId: string;
  status: TripStatus;
  version: number;
  startAt: Date;
  autoEndAt: Date;
  deletedAt: Date | null;
}

/** Trip 행을 FOR UPDATE로 잠그고 읽는다. 없거나 삭제됐으면 404 */
export async function lockTrip(
  tx: Tx,
  where: { tripId: string } | { groupId: string },
): Promise<LockedTrip> {
  const rows =
    'tripId' in where
      ? await tx.$queryRaw<LockedTrip[]>`
          SELECT id, group_id AS "groupId", status::text AS status, version,
                 start_at AS "startAt", auto_end_at AS "autoEndAt", deleted_at AS "deletedAt"
          FROM trips WHERE id = ${where.tripId}::uuid FOR UPDATE`
      : await tx.$queryRaw<LockedTrip[]>`
          SELECT id, group_id AS "groupId", status::text AS status, version,
                 start_at AS "startAt", auto_end_at AS "autoEndAt", deleted_at AS "deletedAt"
          FROM trips WHERE group_id = ${where.groupId}::uuid FOR UPDATE`;
  const trip = rows[0];
  if (!trip || trip.deletedAt) throw new NotFoundError();
  return trip;
}

export function assertStatus(
  trip: LockedTrip,
  statuses: readonly TripStatus[],
  message?: string,
) {
  if (!statuses.includes(trip.status)) {
    throw AppException.of('TRIP_PHASE_INVALID', message ? { message } : {});
  }
}

/** 잠근 뒤 요청자가 아직 활성 멤버인지(아니면 404), 그룹장 전용이면 그룹장인지(아니면 403) 다시 확인한다 */
export async function requireActiveMembership(
  tx: Tx,
  membershipId: string,
  groupId: string,
  options: { leader?: boolean } = {},
) {
  const membership = await tx.membership.findFirst({
    where: { id: membershipId, groupId, leftAt: null },
    select: { id: true, userId: true, role: true, joinOrder: true },
  });
  if (!membership) throw new NotFoundError();
  if (options.leader && membership.role !== 'LEADER') {
    throw AppException.of('NOT_LEADER');
  }
  return membership;
}

/**
 * 도메인 이벤트 순서 번호를 count개 받는다. trip_events.seq와 같은 시퀀스를 쓴다(스키마 변경 없이 단조 증가 값).
 * Trip 행을 잠근 뒤 부르면 같은 여정 안에서 번호 순서 = 커밋 순서다. trip_events.seq에는 빈 번호가 생기지만
 * seq는 순서 비교에만 쓰여(lastSeenTripEventSeq) 문제없다.
 */
export async function nextEventSeqs(tx: Tx, count: number): Promise<bigint[]> {
  if (count <= 0) return [];
  const rows = await tx.$queryRaw<{ seq: bigint }[]>`
    SELECT nextval(pg_get_serial_sequence('trip_events', 'seq')) AS seq
    FROM generate_series(1, ${count}::int)`;
  return rows
    .map((row) => BigInt(row.seq))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** 이 여정의 마지막 TripEvent seq. 새 멤버는 참여 전 이벤트를 보지 않게 여기서부터 본다 */
export async function lastTripEventSeq(
  tx: Tx,
  tripId: string,
): Promise<bigint | null> {
  const last = await tx.tripEvent.findFirst({
    where: { tripId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  });
  return last?.seq ?? null;
}
