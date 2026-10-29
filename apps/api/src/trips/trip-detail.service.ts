import { Injectable, Optional } from '@nestjs/common';
import type { TripDetailResponse, TripEventView } from '@yeojeong/shared';
import { NotFoundError } from '../common/errors/index.js';
import { FeatureFlags } from '../common/features.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { dateOnly, kstDate, toKstIso } from './kst.js';
import { tripCalendar, tripPermissions, tripShell } from './trip-rules.js';
import { memberSelect, toMemberSummary } from './trip-views.js';

/** 다음 진입 때 한 번 보여 주는 이벤트를 한 번에 몇 개까지 내보내나 */
const UNSEEN_EVENT_LIMIT = 20;

/** GET /api/trips/:tripId 응답(TripDetailResponse)을 만든다. 수정·시작·종료 응답과 VERSION_CONFLICT의 current도 이것을 쓴다 */
@Injectable()
export class TripDetailService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly features?: FeatureFlags,
  ) {}

  async build(
    tripId: string,
    meMembershipId: string,
    now = new Date(),
  ): Promise<TripDetailResponse> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null, group: { deletedAt: null } },
      include: {
        group: {
          select: {
            name: true,
            inviteCode: true,
            memberships: {
              where: { leftAt: null },
              orderBy: { joinOrder: 'asc' },
              select: { ...memberSelect, lastSeenTripEventSeq: true },
            },
          },
        },
      },
    });
    const me = trip?.group.memberships.find((m) => m.id === meMembershipId);
    if (!trip || !me) throw new NotFoundError();

    const [events, pendingCount, expiredConnections] = await Promise.all([
      this.prisma.tripEvent.findMany({
        where: {
          tripId,
          seq: { gt: me.lastSeenTripEventSeq ?? 0n },
          // 행위자에게는 다시 띄우지 않는다. { not: id }만 쓰면 NULL 행이 빠진다
          OR: [
            { actorMembershipId: null },
            { actorMembershipId: { not: me.id } },
          ],
        },
        orderBy: { seq: 'asc' },
        take: UNSEEN_EVENT_LIMIT,
        select: { id: true, type: true, payload: true },
      }),
      this.prisma.expense.count({
        where: {
          tripId,
          payerMembershipId: me.id,
          status: 'PENDING',
          refundOfExpenseId: null,
        },
      }),
      me.userId
        ? this.prisma.paymentConnection.count({
            where: { userId: me.userId, status: 'EXPIRED' },
          })
        : Promise.resolve(0),
    ]);

    const members = trip.group.memberships.map((m) =>
      toMemberSummary(m, me.id),
    );
    const startDate = dateOnly(trip.startDate);
    const endDate = dateOnly(trip.endDate);
    const calendar = tripCalendar(
      startDate,
      endDate,
      trip.status,
      kstDate(now),
    );

    return {
      tripId: trip.id,
      groupId: trip.groupId,
      groupName: trip.group.name,
      status: trip.status,
      startDate,
      endDate,
      memberCount: members.length,
      isLeader: me.role === 'LEADER',
      placeLabel: trip.placeLabel,
      countryCode: trip.countryCode,
      city: trip.city,
      currency: trip.currency,
      budgetKrw: trip.budgetKrw,
      nights: calendar.nights,
      days: calendar.days,
      dDay: calendar.dDay,
      todayDayIndex: calendar.todayDayIndex,
      autoEndAt: toKstIso(trip.autoEndAt),
      startedAt: trip.startedAt ? toKstIso(trip.startedAt) : null,
      endedAt: trip.endedAt ? toKstIso(trip.endedAt) : null,
      endReason: trip.endReason,
      inviteCode: trip.status === 'ENDED' ? null : trip.group.inviteCode,
      me: {
        membershipId: me.id,
        role: me.role,
        pendingCount,
        // 계좌·카드 연결을 숨긴 동안(FR-006)은 false
        connectionExpired:
          expiredConnections > 0 && (this.features?.accountLink ?? true),
      },
      members,
      fx:
        trip.currency === 'KRW'
          ? null
          : { policy: trip.fxPolicy, tripCurrency: trip.currency },
      unseenEvents: events.map((event) =>
        toEventView(event, trip.group.memberships),
      ),
      shell: tripShell(trip.status),
      permissions: tripPermissions({
        status: trip.status,
        role: me.role,
        autoEndAt: trip.autoEndAt,
        now,
      }),
      version: trip.version,
    };
  }
}

function toEventView(
  event: { id: string; type: TripEventView['type']; payload: unknown },
  active: { id: string; user: { nickname: string } | null }[],
): TripEventView {
  const payload =
    event.payload && typeof event.payload === 'object'
      ? { ...(event.payload as Record<string, unknown>) }
      : {};
  // 승계 토스트의 닉네임은 지금 값으로 보여 준다(기록 뒤 탈퇴·변경 대비)
  if (event.type === 'LEADER_CHANGED') {
    const leader = active.find((m) => m.id === payload.newLeaderMembershipId);
    if (leader?.user) payload.nickname = leader.user.nickname;
  }
  return { id: event.id, type: event.type, payload };
}
