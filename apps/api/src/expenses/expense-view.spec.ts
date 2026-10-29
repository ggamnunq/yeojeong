import { Prisma } from '../generated/prisma/client.js';
import {
  formatOriginalAmount,
  toExpenseDetail,
  toExpenseRow,
  type ExpenseDetailRecord,
  type MemberRow,
  type ViewContext,
} from './expense-view.js';

const member = (
  id: string,
  joinOrder: number,
  nickname: string | null,
  leftAt: Date | null = null,
): MemberRow => ({
  id,
  role: joinOrder === 1 ? 'LEADER' : 'MEMBER',
  joinOrder,
  leftAt,
  userId: nickname === null ? null : id,
  leaveReason: nickname === null ? 'ACCOUNT_DELETED' : leftAt ? 'LEFT' : null,
  user: nickname === null ? null : { nickname, profileImageUrl: null },
});

const members = [
  member('junyong', 1, '준용'),
  member('minji', 2, '민지'),
  member('taehyun', 3, '태현'),
  member('subin', 4, '수빈', new Date('2026-11-13T00:00:00Z')),
];

const ctx = (
  viewer: string,
  tripStatus: ViewContext['tripStatus'] = 'ONGOING',
): ViewContext => ({
  tripStatus,
  period: { startDate: '2026-11-12', endDate: '2026-11-15' },
  viewerMembershipId: viewer,
  members: new Map(members.map((m) => [m.id, m])),
});

const record = (
  over: Partial<ExpenseDetailRecord> = {},
): ExpenseDetailRecord => ({
  id: 'e1',
  tripId: 't1',
  transactionId: 'tx1',
  payerMembershipId: 'junyong',
  createdByMembershipId: null,
  createdBy: null,
  status: 'SHARED',
  origin: 'AUTO',
  occurredAt: new Date('2026-11-13T05:10:00Z'), // 14:10 KST
  merchantName: 'MK택시',
  originalAmount: new Prisma.Decimal('2860'),
  originalCurrency: 'JPY',
  krwAmount: 26290,
  netKrwAmount: 26290,
  refundOfExpenseId: null,
  duplicateGroupId: null,
  duplicateDismissedAt: null,
  changedAfterShared: true,
  firstSharedAt: new Date(),
  confirmedAt: new Date(),
  version: 3,
  shares: [
    { membershipId: 'taehyun', amountKrw: 6572, isRemainderHolder: false },
    { membershipId: 'junyong', amountKrw: 6574, isRemainderHolder: true },
    { membershipId: 'minji', amountKrw: 6572, isRemainderHolder: false },
    { membershipId: 'subin', amountKrw: 6572, isRemainderHolder: false },
  ],
  refunds: [],
  fxPolicyApplied: 'SPOT_AT_PAYMENT',
  fxRate: new Prisma.Decimal('9.192'),
  fxRateUnit: 100,
  fxRateSource: '하나은행 매매기준율',
  fxRateAt: new Date('2026-11-13T09:00:00Z'),
  transaction: {
    paymentMethod: { shortLabel: '토스뱅크 체크카드', last4: '1934' },
  },
  ...over,
});

describe('toExpenseRow', () => {
  it('formats KST time, Day N, and sorts participants me first', () => {
    const row = toExpenseRow(record(), ctx('minji'));
    expect(row).toMatchObject({
      occurredAt: '2026-11-13T14:10:00+09:00',
      localDate: '2026-11-13',
      dayIndex: 2,
      periodSide: null,
      krwAmount: 26290,
      originalAmount: '2860',
      status: 'SHARED',
      payer: {
        membershipId: 'junyong',
        nickname: '준용',
        isMe: false,
        role: 'LEADER',
      },
    });
    expect(row.participants?.map((p) => p.membershipId)).toEqual([
      'minji',
      'junyong',
      'taehyun',
      'subin',
    ]);
    expect(row.participants?.at(-1)).toMatchObject({ isLeft: true });
  });

  it('shows "변경됨" only to members who did not pay', () => {
    expect(toExpenseRow(record(), ctx('minji')).flags.changed).toBe(true);
    expect(toExpenseRow(record(), ctx('junyong')).flags.changed).toBe(false);
    expect(
      toExpenseRow(record({ changedAfterShared: false }), ctx('minji')).flags
        .changed,
    ).toBe(false);
  });

  it('nets refunds into the bundle and keeps the gross amount', () => {
    const row = toExpenseRow(
      record({
        merchantName: '오사카 주유패스 (4매)',
        originalAmount: new Prisma.Decimal('13200'),
        krwAmount: 121330,
        netKrwAmount: 0,
        refunds: [
          {
            id: 'r1',
            occurredAt: new Date('2026-11-13T03:15:00Z'),
            krwAmount: -121330,
            originalAmount: new Prisma.Decimal('-13200'),
          },
        ],
      }),
      ctx('minji'),
    );
    expect(row).toMatchObject({
      krwAmount: 0,
      grossKrwAmount: 121330,
      netOriginalAmount: '0',
      flags: { hasRefund: true },
      refunds: [
        {
          id: 'r1',
          occurredAt: '2026-11-13T12:15:00+09:00',
          krwAmount: -121330,
          originalAmount: '-13200',
        },
      ],
    });
  });

  it('reports pending expenses of an ended trip as personal without participants', () => {
    const row = toExpenseRow(
      record({ status: 'PENDING', shares: [] }),
      ctx('junyong', 'ENDED'),
    );
    expect(row.status).toBe('PERSONAL');
    expect(row.participants).toBeNull();
  });

  it('marks dates outside the trip as before/after', () => {
    const before = toExpenseRow(
      record({
        occurredAt: new Date('2026-10-20T12:00:00Z'),
        origin: 'OUT_OF_PERIOD',
      }),
      ctx('junyong'),
    );
    expect(before).toMatchObject({
      dayIndex: null,
      periodSide: 'BEFORE',
      localDate: '2026-10-20',
    });
  });

  it('flags duplicates only while shared and not dismissed', () => {
    expect(
      toExpenseRow(record({ duplicateGroupId: 'g' }), ctx('minji')).flags
        .duplicateSuspected,
    ).toBe(true);
    expect(
      toExpenseRow(
        record({ duplicateGroupId: 'g', duplicateDismissedAt: new Date() }),
        ctx('minji'),
      ).flags.duplicateSuspected,
    ).toBe(false);
  });

  it('shows withdrawn members with the fixed label', () => {
    const withdrawn = new Map(ctx('minji').members);
    withdrawn.set('junyong', member('junyong', 1, null));
    const row = toExpenseRow(record(), { ...ctx('minji'), members: withdrawn });
    expect(row.payer.nickname).toBe('탈퇴한 멤버');
  });
});

describe('toExpenseDetail', () => {
  it('gives the payer the payment method, permissions and toggle candidates', () => {
    const detail = toExpenseDetail(record(), ctx('junyong'));
    expect(detail).toMatchObject({
      paymentMethodLabel: '토스뱅크 체크카드 1934',
      perPersonKrw: 6572,
      remainderKrw: 2,
      remainderHolderMembershipId: 'junyong',
      permissions: { canEdit: true, reason: null, isPayer: true },
      walletEntryId: 'tx1',
      createdByMembershipId: null,
      fx: {
        rate: '9.192',
        displayUnit: 100,
        policy: 'SPOT_AT_PAYMENT',
        rateAt: '2026-11-13T18:00:00+09:00',
      },
    });
    expect(detail.shares.map((s) => s.membershipId)).toEqual([
      'junyong',
      'minji',
      'taehyun',
      'subin',
    ]);
    // 지금 부담 인원에 있는 나간 멤버(수빈)는 토글에 남는다(해제만)
    expect(detail.participantCandidates?.map((m) => m.membershipId)).toEqual([
      'junyong',
      'minji',
      'taehyun',
      'subin',
    ]);
    expect(detail.defaultParticipantMembershipIds).toEqual([
      'taehyun',
      'junyong',
      'minji',
      'subin',
    ]);
  });

  it('hides the payment method and editing from other members', () => {
    const detail = toExpenseDetail(record(), ctx('minji'));
    expect(detail.paymentMethodLabel).toBeNull();
    expect(detail.permissions).toEqual({
      canEdit: false,
      reason: 'NOT_PAYER',
      isPayer: false,
      isAuthor: false,
    });
    expect(detail.walletEntryId).toBeNull();
    expect(detail.participantCandidates).toBeNull();
    expect(detail.defaultParticipantMembershipIds).toBeNull();
  });

  it('defaults a pending expense to every active member', () => {
    const detail = toExpenseDetail(
      record({ status: 'PENDING', shares: [] }),
      ctx('junyong'),
    );
    expect(detail.participantCandidates?.map((m) => m.membershipId)).toEqual([
      'junyong',
      'minji',
      'taehyun',
    ]);
    expect(detail.defaultParticipantMembershipIds).toEqual([
      'junyong',
      'minji',
      'taehyun',
    ]);
    expect(detail.perPersonKrw).toBeNull();
  });

  it('locks expenses of a member who left', () => {
    const detail = toExpenseDetail(
      record({ payerMembershipId: 'subin' }),
      ctx('minji'),
    );
    expect(detail.permissions).toEqual({
      canEdit: false,
      reason: 'PAYER_LEFT',
      isPayer: false,
      isAuthor: false,
    });
    expect(detail.payer.isLeft).toBe(true);
  });

  it('lets only the payer dismiss a duplicate while editable', () => {
    expect(
      toExpenseDetail(record({ duplicateGroupId: 'g' }), ctx('junyong'))
        .duplicate,
    ).toEqual({
      groupId: 'g',
      canDismiss: true,
    });
    expect(
      toExpenseDetail(record({ duplicateGroupId: 'g' }), ctx('minji'))
        .duplicate,
    ).toEqual({
      groupId: 'g',
      canDismiss: false,
    });
    expect(
      toExpenseDetail(
        record({ duplicateGroupId: 'g' }),
        ctx('junyong', 'ENDED'),
      ).duplicate,
    ).toEqual({ groupId: 'g', canDismiss: false });
  });

  it('returns no fx snapshot for KRW payments', () => {
    const detail = toExpenseDetail(
      record({
        originalCurrency: 'KRW',
        originalAmount: new Prisma.Decimal('36000'),
        fxPolicyApplied: null,
        fxRate: null,
      }),
      ctx('junyong'),
    );
    expect(detail.fx).toBeNull();
    expect(detail.originalAmount).toBe('36000');
  });
});

describe('formatOriginalAmount', () => {
  it('uses ISO 4217 minor units', () => {
    expect(formatOriginalAmount(new Prisma.Decimal('12.5'), 'USD')).toBe(
      '12.50',
    );
    expect(formatOriginalAmount(new Prisma.Decimal('13200.0000'), 'JPY')).toBe(
      '13200',
    );
    expect(formatOriginalAmount(new Prisma.Decimal('1.2345'), 'USD')).toBe(
      '1.2345',
    );
    expect(formatOriginalAmount(new Prisma.Decimal('-3300'), 'JPY')).toBe(
      '-3300',
    );
  });
});
