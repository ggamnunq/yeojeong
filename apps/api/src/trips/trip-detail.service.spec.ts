import { NotFoundError } from '../common/errors/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TripDetailService } from './trip-detail.service.js';

const member = (
  id: string,
  joinOrder: number,
  nickname: string | null,
  role = 'MEMBER',
) => ({
  id,
  role,
  joinOrder,
  leftAt: null,
  userId: nickname ? `user-${id}` : null,
  user: nickname ? { nickname, profileImageUrl: null } : null,
  lastSeenTripEventSeq: id === 'm2' ? 5n : null,
});

function tripRow(overrides: object = {}) {
  return {
    id: 'trip-1',
    groupId: 'group-1',
    placeLabel: '일본 오사카',
    countryCode: 'JP',
    city: '오사카',
    currency: 'JPY',
    startDate: new Date('2026-11-12T00:00:00Z'),
    endDate: new Date('2026-11-15T00:00:00Z'),
    autoEndAt: new Date('2026-11-15T23:59:59+09:00'),
    budgetKrw: 1_200_000,
    status: 'ONGOING',
    startedAt: new Date('2026-11-12T09:00:00+09:00'),
    endedAt: null,
    endReason: null,
    fxPolicy: 'SPOT_AT_PAYMENT',
    version: 2,
    group: {
      name: '오사카 3박 4일',
      inviteCode: 'K7M2QX',
      memberships: [
        member('m1', 1, '민지', 'LEADER'),
        member('m2', 2, '태현'),
        member('m3', 3, null),
      ],
    },
    ...overrides,
  };
}

function setup(trip: object | null) {
  const prisma = {
    trip: { findFirst: vi.fn().mockResolvedValue(trip) },
    tripEvent: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'e1',
          type: 'LEADER_CHANGED',
          payload: { newLeaderMembershipId: 'm1', nickname: '옛 닉네임' },
        },
      ]),
    },
    expense: { count: vi.fn().mockResolvedValue(2) },
    paymentConnection: { count: vi.fn().mockResolvedValue(1) },
  };
  return {
    prisma,
    service: new TripDetailService(prisma as unknown as PrismaService),
  };
}

describe('TripDetailService', () => {
  const now = new Date('2026-11-13T12:00:00+09:00');

  it('maps the trip, my membership and unseen events', async () => {
    const { prisma, service } = setup(tripRow());
    const detail = await service.build('trip-1', 'm2', now);

    expect(detail).toMatchObject({
      tripId: 'trip-1',
      groupName: '오사카 3박 4일',
      status: 'ONGOING',
      startDate: '2026-11-12',
      endDate: '2026-11-15',
      memberCount: 3,
      isLeader: false,
      nights: 3,
      days: 4,
      dDay: null,
      todayDayIndex: 2,
      autoEndAt: '2026-11-15T23:59:59+09:00',
      startedAt: '2026-11-12T09:00:00+09:00',
      inviteCode: 'K7M2QX',
      me: {
        membershipId: 'm2',
        role: 'MEMBER',
        pendingCount: 2,
        connectionExpired: true,
      },
      fx: { policy: 'SPOT_AT_PAYMENT', tripCurrency: 'JPY' },
      shell: { defaultTab: 'EXPENSES' },
      permissions: { canEdit: false, canInvite: true },
      version: 2,
    });
    expect(detail.members.map((m) => [m.nickname, m.isMe, m.role])).toEqual([
      ['민지', false, 'LEADER'],
      ['태현', true, 'MEMBER'],
      ['탈퇴한 멤버', false, 'MEMBER'],
    ]);
    // 닉네임은 지금 값으로
    expect(detail.unseenEvents).toEqual([
      {
        id: 'e1',
        type: 'LEADER_CHANGED',
        payload: { newLeaderMembershipId: 'm1', nickname: '민지' },
      },
    ]);
    const eventQuery = prisma.tripEvent.findMany.mock.calls[0][0];
    expect(eventQuery.where).toMatchObject({
      tripId: 'trip-1',
      seq: { gt: 5n },
      OR: [{ actorMembershipId: null }, { actorMembershipId: { not: 'm2' } }],
    });
    expect(prisma.expense.count.mock.calls[0][0].where).toEqual({
      tripId: 'trip-1',
      payerMembershipId: 'm2',
      status: 'PENDING',
      refundOfExpenseId: null,
    });
  });

  it('hides the invite code after the end and drops fx for KRW trips', async () => {
    const { service } = setup(
      tripRow({
        status: 'ENDED',
        currency: 'KRW',
        countryCode: 'KR',
        endedAt: now,
        endReason: 'AUTO',
      }),
    );
    const detail = await service.build('trip-1', 'm1', now);
    expect(detail).toMatchObject({
      inviteCode: null,
      fx: null,
      endReason: 'AUTO',
      isLeader: true,
      shell: { defaultTab: 'SETTLEMENT', secondTab: 'SETTLEMENT' },
      permissions: { canEdit: false, canKick: false },
    });
  });

  it('returns 404 when the trip is gone or I am no longer active', async () => {
    await expect(
      setup(null).service.build('trip-1', 'm1', now),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      setup(tripRow()).service.build('trip-1', 'left', now),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
