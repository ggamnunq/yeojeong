import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MembershipContext, TripContext } from './auth-context.js';

export interface MembershipQuery {
  userId: string;
  tripId?: string;
  groupId?: string;
}

export interface MembershipLookupResult {
  membership: MembershipContext;
  /** 그룹 1 : 여정 1이라 보통 있다. 여정이 삭제됐거나 아직 없으면 null */
  trip: TripContext | null;
}

/**
 * 활성 멤버십(나가지 않음, 그룹·여정 삭제 안 됨)을 찾는다. 없으면 null → MembershipGuard가 404.
 * 테스트는 test/auth-helpers.ts의 StubMembershipLookup으로 바꿔 끼운다.
 */
export abstract class MembershipLookup {
  abstract find(query: MembershipQuery): Promise<MembershipLookupResult | null>;
}

@Injectable()
export class PrismaMembershipLookup extends MembershipLookup {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find({
    userId,
    tripId,
    groupId,
  }: MembershipQuery): Promise<MembershipLookupResult | null> {
    if (!tripId && !groupId) return null;
    const row = await this.prisma.membership.findFirst({
      where: {
        userId,
        leftAt: null,
        ...(groupId && { groupId }),
        group: {
          deletedAt: null,
          ...(tripId && { trip: { id: tripId, deletedAt: null } }),
        },
      },
      select: {
        id: true,
        groupId: true,
        role: true,
        joinOrder: true,
        joinedAt: true,
        group: {
          select: {
            trip: {
              select: {
                id: true,
                groupId: true,
                status: true,
                version: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
    if (!row) return null;
    const trip = row.group.trip;
    return {
      membership: {
        id: row.id,
        groupId: row.groupId,
        userId,
        role: row.role,
        joinOrder: row.joinOrder,
        joinedAt: row.joinedAt,
      },
      trip:
        trip && !trip.deletedAt
          ? {
              id: trip.id,
              groupId: trip.groupId,
              status: trip.status,
              version: trip.version,
            }
          : null,
    };
  }
}
