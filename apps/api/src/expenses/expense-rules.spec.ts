import {
  CLASSIFICATION_TRANSITIONS,
  changeSnapshot,
  computePermissions,
  computeSplit,
  effectiveStatus,
  invalidParticipants,
  isPayerOnly,
  isVisibleTo,
  planClassification,
  splitFromShares,
  statusFilterWhere,
  visibleExpenseWhere,
  type ClassificationCurrent,
  type GroupMember,
} from './expense-rules.js';

const ME = 'm-me';
const OTHER = 'm-other';

describe('visibility (4-2, I-8)', () => {
  const base = { payerMembershipId: OTHER, refundOfExpenseId: null };

  it('hides pending and personal expenses from everyone but the payer', () => {
    expect(isVisibleTo({ ...base, status: 'PENDING' }, ME)).toBe(false);
    expect(isVisibleTo({ ...base, status: 'PERSONAL' }, ME)).toBe(false);
    expect(isVisibleTo({ ...base, status: 'SHARED' }, ME)).toBe(true);
    expect(isVisibleTo({ ...base, status: 'PENDING' }, OTHER)).toBe(true);
    expect(isVisibleTo({ ...base, status: 'PERSONAL' }, OTHER)).toBe(true);
  });

  it('never exposes refund children on their own', () => {
    expect(
      isVisibleTo({ ...base, status: 'SHARED', refundOfExpenseId: 'p' }, OTHER),
    ).toBe(false);
  });

  it('builds the same rule as a DB filter', () => {
    expect(visibleExpenseWhere(ME)).toEqual({
      refundOfExpenseId: null,
      OR: [{ status: 'SHARED' }, { payerMembershipId: ME }],
    });
  });

  it('treats pending expenses of an ended trip as personal', () => {
    expect(effectiveStatus('PENDING', 'ENDED')).toBe('PERSONAL');
    expect(effectiveStatus('PENDING', 'ONGOING')).toBe('PENDING');
    expect(effectiveStatus('SHARED', 'ENDED')).toBe('SHARED');
    expect(statusFilterWhere('PENDING', 'ENDED')).toEqual({ id: { in: [] } });
    expect(statusFilterWhere('PERSONAL', 'ENDED')).toEqual({
      status: { in: ['PERSONAL', 'PENDING'] },
    });
    expect(statusFilterWhere('PENDING', 'ONGOING')).toEqual({
      status: 'PENDING',
    });
    expect(statusFilterWhere(undefined, 'ONGOING')).toEqual({});
  });
});

describe('permissions (FR-503·512)', () => {
  it('lets only the active payer edit while the trip is ongoing', () => {
    expect(
      computePermissions({
        tripStatus: 'ONGOING',
        isPayer: true,
        payerLeft: false,
      }),
    ).toEqual({ canEdit: true, reason: null, isPayer: true });
    expect(
      computePermissions({
        tripStatus: 'ONGOING',
        isPayer: false,
        payerLeft: false,
      }),
    ).toEqual({ canEdit: false, reason: 'NOT_PAYER', isPayer: false });
  });

  it('locks everything after the trip ends, before payer checks', () => {
    expect(
      computePermissions({
        tripStatus: 'ENDED',
        isPayer: true,
        payerLeft: false,
      }),
    ).toEqual({ canEdit: false, reason: 'TRIP_ENDED', isPayer: true });
    expect(
      computePermissions({
        tripStatus: 'ENDED',
        isPayer: false,
        payerLeft: true,
      }).reason,
    ).toBe('TRIP_ENDED');
    expect(
      computePermissions({
        tripStatus: 'UPCOMING',
        isPayer: true,
        payerLeft: false,
      }).reason,
    ).toBe('TRIP_NOT_STARTED');
  });

  it('marks expenses of a member who left as read-only', () => {
    expect(
      computePermissions({
        tripStatus: 'ONGOING',
        isPayer: false,
        payerLeft: true,
      }),
    ).toEqual({ canEdit: false, reason: 'PAYER_LEFT', isPayer: false });
  });
});

describe('state transitions (3-2)', () => {
  it('lists every payer transition with its change log action', () => {
    expect(CLASSIFICATION_TRANSITIONS).toEqual({
      PENDING: { PERSONAL: 'CONFIRM_PERSONAL', SHARED: 'CONFIRM_SHARED' },
      PERSONAL: { PERSONAL: null, SHARED: 'PERSONAL_TO_SHARED' },
      SHARED: {
        PERSONAL: 'SHARED_TO_PERSONAL',
        SHARED: 'PARTICIPANTS_CHANGED',
      },
    });
  });

  const current = (
    over: Partial<ClassificationCurrent> = {},
  ): ClassificationCurrent => ({
    status: 'PENDING',
    participantIds: [],
    firstSharedAt: null,
    confirmedAt: null,
    ...over,
  });
  const active = ['a', 'b', 'c', 'd'];
  /** 결제자 = a */
  const plan = (
    c: ClassificationCurrent,
    r: Parameters<typeof planClassification>[1],
    a: readonly string[],
  ) => planClassification(c, r, a, 'a');

  it('confirms a pending expense as personal', () => {
    expect(plan(current(), { status: 'PERSONAL' }, active)).toMatchObject({
      kind: 'CHANGE',
      action: 'CONFIRM_PERSONAL',
      nextStatus: 'PERSONAL',
      markChanged: false,
      setConfirmedAt: true,
      becomesShared: false,
    });
  });

  it('confirms as shared with every active member by default', () => {
    expect(plan(current(), { status: 'SHARED' }, active)).toMatchObject({
      kind: 'CHANGE',
      action: 'CONFIRM_SHARED',
      participantIds: active,
      setFirstSharedAt: true,
      markChanged: false,
      becomesShared: true,
    });
    expect(
      plan(current(), { status: 'SHARED', participantIds: ['a', 'b'] }, active),
    ).toMatchObject({ participantIds: ['a', 'b'] });
  });

  it('rejects shared without participants', () => {
    expect(
      plan(current(), { status: 'SHARED', participantIds: [] }, active),
    ).toEqual({ kind: 'ERROR', code: 'PARTICIPANTS_REQUIRED' });
  });

  it('requires confirmation for shared → personal and marks it changed', () => {
    const shared = current({
      status: 'SHARED',
      participantIds: ['a', 'b'],
      firstSharedAt: new Date(),
      confirmedAt: new Date(),
    });
    expect(plan(shared, { status: 'PERSONAL' }, active)).toEqual({
      kind: 'ERROR',
      code: 'CONFIRM_REQUIRED',
    });
    expect(
      plan(
        shared,
        { status: 'PERSONAL', confirmSharedToPersonal: true },
        active,
      ),
    ).toMatchObject({
      kind: 'CHANGE',
      action: 'SHARED_TO_PERSONAL',
      markChanged: true,
      leavesShared: true,
      setConfirmedAt: false,
    });
  });

  it('marks personal → shared as changed only when it was shared before', () => {
    const neverShared = current({
      status: 'PERSONAL',
      confirmedAt: new Date(),
    });
    expect(plan(neverShared, { status: 'SHARED' }, active)).toMatchObject({
      action: 'PERSONAL_TO_SHARED',
      markChanged: false,
      setFirstSharedAt: true,
    });
    const reShared = current({
      status: 'PERSONAL',
      confirmedAt: new Date(),
      firstSharedAt: new Date(),
    });
    expect(plan(reShared, { status: 'SHARED' }, active)).toMatchObject({
      action: 'PERSONAL_TO_SHARED',
      markChanged: true,
      setFirstSharedAt: false,
    });
  });

  it('changes participants only when the set differs', () => {
    const shared = current({
      status: 'SHARED',
      participantIds: ['a', 'b'],
      firstSharedAt: new Date(),
    });
    expect(
      plan(shared, { status: 'SHARED', participantIds: ['b', 'a'] }, active),
    ).toEqual({ kind: 'NOOP' });
    expect(plan(shared, { status: 'SHARED' }, active)).toEqual({
      kind: 'NOOP',
    });
    expect(
      plan(
        shared,
        { status: 'SHARED', participantIds: ['a', 'b', 'c'] },
        active,
      ),
    ).toMatchObject({
      action: 'PARTICIPANTS_CHANGED',
      markChanged: true,
      becomesShared: false,
    });
  });

  it('rejects shared with only the payer, but allows others without the payer (Q-08)', () => {
    expect(
      plan(current(), { status: 'SHARED', participantIds: ['a'] }, active),
    ).toEqual({ kind: 'ERROR', code: 'PAYER_ONLY' });
    // 활성 멤버가 결제자뿐이면 기본값(전원)도 결제자 혼자다
    expect(plan(current(), { status: 'SHARED' }, ['a'])).toEqual({
      kind: 'ERROR',
      code: 'PAYER_ONLY',
    });
    expect(
      plan(
        current({
          status: 'SHARED',
          participantIds: ['a', 'b'],
          firstSharedAt: new Date(),
        }),
        { status: 'SHARED', participantIds: ['a'] },
        active,
      ),
    ).toEqual({ kind: 'ERROR', code: 'PAYER_ONLY' });
    expect(
      plan(current(), { status: 'SHARED', participantIds: ['b'] }, active),
    ).toMatchObject({ kind: 'CHANGE', participantIds: ['b'] });
    expect(isPayerOnly(['a'], 'a')).toBe(true);
    expect(isPayerOnly(['b'], 'a')).toBe(false);
    expect(isPayerOnly(['a', 'b'], 'a')).toBe(false);
  });

  it('is idempotent for personal → personal', () => {
    expect(
      plan(current({ status: 'PERSONAL' }), { status: 'PERSONAL' }, active),
    ).toEqual({ kind: 'NOOP' });
  });
});

describe('participants (4-3)', () => {
  const members: GroupMember[] = [
    { id: 'a', joinOrder: 1, leftAt: null },
    { id: 'b', joinOrder: 2, leftAt: null },
    { id: 'gone', joinOrder: 3, leftAt: new Date() },
  ];

  it('accepts active members and keeps left members only if already sharing', () => {
    expect(invalidParticipants(['a', 'b'], members, [])).toEqual([]);
    expect(invalidParticipants(['a', 'gone'], members, [])).toEqual(['gone']);
    expect(invalidParticipants(['a', 'gone'], members, ['a', 'gone'])).toEqual(
      [],
    );
    expect(invalidParticipants(['a', 'stranger'], members, [])).toEqual([
      'stranger',
    ]);
  });
});

describe('split (FR-509, 4-3 sample numbers)', () => {
  const members: GroupMember[] = [
    { id: 'junyong', joinOrder: 1, leftAt: null },
    { id: 'minji', joinOrder: 2, leftAt: null },
    { id: 'taehyun', joinOrder: 3, leftAt: null },
    { id: 'subin', joinOrder: 4, leftAt: null },
  ];
  const all = members.map((m) => m.id);

  it('splits evenly and gives the remainder to the payer', () => {
    const split = computeSplit(26290, all, members, 'junyong');
    expect(split.perPersonKrw).toBe(6572);
    expect(split.remainderKrw).toBe(2);
    expect(split.shares.map((s) => s.amountKrw)).toEqual([
      6574, 6572, 6572, 6572,
    ]);
    expect(split.shares.reduce((sum, s) => sum + s.amountKrw, 0)).toBe(26290);
    expect(split.remainderHolderMembershipId).toBe('junyong');
  });

  it('recomputes when participants change (551 호라이 4 → 3)', () => {
    expect(computeSplit(25740, all, members, 'junyong').perPersonKrw).toBe(
      6435,
    );
    expect(
      computeSplit(25740, ['taehyun', 'junyong', 'minji'], members, 'junyong')
        .shares,
    ).toEqual([
      { membershipId: 'junyong', amountKrw: 8580, isRemainderHolder: false },
      { membershipId: 'minji', amountKrw: 8580, isRemainderHolder: false },
      { membershipId: 'taehyun', amountKrw: 8580, isRemainderHolder: false },
    ]);
  });

  it('gives the remainder to the first joiner when the payer is not sharing', () => {
    const split = computeSplit(
      100,
      ['subin', 'minji', 'taehyun'],
      members,
      'junyong',
    );
    expect(split.remainderHolderMembershipId).toBe('minji');
    expect(
      split.shares.find((s) => s.membershipId === 'minji')?.amountKrw,
    ).toBe(34);
  });

  it('handles a fully refunded bundle', () => {
    const split = computeSplit(0, all, members, 'junyong');
    expect(split.perPersonKrw).toBe(0);
    expect(split.remainderHolderMembershipId).toBeNull();
  });

  it('reads per-person and remainder back from stored shares', () => {
    expect(
      splitFromShares(26290, [
        { membershipId: 'junyong', isRemainderHolder: true },
        { membershipId: 'minji', isRemainderHolder: false },
        { membershipId: 'taehyun', isRemainderHolder: false },
        { membershipId: 'subin', isRemainderHolder: false },
      ]),
    ).toEqual({
      perPersonKrw: 6572,
      remainderKrw: 2,
      remainderHolderMembershipId: 'junyong',
    });
    expect(splitFromShares(1000, [])).toEqual({
      perPersonKrw: null,
      remainderKrw: 0,
      remainderHolderMembershipId: null,
    });
  });

  it('records change log snapshots in the documented shape', () => {
    expect(changeSnapshot('SHARED', ['a', 'b'], 25741)).toEqual({
      status: 'SHARED',
      participantIds: ['a', 'b'],
      netKrwAmount: 25741,
      perPersonKrw: 12870,
    });
    expect(changeSnapshot('PERSONAL', [], 100).perPersonKrw).toBeNull();
  });
});
