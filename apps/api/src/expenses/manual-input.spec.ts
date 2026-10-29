import {
  defaultWalletCurrency,
  manualAmountError,
  manualKrwError,
  memoError,
  memoOf,
  merchantNameOf,
  occurredAtError,
  rankTripCandidates,
  suggestedTripOf,
  type TripCandidateInput,
} from './manual-input.js';

const kst = (value: string) => new Date(`${value}+09:00`);

describe('직접 입력 금액(S7)', () => {
  it('accepts positive amounts with the currency fraction digits', () => {
    expect(manualAmountError('13200', 'JPY')).toBeNull();
    expect(manualAmountError('12.50', 'USD')).toBeNull();
    expect(manualAmountError('12.5', 'USD')).toBeNull();
    // 0으로 끝나는 소수는 소수 자리로 세지 않는다
    expect(manualAmountError('1000.00', 'KRW')).toBeNull();
  });

  it('rejects zero, too many fraction digits and malformed values', () => {
    expect(manualAmountError('0', 'KRW')?.code).toBe('positive');
    expect(manualAmountError('0.00', 'USD')?.code).toBe('positive');
    expect(manualAmountError('100.5', 'KRW')?.code).toBe('fractionDigits');
    expect(manualAmountError('100.5', 'JPY')?.message).toBe(
      'JPY는 소수점 없이 입력해 주세요',
    );
    expect(manualAmountError('1.234', 'USD')?.code).toBe('fractionDigits');
    expect(manualAmountError('100.5', 'VND')?.code).toBe('fractionDigits');
    expect(manualAmountError('-1', 'KRW')?.code).toBe('isAmount');
    expect(manualAmountError('1e3', 'KRW')?.code).toBe('isAmount');
    expect(manualAmountError('1234567890123', 'KRW')?.code).toBe('isAmount');
  });

  it('caps the KRW value at ₩100,000,000', () => {
    expect(manualKrwError(100_000_000)).toBeNull();
    expect(manualKrwError(100_000_001)?.code).toBe('max');
  });
});

describe('메모(S7)', () => {
  it('removes line breaks and control characters and limits 40 characters after cleaning', () => {
    expect(merchantNameOf('  라멘\n\t이치란 \u0007 ')).toBe('라멘 이치란');
    expect(memoError(`  ${'가'.repeat(40)}  `)).toBeNull();
    expect(memoError('가'.repeat(41))?.code).toBe('maxLength');
    // 이모지는 한 글자로 센다
    expect(memoError('🍜'.repeat(40))).toBeNull();
  });

  it('strips invisible format characters (bidi overrides, zero-width space, BOM) but keeps ZWJ emoji sequences', () => {
    // 오른쪽→왼쪽 덮어쓰기(U+202E)로 "滴滴出行"을 뒤집어 보이게 하는 이름
    expect(merchantNameOf('\u202e滴滴\u202c出行')).toBe('滴滴出行');
    expect(merchantNameOf('\u2066라멘\u2069 \u200b이치란\ufeff')).toBe('라멘 이치란');
    // 보이지 않는 문자만 있으면 빈 메모("결제")
    expect(merchantNameOf('\u200b\u202e')).toBe('결제');
    const family = '👨\u200d👩\u200d👧';
    expect(merchantNameOf(family)).toBe(family);
    // 서식 문자를 지운 뒤 40자를 센다
    expect(memoError(`${'가'.repeat(40)}${'\u200b'.repeat(10)}`)).toBeNull();
  });

  it('stores "결제" for an empty memo and reads it back as no memo', () => {
    expect(merchantNameOf(undefined)).toBe('결제');
    expect(merchantNameOf('   ')).toBe('결제');
    expect(merchantNameOf(' 이치란 라멘 ')).toBe('이치란 라멘');
    expect(memoOf('결제')).toBeNull();
    expect(memoOf('이치란 라멘')).toBe('이치란 라멘');
  });
});

describe('결제 시각(S7)', () => {
  const now = kst('2026-11-13T12:00:00');
  it('allows up to 5 minutes ahead and 365 days back', () => {
    expect(occurredAtError(kst('2026-11-13T12:05:00'), now)).toBeNull();
    expect(occurredAtError(kst('2026-11-13T12:06:00'), now)?.code).toBe(
      'future',
    );
    expect(occurredAtError(kst('2025-11-14T12:00:00'), now)).toBeNull();
    expect(occurredAtError(kst('2025-11-12T12:00:00'), now)?.code).toBe(
      'tooOld',
    );
  });
});

describe('지갑 → 여정 자동 연결(S7, 명세 v0.6.0)', () => {
  const trip = (
    tripId: string,
    status: TripCandidateInput['status'],
    start: string,
    end: string,
    currency = 'JPY',
  ): TripCandidateInput => ({
    tripId,
    status,
    startAt: kst(`${start}T00:00:00`),
    autoEndAt: kst(`${end}T23:59:59`),
    currency,
  });

  it('picks an in-period trip, ongoing first, then the closest start date', () => {
    const trips = [
      trip('upcoming-in', 'UPCOMING', '2026-11-13', '2026-11-14', 'USD'),
      trip('ongoing-far', 'ONGOING', '2026-11-01', '2026-11-20', 'JPY'),
      trip('ongoing-near', 'ONGOING', '2026-11-12', '2026-11-15', 'EUR'),
      trip('later', 'UPCOMING', '2026-12-01', '2026-12-03', 'THB'),
    ];
    const ranked = rankTripCandidates(trips, kst('2026-11-13T14:10:00'));
    expect(ranked.map((r) => [r.trip.tripId, r.inPeriod])).toEqual([
      ['ongoing-near', true],
      ['ongoing-far', true],
      ['upcoming-in', true],
      ['later', false],
    ]);
    expect(suggestedTripOf(ranked)?.tripId).toBe('ongoing-near');
    expect(defaultWalletCurrency(ranked)).toBe('EUR');
  });

  it('uses the KST period bounds (start 00:00 ~ end 23:59:59)', () => {
    const trips = [trip('t', 'ONGOING', '2026-11-12', '2026-11-15')];
    expect(
      suggestedTripOf(rankTripCandidates(trips, kst('2026-11-12T00:00:00'))),
    ).not.toBeNull();
    expect(
      suggestedTripOf(rankTripCandidates(trips, kst('2026-11-15T23:59:59'))),
    ).not.toBeNull();
    expect(
      suggestedTripOf(rankTripCandidates(trips, kst('2026-11-16T00:00:00'))),
    ).toBeNull();
    expect(
      suggestedTripOf(rankTripCandidates(trips, kst('2026-11-11T23:59:59'))),
    ).toBeNull();
  });

  it('suggests nothing without an in-period trip and defaults to KRW without an ongoing trip', () => {
    const ranked = rankTripCandidates(
      [trip('later', 'UPCOMING', '2026-12-01', '2026-12-03', 'THB')],
      kst('2026-11-13T14:10:00'),
    );
    expect(ranked).toHaveLength(1);
    expect(suggestedTripOf(ranked)).toBeNull();
    expect(defaultWalletCurrency(ranked)).toBe('KRW');
  });

  it('never offers ended trips', () => {
    const ranked = rankTripCandidates(
      [trip('ended', 'ENDED', '2026-11-12', '2026-11-15')],
      kst('2026-11-13T14:10:00'),
    );
    expect(ranked).toEqual([]);
  });
});
