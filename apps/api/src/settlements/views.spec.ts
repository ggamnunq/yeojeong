import { Prisma } from '../generated/prisma/client.js';
import type { LedgerMember } from './ledger.js';
import {
  compareMeFirst,
  dayPosition,
  toExpenseListItem,
  toMemberSummary,
  type ExpenseItemRow,
} from './views.js';

const start = new Date('2026-11-12T00:00:00Z'); // @db.Date
const end = new Date('2026-11-15T00:00:00Z');

const member = (
  id: string,
  joinOrder: number,
  extra: Partial<LedgerMember> = {},
): LedgerMember => ({
  id,
  userId: `u-${id}`,
  leaveReason: null,
  nickname: id,
  profileImageUrl: null,
  role: joinOrder === 1 ? 'LEADER' : 'MEMBER',
  joinOrder,
  leftAt: null,
  ...extra,
});

describe('dayPosition (4-9 Day N, KST)', () => {
  it('counts days from the start date in KST', () => {
    expect(dayPosition(new Date('2026-11-13T09:34:00Z'), start, end)).toEqual({
      localDate: '2026-11-13',
      dayIndex: 2,
      periodSide: null,
    });
    // 11.12 23:50 UTC = 11.13 08:50 KST
    expect(
      dayPosition(new Date('2026-11-12T23:50:00Z'), start, end).dayIndex,
    ).toBe(2);
    // 11.11 15:00 UTC = 11.12 00:00 KST → Day 1
    expect(
      dayPosition(new Date('2026-11-11T15:00:00Z'), start, end).dayIndex,
    ).toBe(1);
  });

  it('marks payments outside the period', () => {
    expect(dayPosition(new Date('2026-11-11T14:59:59Z'), start, end)).toEqual({
      localDate: '2026-11-11',
      dayIndex: null,
      periodSide: 'BEFORE',
    });
    expect(
      dayPosition(new Date('2026-11-15T15:00:00Z'), start, end).periodSide,
    ).toBe('AFTER');
    expect(
      dayPosition(new Date('2026-11-15T14:59:59Z'), start, end).dayIndex,
    ).toBe(4);
  });
});

describe('member summary', () => {
  it('marks me, left members and withdrawn members', () => {
    expect(toMemberSummary(member('a', 1), 'a')).toMatchObject({
      isMe: true,
      isLeft: false,
      role: 'LEADER',
    });
    expect(
      toMemberSummary(member('b', 2, { leftAt: new Date() }), 'a'),
    ).toMatchObject({ isMe: false, isLeft: true });
    expect(
      toMemberSummary(
        member('c', 3, {
          userId: null,
          leaveReason: 'ACCOUNT_DELETED',
          nickname: null,
          profileImageUrl: 'https://x',
        }),
        'a',
      ),
    ).toMatchObject({ nickname: '탈퇴한 멤버', profileImageUrl: null, isWithdrawn: true });
  });

  it('sorts me first, then by join order', () => {
    const list = [
      { membershipId: 'a', joinOrder: 1 },
      { membershipId: 'b', joinOrder: 2 },
      { membershipId: 'c', joinOrder: 3 },
    ];
    expect(
      [...list].sort(compareMeFirst('c')).map((m) => m.membershipId),
    ).toEqual(['c', 'a', 'b']);
  });
});

describe('toExpenseListItem', () => {
  const members = new Map([
    ['a', member('a', 1)],
    ['b', member('b', 2)],
    ['c', member('c', 3)],
  ]);
  const row: ExpenseItemRow = {
    id: 'e1',
    occurredAt: new Date('2026-11-13T07:40:00Z'),
    merchantName: '우메다 스카이빌딩',
    payerMembershipId: 'b',
    status: 'SHARED',
    krwAmount: 76_540,
    netKrwAmount: 73_540,
    originalAmount: new Prisma.Decimal('8000'),
    originalCurrency: 'JPY',
    changedAfterShared: true,
    duplicateGroupId: 'dup',
    duplicateDismissedAt: null,
    origin: 'AUTO',
    version: 3,
    shares: [
      { membershipId: 'a' },
      { membershipId: 'b' },
      { membershipId: 'c' },
    ],
    refunds: [
      {
        id: 'r1',
        occurredAt: new Date('2026-11-13T08:00:00Z'),
        krwAmount: -3_000,
      },
    ],
  };

  it('maps a shared payment with refunds for a non-payer', () => {
    const item = toExpenseListItem(row, {
      meId: 'c',
      members,
      startDate: start,
      endDate: end,
    });
    expect(item).toMatchObject({
      occurredAt: '2026-11-13T16:40:00+09:00',
      dayIndex: 2,
      krwAmount: 73_540,
      originalAmount: '8000',
      flags: { changed: true, duplicateSuspected: true, hasRefund: true },
      refunds: [
        {
          id: 'r1',
          occurredAt: '2026-11-13T17:00:00+09:00',
          krwAmount: -3_000,
        },
      ],
    });
    expect(item.participants?.map((p) => p.membershipId)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(item.payer).toMatchObject({ membershipId: 'b', isMe: false });
  });

  it('hides the changed flag from the payer and participants from personal payments', () => {
    expect(
      toExpenseListItem(row, {
        meId: 'b',
        members,
        startDate: start,
        endDate: end,
      }).flags.changed,
    ).toBe(false);
    const personal = toExpenseListItem(
      { ...row, status: 'PERSONAL', shares: [] },
      { meId: 'b', members, startDate: start, endDate: end },
    );
    expect(personal.participants).toBeNull();
  });
});
