import { Injectable } from '@nestjs/common';
import {
  INVITE_PREVIEW_MEMBER_LIMIT,
  TRIP_MEMBER_LIMIT,
  normalizeInviteCode,
  type InvitePreview,
  type JoinTripResponse,
} from '@yeojeong/shared';
import type { AuthUser } from '../common/auth/index.js';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DomainEventPublisher } from '../trips/domain-event.publisher.js';
import { TRIP_EVENTS, type MembershipJoinedEvent } from '../trips/events.js';
import { dateOnly } from '../trips/kst.js';
import { isUniqueViolation } from '../trips/prisma-errors.js';
import {
  lastTripEventSeq,
  lockTrip,
  nextEventSeqs,
} from '../trips/trip-locks.js';
import { memberSelect, toProfile } from '../trips/trip-views.js';

/** 초대코드 미리보기·참여(FR-203·204). 승인 없이 바로 멤버가 된다 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {}

  /** 확인 순서: 없는 코드 404 → 이미 멤버면 alreadyMember → 강퇴 이력 403 → 종료 409 */
  async preview(code: string, user: AuthUser): Promise<InvitePreview> {
    const group = await this.findGroup(code);
    const rows = await this.prisma.membership.findMany({
      where: { groupId: group.id, OR: [{ leftAt: null }, { userId: user.id }] },
      orderBy: { joinOrder: 'asc' },
      select: { ...memberSelect, leaveReason: true },
    });
    const mine = rows.find((row) => row.userId === user.id);
    const alreadyMember = mine !== undefined && mine.leftAt === null;
    if (!alreadyMember) {
      if (mine?.leaveReason === 'KICKED')
        throw AppException.of('MEMBER_KICKED');
      if (group.trip.status === 'ENDED')
        throw AppException.of('INVITE_TRIP_ENDED');
    }
    const active = rows.filter((row) => row.leftAt === null);
    const leader = active.find((row) => row.role === 'LEADER');
    return {
      groupName: group.name,
      placeLabel: group.trip.placeLabel,
      startDate: dateOnly(group.trip.startDate),
      endDate: dateOnly(group.trip.endDate),
      status: group.trip.status,
      memberCount: active.length,
      membersPreview: active
        .slice(0, INVITE_PREVIEW_MEMBER_LIMIT)
        .map(toProfile),
      leader: leader ? toProfile(leader) : null,
      alreadyMember,
      tripId: alreadyMember ? group.trip.id : null,
    };
  }

  /**
   * Trip 행을 잠근 뒤 조건을 다시 보고 joinOrder = max + 1을 준다(동시 참여 순서 보장, 기능명세 8-3).
   * 자진 이탈자는 같은 행을 되살리되 joinOrder는 재참여 시각 기준 맨 뒤로 다시 매긴다(Q-09 확정).
   * 강퇴자는 다시 참여할 수 없다(403 MEMBER_KICKED).
   */
  async join(
    code: string,
    user: AuthUser,
    now = new Date(),
  ): Promise<JoinTripResponse> {
    const group = await this.findGroup(code);
    let result: { event: MembershipJoinedEvent; response: JoinTripResponse };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const locked = await lockTrip(tx, { tripId: group.trip.id }).catch(
          (error: unknown) => {
            throw error instanceof NotFoundError
              ? AppException.of('INVITE_CODE_INVALID')
              : error;
          },
        );
        const existing = await tx.membership.findUnique({
          where: { groupId_userId: { groupId: group.id, userId: user.id } },
          select: { id: true, leftAt: true, leaveReason: true },
        });
        if (existing && existing.leftAt === null) {
          throw AppException.of('ALREADY_MEMBER');
        }
        if (existing?.leaveReason === 'KICKED') {
          throw AppException.of('MEMBER_KICKED');
        }
        if (locked.status === 'ENDED')
          throw AppException.of('INVITE_TRIP_ENDED');
        const activeCount = await tx.membership.count({
          where: { groupId: group.id, leftAt: null },
        });
        if (activeCount >= TRIP_MEMBER_LIMIT) {
          throw AppException.of('MEMBER_LIMIT_EXCEEDED');
        }

        // 참여 전에 생긴 1회성 이벤트(승계 등)는 보여 주지 않는다
        const lastSeenTripEventSeq = await lastTripEventSeq(tx, locked.id);
        // 새 참여도 재참여도 맨 뒤 순서(나간 행 포함 max + 1). 승계·목록 순서·이니셜 색이 이 값을 따른다
        const max = await tx.membership.aggregate({
          where: { groupId: group.id },
          _max: { joinOrder: true },
        });
        const joinOrder = (max._max.joinOrder ?? 0) + 1;
        let membershipId: string;
        if (existing) {
          // 같은 행을 되살려 이전 결제·부담·정산 기록(membershipId 참조)은 그대로 이어진다
          await tx.membership.update({
            where: { id: existing.id },
            data: {
              leftAt: null,
              leaveReason: null,
              kickedByMembershipId: null,
              role: 'MEMBER',
              joinOrder,
              joinedAt: now,
              lastSeenTripEventSeq,
            },
          });
          membershipId = existing.id;
        } else {
          const created = await tx.membership.create({
            data: {
              groupId: group.id,
              userId: user.id,
              role: 'MEMBER',
              joinOrder,
              joinedAt: now,
              lastSeenTripEventSeq,
            },
            select: { id: true },
          });
          membershipId = created.id;
        }
        const [eventSeq] = await nextEventSeqs(tx, 1);
        return {
          response: {
            tripId: locked.id,
            groupId: group.id,
            status: locked.status,
          },
          event: {
            tripId: locked.id,
            groupId: group.id,
            membershipId,
            userId: user.id,
            joinedAt: now,
            rejoined: existing !== null,
            tripStatus: locked.status,
            eventSeq,
            occurredAt: now,
          },
        };
      });
    } catch (error) {
      // 잠금 덕에 보통은 위에서 걸린다. UNIQUE(groupId, userId)·(groupId, joinOrder)는 최종 방어
      if (isUniqueViolation(error)) {
        throw AppException.of('ALREADY_MEMBER', { cause: error });
      }
      throw error;
    }
    await this.events.publish({
      name: TRIP_EVENTS.MEMBERSHIP_JOINED,
      payload: result.event,
    });
    return result.response;
  }

  private async findGroup(code: string) {
    const normalized = normalizeInviteCode(code);
    if (!normalized) throw AppException.of('INVITE_CODE_INVALID');
    const group = await this.prisma.group.findFirst({
      where: { inviteCode: normalized, deletedAt: null },
      select: {
        id: true,
        name: true,
        trip: {
          select: {
            id: true,
            status: true,
            placeLabel: true,
            startDate: true,
            endDate: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!group?.trip || group.trip.deletedAt) {
      throw AppException.of('INVITE_CODE_INVALID');
    }
    return { ...group, trip: group.trip };
  }
}
