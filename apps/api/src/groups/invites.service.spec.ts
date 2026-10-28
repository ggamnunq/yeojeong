import { AppException } from '../common/errors/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DomainEventPublisher } from '../trips/domain-event.publisher.js';
import { pickSuccessor } from '../trips/trip-rules.js';
import { InvitesService } from './invites.service.js';

const user = { id: 'user-b', nickname: '이', profileImageUrl: null };
const now = new Date('2026-11-13T10:00:00+09:00');

function setup(existing: object | null) {
  const tx = {
    // lockTrip → nextEventSeqs 순서로 불린다
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'trip-1',
          groupId: 'group-1',
          status: 'ONGOING',
          version: 1,
          startAt: now,
          autoEndAt: now,
          deletedAt: null,
        },
      ])
      .mockResolvedValueOnce([{ seq: 42n }]),
    membership: {
      findUnique: vi.fn().mockResolvedValue(existing),
      count: vi.fn().mockResolvedValue(3),
      aggregate: vi.fn().mockResolvedValue({ _max: { joinOrder: 4 } }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: 'new-membership' }),
    },
    tripEvent: { findFirst: vi.fn().mockResolvedValue({ seq: 7n }) },
  };
  const prisma = {
    group: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'group-1',
        name: '오사카',
        trip: {
          id: 'trip-1',
          status: 'ONGOING',
          placeLabel: '일본 오사카',
          startDate: now,
          endDate: now,
          deletedAt: null,
        },
      }),
    },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  const events = { publish: vi.fn().mockResolvedValue(undefined) };
  const service = new InvitesService(
    prisma as unknown as PrismaService,
    events as unknown as DomainEventPublisher,
  );
  return { tx, events, service };
}

describe('InvitesService.join (Q-09)', () => {
  it('revives a member who left on the same row but at the back of the order', async () => {
    const { tx, events, service } = setup({
      id: 'membership-b',
      leftAt: new Date('2026-11-12T00:00:00Z'),
      leaveReason: 'LEFT',
    });
    await expect(service.join('K7M2QX', user, now)).resolves.toEqual({
      tripId: 'trip-1',
      groupId: 'group-1',
      status: 'ONGOING',
    });
    expect(tx.membership.create).not.toHaveBeenCalled();
    expect(tx.membership.update).toHaveBeenCalledWith({
      where: { id: 'membership-b' },
      data: {
        leftAt: null,
        leaveReason: null,
        kickedByMembershipId: null,
        role: 'MEMBER',
        joinOrder: 5,
        joinedAt: now,
        lastSeenTripEventSeq: 7n,
      },
    });
    expect(events.publish).toHaveBeenCalledWith({
      name: 'membership.joined',
      payload: expect.objectContaining({
        membershipId: 'membership-b',
        rejoined: true,
        joinedAt: now,
        eventSeq: 42n,
      }),
    });
  });

  it('gives a new member max + 1', async () => {
    const { tx, service } = setup(null);
    await service.join('K7M2QX', user, now);
    expect(tx.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ joinOrder: 5, role: 'MEMBER' }),
      }),
    );
  });

  it('keeps rejecting kicked members', async () => {
    const { tx, service } = setup({
      id: 'membership-b',
      leftAt: now,
      leaveReason: 'KICKED',
    });
    const error = await service.join('K7M2QX', user, now).catch((e) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('MEMBER_KICKED');
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('so a rejoined member no longer comes first in succession', () => {
    // 그룹장 a(1)가 나갈 때: b는 2에서 나갔다가 5로 재참여, c는 3
    const members = [
      { id: 'a', joinOrder: 1, leftAt: null },
      { id: 'b', joinOrder: 5, leftAt: null },
      { id: 'c', joinOrder: 3, leftAt: null },
    ];
    expect(pickSuccessor(members, 'a')?.id).toBe('c');
  });
});
