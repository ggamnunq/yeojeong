import {
  findSameUserDuplicates,
  fromScaled,
  isWithinTrip,
  matchCancel,
  parentNetKrw,
  refundChildKrw,
  roundTo10,
  toScaled,
  type DedupeTx,
  type MatchTx,
} from './import-rules.js';

const at = (iso: string) => new Date(`${iso}+09:00`);

describe('decimal helpers', () => {
  it('scales original amounts to 4 decimals and back', () => {
    expect(toScaled('13200')).toBe(132_000_000n);
    expect(toScaled('-3300.5')).toBe(-33_005_000n);
    expect(fromScaled(-33_005_000n)).toBe('-3300.5000');
    expect(() => toScaled('1.23456')).toThrow(RangeError);
    expect(() => toScaled('1e5')).toThrow(RangeError);
  });

  it('rounds to 10 won half-up away from zero', () => {
    expect(roundTo10(303325n, 10n)).toBe(30330); // 30332.5 → 30330
    expect(roundTo10(303350n, 10n)).toBe(30340); // 30335 → 30340
    expect(roundTo10(-303350n, 10n)).toBe(-30340);
  });
});

describe('refund child (4-1-4)', () => {
  const pass = {
    krwAmount: 121330,
    originalAmount: '13200',
    originalCurrency: 'JPY',
  };

  it('full cancel nets exactly to zero', () => {
    const child = refundChildKrw(pass, '-13200');
    expect(child).toBe(-121330);
    expect(parentNetKrw(pass.krwAmount, [child])).toBe(0);
  });

  it('partial cancel uses the parent rate (FR-406 AC2)', () => {
    const child = refundChildKrw(pass, '-3300');
    expect(child).toBe(-30330);
    expect(parentNetKrw(pass.krwAmount, [child])).toBe(91000);
  });

  it('KRW cancel is the amount as is and net never goes below zero', () => {
    const parent = {
      krwAmount: 36000,
      originalAmount: '36000',
      originalCurrency: 'KRW',
    };
    expect(refundChildKrw(parent, '-10000')).toBe(-10000);
    expect(parentNetKrw(36000, [-30000, -10000])).toBe(0);
  });
});

describe('period (4-1-2, KST boundary)', () => {
  const trip = {
    startAt: at('2026-11-12T00:00:00'),
    autoEndAt: at('2026-11-15T23:59:59'),
  };
  it('includes both ends and excludes the evening before', () => {
    expect(isWithinTrip(at('2026-11-12T00:00:00'), trip)).toBe(true);
    expect(isWithinTrip(at('2026-11-15T23:59:59'), trip)).toBe(true);
    expect(isWithinTrip(at('2026-11-11T23:50:00'), trip)).toBe(false); // FR-403 AC2
    expect(isWithinTrip(at('2026-11-16T00:00:00'), trip)).toBe(false);
  });
});

describe('same-user dedupe (4-1-3, FR-405)', () => {
  const card = (
    id: string,
    time: string,
    krw: number,
    over: Partial<DedupeTx> = {},
  ): DedupeTx => ({
    id,
    kind: 'APPROVAL',
    occurredAt: at(time),
    originalAmount: '1280',
    originalCurrency: 'JPY',
    providerKrwAmount: krw,
    methodType: 'CARD',
    methodRef: 'check-card',
    linkedAccountRef: 'toss-account',
    sameUserDuplicateOfId: null,
    ...over,
  });
  const account = (
    id: string,
    time: string,
    krw: number,
    over: Partial<DedupeTx> = {},
  ): DedupeTx => ({
    id,
    kind: 'APPROVAL',
    occurredAt: at(time),
    originalAmount: String(krw),
    originalCurrency: 'KRW',
    providerKrwAmount: krw,
    methodType: 'ACCOUNT',
    methodRef: 'toss-account',
    linkedAccountRef: null,
    sameUserDuplicateOfId: null,
    ...over,
  });

  it('marks the account withdrawal of a linked check card payment within 2 minutes', () => {
    const pairs = findSameUserDuplicates([
      card('c1', '2026-11-13T08:50:00', 11770),
      account('a1', '2026-11-13T08:50:20', 11770),
    ]);
    expect(pairs).toEqual([{ accountTxId: 'a1', cardTxId: 'c1' }]);
  });

  it('keeps both when the amount, time or link differs', () => {
    expect(
      findSameUserDuplicates([
        card('c1', '2026-11-13T08:50:00', 11770),
        account('a1', '2026-11-13T08:52:01', 11770), // 121초
        account('a2', '2026-11-13T08:50:10', 11780), // 금액 다름
        account('a3', '2026-11-13T08:50:10', 11770, {
          methodRef: 'other-account',
        }),
      ]),
    ).toEqual([]);
    // 연결 계좌 정보가 없는 카드는 묶지 않는다(미결 Q-31)
    expect(
      findSameUserDuplicates([
        card('c1', '2026-11-13T08:50:00', 11770, { linkedAccountRef: null }),
        account('a1', '2026-11-13T08:50:20', 11770),
      ]),
    ).toEqual([]);
  });

  it('pairs one card with one account and keeps two same-merchant payments at different times (FR-405 AC2)', () => {
    const pairs = findSameUserDuplicates([
      card('c1', '2026-11-13T08:50:00', 11770),
      card('c2', '2026-11-13T12:00:00', 11770),
      account('a1', '2026-11-13T08:50:20', 11770),
      account('a2', '2026-11-13T08:50:40', 11770),
      account('a3', '2026-11-13T12:00:30', 11770),
    ]);
    expect(pairs).toEqual([
      { accountTxId: 'a1', cardTxId: 'c1' },
      { accountTxId: 'a3', cardTxId: 'c2' },
    ]);
  });
});

describe('cancel matching (4-1-4)', () => {
  const tx = (id: string, over: Partial<MatchTx>): MatchTx => ({
    id,
    paymentMethodId: 'pm1',
    externalRef: `ref-${id}`,
    kind: 'APPROVAL',
    occurredAt: at('2026-11-14T09:40:00'),
    merchantKey: '오사카주유패스4매',
    originalAmount: '13200.0000',
    originalCurrency: 'JPY',
    providerApprovalRef: null,
    ...over,
  });

  it('matches by the provider approval ref first', () => {
    const cancel = tx('x', {
      kind: 'CANCEL',
      occurredAt: at('2026-11-14T12:15:00'),
      originalAmount: '-13200.0000',
      providerApprovalRef: 'ref-b',
      merchantKey: '다른가맹점',
    });
    expect(
      matchCancel(cancel, [tx('a', {}), tx('b', { paymentMethodId: 'pm2' })]),
    ).toBe('b');
  });

  it('infers by method, merchant, currency and remaining amount; exact amount then most recent', () => {
    const approvals = [
      tx('old', { occurredAt: at('2026-11-14T08:00:00') }),
      tx('recent', { occurredAt: at('2026-11-14T09:40:00') }),
      tx('bigger', {
        occurredAt: at('2026-11-14T10:00:00'),
        originalAmount: '20000',
      }),
      tx('later', { occurredAt: at('2026-11-14T13:00:00') }), // 취소보다 늦음
      tx('other', { paymentMethodId: 'pm2' }),
    ];
    const cancel = tx('c', {
      kind: 'CANCEL',
      occurredAt: at('2026-11-14T12:15:00'),
      originalAmount: '-13200',
    });
    expect(matchCancel(cancel, approvals)).toBe('recent');
    // 이미 전액 매칭된 원 결제는 건너뛴다
    expect(
      matchCancel(cancel, approvals, new Map([['recent', 132_000_000n]])),
    ).toBe('old');
    const partial = tx('p', {
      kind: 'CANCEL',
      occurredAt: at('2026-11-14T12:15:00'),
      originalAmount: '-3300',
    });
    expect(
      matchCancel(
        partial,
        approvals,
        new Map([
          ['recent', 132_000_000n],
          ['old', 132_000_000n],
        ]),
      ),
    ).toBe('bigger');
  });

  it('returns null when nothing fits', () => {
    const cancel = tx('c', {
      kind: 'CANCEL',
      occurredAt: at('2026-11-14T12:15:00'),
      originalCurrency: 'KRW',
    });
    expect(matchCancel(cancel, [tx('a', {})])).toBeNull();
  });
});
