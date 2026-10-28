import { Injectable } from '@nestjs/common';
import type { LeaveGroupResponse, MemberSummary } from '@yeojeong/shared';
import type { MembershipContext } from '../common/auth/index.js';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DomainEventPublisher } from '../trips/domain-event.publisher.js';
import { TRIP_EVENTS, type DomainEvent } from '../trips/events.js';
import {
  assertStatus,
  lockTrip,
  nextEventSeqs,
  requireActiveMembership,
} from '../trips/trip-locks.js';
import { pickSuccessor } from '../trips/trip-rules.js';
import { memberSelect, toMemberSummary } from '../trips/trip-views.js';

/** 그룹원 목록·강퇴·나가기·그룹 삭제(FR-206~209) */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {}

  /** FR-206: 가입 순. 기본은 활성 멤버만 */
  async members(
    groupId: string,
    me: MembershipContext,
    includeLeft = false,
  ): Promise<MemberSummary[]> {
    const rows = await this.prisma.membership.findMany({
      where: { groupId, ...(includeLeft ? {} : { leftAt: null }) },
      orderBy: { joinOrder: 'asc' },
      select: memberSelect,
    });
    return rows.map((row) => toMemberSummary(row, me.id));
  }

  /** FR-207: 그룹장만, 본인 제외, 시작 전·진행 중. 결제·부담은 그대로 남는다 */
  async kick(
    groupId: string,
    me: MembershipContext,
    targetMembershipId: string,
    now = new Date(),
  ): Promise<void> {
    if (targetMembershipId === me.id) throw AppException.of('CANNOT_KICK_SELF');
    const event = await this.prisma.$transaction(async (tx) => {
      const locked = await lockTrip(tx, { groupId });
      assertStatus(locked, ['UPCOMING', 'ONGOING']);
      await requireActiveMembership(tx, me.id, groupId, { leader: true });
      const target = await tx.membership.findFirst({
        where: { id: targetMembershipId, groupId, leftAt: null },
        select: { id: true, userId: true },
      });
      if (!target) throw new NotFoundError();

      await tx.membership.update({
        where: { id: target.id },
        data: {
          leftAt: now,
          leaveReason: 'KICKED',
          kickedByMembershipId: me.id,
          role: 'MEMBER',
        },
      });
      const [eventSeq] = await nextEventSeqs(tx, 1);
      return {
        tripId: locked.id,
        groupId,
        membershipId: target.id,
        userId: target.userId,
        reason: 'KICKED' as const,
        eventSeq,
        occurredAt: now,
      };
    });
    await this.events.publish({
      name: TRIP_EVENTS.MEMBERSHIP_LEFT,
      payload: event,
    });
  }

  /**
   * FR-208: 전 단계. 그룹장이면 같은 트랜잭션에서 가입 순 다음 활성 멤버가 승계하고 TripEvent LEADER_CHANGED를 남긴다.
   * 마지막 멤버면 그룹·여정을 소프트 삭제한다(미결 Q-25 추천안).
   */
  async leave(
    groupId: string,
    me: MembershipContext,
    now = new Date(),
  ): Promise<LeaveGroupResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await lockTrip(tx, { groupId });
      const mine = await requireActiveMembership(tx, me.id, groupId);
      const active = await tx.membership.findMany({
        where: { groupId, leftAt: null },
        select: memberSelect,
      });
      const successor =
        mine.role === 'LEADER' ? pickSuccessor(active, mine.id) : null;

      // 내 행을 먼저 비워야 활성 그룹장 부분 유니크 인덱스(memberships_active_leader_key)를 지나간다
      await tx.membership.update({
        where: { id: mine.id },
        data: { leftAt: now, leaveReason: 'LEFT', role: 'MEMBER' },
      });
      if (successor) {
        await tx.membership.update({
          where: { id: successor.id },
          data: { role: 'LEADER' },
        });
        await tx.tripEvent.create({
          data: {
            tripId: locked.id,
            type: 'LEADER_CHANGED',
            payload: {
              newLeaderMembershipId: successor.id,
              nickname: successor.user?.nickname ?? null,
            },
            actorMembershipId: mine.id,
          },
        });
      }
      const groupDeleted = active.length <= 1;
      if (groupDeleted) {
        await tx.group.update({
          where: { id: groupId },
          data: { deletedAt: now },
        });
        await tx.trip.update({
          where: { id: locked.id },
          data: { deletedAt: now },
        });
      }
      const [eventSeq] = await nextEventSeqs(tx, 1);
      return {
        groupDeleted,
        successor,
        event: {
          tripId: locked.id,
          groupId,
          membershipId: mine.id,
          userId: mine.userId,
          reason: 'LEFT' as const,
          eventSeq,
          occurredAt: now,
        },
      };
    });
    await this.events.publish({
      name: TRIP_EVENTS.MEMBERSHIP_LEFT,
      payload: result.event,
    });
    return {
      newLeader: result.successor
        ? toMemberSummary({ ...result.successor, role: 'LEADER' }, null)
        : null,
      groupDeleted: result.groupDeleted,
    };
  }

  /** FR-209: 그룹장만, 시작 전에만. 초대코드는 부분 유니크 인덱스에서 빠져 다시 쓸 수 있게 된다 */
  async deleteGroup(
    groupId: string,
    me: MembershipContext,
    now = new Date(),
  ): Promise<void> {
    const events = await this.prisma.$transaction(async (tx) => {
      const locked = await lockTrip(tx, { groupId });
      assertStatus(locked, ['UPCOMING']);
      await requireActiveMembership(tx, me.id, groupId, { leader: true });
      const active = await tx.membership.findMany({
        where: { groupId, leftAt: null },
        orderBy: { joinOrder: 'asc' },
        select: { id: true, userId: true },
      });
      await tx.group.update({
        where: { id: groupId },
        data: { deletedAt: now },
      });
      await tx.trip.update({
        where: { id: locked.id },
        data: { deletedAt: now },
      });
      const seqs = await nextEventSeqs(tx, active.length);
      return active.map((m, i): DomainEvent => ({
        name: TRIP_EVENTS.MEMBERSHIP_LEFT,
        payload: {
          tripId: locked.id,
          groupId,
          membershipId: m.id,
          userId: m.userId,
          reason: 'DELETED',
          eventSeq: seqs[i],
          occurredAt: now,
        },
      }));
    });
    await this.events.publish(...events);
  }
}
