// 화면 미리보기와 서버 저장이 같은 계산을 쓰게 한다(기능명세 4-3·4-5, 부록 B).

export interface SplitParticipant {
  membershipId: string;
  /** 가입 순서. 결제자가 부담 인원에 없을 때 나머지를 질 사람을 고르는 기준 */
  joinOrder: number;
}

export interface SplitShare {
  membershipId: string;
  amountKrw: number;
  isRemainderHolder: boolean;
}

export interface SplitResult {
  /** floor(net / n) */
  perPersonKrw: number;
  /** net − perPerson × n (0 ≤ r < n) */
  remainderKrw: number;
  /** 나머지를 진 사람. 나머지가 0이면 null */
  remainderHolderMembershipId: string | null;
  /** 입력 순서 그대로. Σ amountKrw = netKrw */
  shares: SplitShare[];
}

/**
 * 공동 결제 균등 분할(FR-509). 1인 금액은 원 단위 내림, 나머지는 결제자가 진다.
 * 결제자가 부담 인원에 없으면 부담 인원 중 가입 순 첫 사람이 진다(미결 Q-08 추천안).
 * @throws 부담 인원이 없거나 겹칠 때, 금액이 0 이상의 정수가 아닐 때
 */
export function splitEvenly(
  netKrw: number,
  participants: readonly SplitParticipant[],
  payerMembershipId: string,
): SplitResult {
  if (!Number.isSafeInteger(netKrw) || netKrw < 0) {
    throw new RangeError('netKrw는 0 이상의 정수여야 합니다');
  }
  if (participants.length === 0) {
    throw new RangeError('PARTICIPANTS_REQUIRED');
  }
  const ids = new Set(participants.map((p) => p.membershipId));
  if (ids.size !== participants.length) {
    throw new RangeError('부담 인원이 겹칩니다');
  }

  const n = participants.length;
  const perPersonKrw = Math.floor(netKrw / n);
  const remainderKrw = netKrw - perPersonKrw * n;
  const holder =
    participants.find((p) => p.membershipId === payerMembershipId) ??
    [...participants].sort((a, b) => a.joinOrder - b.joinOrder)[0];
  const holderId = remainderKrw > 0 ? holder.membershipId : null;

  return {
    perPersonKrw,
    remainderKrw,
    remainderHolderMembershipId: holderId,
    shares: participants.map((p) => ({
      membershipId: p.membershipId,
      amountKrw:
        perPersonKrw + (p.membershipId === holderId ? remainderKrw : 0),
      isRemainderHolder: p.membershipId === holderId,
    })),
  };
}

const AMOUNT = /^-?\d{1,15}(\.\d{1,4})?$/;
const RATE = /^\d{1,12}(\.\d{1,6})?$/;

function scaled(value: string, scale: number): bigint {
  const negative = value.startsWith('-');
  const [integer, fraction = ''] = value.replace('-', '').split('.');
  const digits = BigInt(integer + fraction.padEnd(scale, '0'));
  return negative ? -digits : digits;
}

/**
 * 외화 금액(문자열 decimal) × 1단위당 원 → 원화, 10원 단위 반올림(half-up, 0에서 먼 쪽).
 * 부동소수점 오차를 피하려고 정수로 계산한다. toKrw('5960', '9.192') === 54780
 */
export function toKrw(amount: string, ratePerUnit: string): number {
  if (!AMOUNT.test(amount)) throw new RangeError(`금액 형식 오류: ${amount}`);
  if (!RATE.test(ratePerUnit)) {
    throw new RangeError(`환율 형식 오류: ${ratePerUnit}`);
  }
  const product = scaled(amount, 4) * scaled(ratePerUnit, 6); // 1e10 배
  const tenWon = 10n ** 11n;
  const half = tenWon / 2n;
  const units =
    product >= 0n ? (product + half) / tenWon : -((-product + half) / tenWon);
  return Number(units * 10n);
}

/** formatKrw(-26340) === '−₩26,340', formatKrw(103090, { sign: true }) === '+₩103,090' */
export function formatKrw(value: number, options: { sign?: boolean } = {}) {
  const prefix = value < 0 ? '−' : options.sign && value > 0 ? '+' : '';
  return `${prefix}₩${Math.abs(value).toLocaleString('ko-KR')}`;
}
