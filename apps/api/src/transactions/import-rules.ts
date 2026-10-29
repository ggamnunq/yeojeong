// 인입 규칙(기능명세 4-1) 중 DB와 무관한 판정. 서비스는 이 함수들로 판정하고 결과만 저장한다.
// 금액은 부동소수점을 피하려고 원통화 decimal 문자열을 소수 4자리 정수(BigInt)로 바꿔 계산한다.

/** ±2분: 동일 사용자 중복 제거(4-1-3) */
export const NEAR_WINDOW_MS = 120_000;

const SCALE = 4;
const SCALE_FACTOR = 10n ** BigInt(SCALE);
const DECIMAL = /^-?\d+(\.\d+)?$/;

/** "13200" · "12.5" · "-3300.0000" → 소수 4자리 정수. 4자리를 넘는 소수는 거부 */
export function toScaled(value: string): bigint {
  const v = value.trim();
  if (!DECIMAL.test(v)) throw new RangeError('금액 형식이 아닙니다');
  const negative = v.startsWith('-');
  const [int, frac = ''] = v.replace('-', '').split('.');
  const trimmed = frac.replace(/0+$/, '');
  if (trimmed.length > SCALE) throw new RangeError('소수 4자리를 넘습니다');
  const scaled =
    BigInt(int) * SCALE_FACTOR + BigInt(trimmed.padEnd(SCALE, '0'));
  return negative ? -scaled : scaled;
}

/** 소수 4자리 정수 → "13200.0000" 형식(Prisma Decimal 입력용) */
export function fromScaled(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const int = abs / SCALE_FACTOR;
  const frac = (abs % SCALE_FACTOR).toString().padStart(SCALE, '0');
  return `${negative ? '-' : ''}${int}.${frac}`;
}

export function absScaled(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** numerator / denominator를 10원 단위로 반올림(half-up, 0에서 먼 쪽). denominator > 0 */
export function roundTo10(numerator: bigint, denominator: bigint): number {
  const ten = denominator * 10n;
  const half = denominator * 5n;
  const units =
    numerator >= 0n ? (numerator + half) / ten : -((-numerator + half) / ten);
  return Number(units * 10n);
}

/** 원 단위 반올림(half-up). KRW 거래의 소수(드묾)를 정수로 만든다 */
export function roundToWon(value: bigint): number {
  const half = SCALE_FACTOR / 2n;
  return Number(
    value >= 0n
      ? (value + half) / SCALE_FACTOR
      : -((-value + half) / SCALE_FACTOR),
  );
}

/**
 * 취소 자식의 원화(4-1-4 단계 5): 부모와 같은 환율로 계산한다.
 * - KRW 결제: 취소 금액 그대로(음수)
 * - 외화 전액 취소: 정확히 −부모 원화(합계가 0이 되게)
 * - 외화 부분 취소: −roundTo10(부모 원화 × |취소| / |부모|)
 * 예) 주유패스 ¥13,200 = ₩121,330, 부분 취소 ¥3,300 → −₩30,330
 */
export function refundChildKrw(
  parent: {
    krwAmount: number;
    originalAmount: string;
    originalCurrency: string;
  },
  cancelAmount: string,
): number {
  const cancel = absScaled(toScaled(cancelAmount));
  if (parent.originalCurrency === 'KRW') return -roundToWon(cancel);
  const original = absScaled(toScaled(parent.originalAmount));
  if (original === 0n) return 0;
  if (cancel >= original) return -parent.krwAmount;
  return -roundTo10(BigInt(parent.krwAmount) * cancel, original);
}

/** 부모 순액 = max(0, 부모 원화 + Σ자식 원화) (4-1-4 단계 6) */
export function parentNetKrw(parentKrw: number, childKrws: readonly number[]) {
  return Math.max(
    0,
    childKrws.reduce((sum, k) => sum + k, parentKrw),
  );
}

/** 기간 판정: startAt ≤ occurredAt ≤ autoEndAt (KST 경계, 미결 Q-11) */
export function isWithinTrip(
  occurredAt: Date,
  trip: { startAt: Date; autoEndAt: Date },
): boolean {
  return occurredAt >= trip.startAt && occurredAt <= trip.autoEndAt;
}

// ─── 4-1-3 동일 사용자 중복 제거 ───

export interface DedupeTx {
  id: string;
  kind: 'APPROVAL' | 'CANCEL';
  occurredAt: Date;
  originalAmount: string;
  originalCurrency: string;
  providerKrwAmount: number | null;
  methodType: 'ACCOUNT' | 'CARD';
  /** 결제수단의 externalRef */
  methodRef: string;
  /** 카드면 출금 계좌의 externalRef */
  linkedAccountRef: string | null;
  sameUserDuplicateOfId: string | null;
}

/** 이 거래의 원화: 원화 거래면 금액, 아니면 제공자가 준 원화 */
function krwOf(tx: DedupeTx): number | null {
  if (tx.originalCurrency === 'KRW') {
    return roundToWon(absScaled(toScaled(tx.originalAmount)));
  }
  return tx.providerKrwAmount === null ? null : Math.abs(tx.providerKrwAmount);
}

/**
 * 연결 계좌의 출금 ↔ 그 계좌에 연결된 체크카드 승인이 같은 원화·±2분이면 같은 결제다.
 * 카드 거래를 원본으로 두고 계좌 거래에 표시한다(카드 쪽이 가맹점·원통화 정보가 풍부).
 * 카드에 연결 계좌 정보가 없으면 묶지 않는다(잘못 합치는 것보다 낫다, 미결 Q-31).
 * @returns 새로 표시할 쌍(계좌 거래 → 카드 거래). 이미 표시된 거래와 카드 하나당 계좌 하나만
 */
export function findSameUserDuplicates(
  txs: readonly DedupeTx[],
): { accountTxId: string; cardTxId: string }[] {
  const cards = txs.filter(
    (t) =>
      t.methodType === 'CARD' && t.kind === 'APPROVAL' && t.linkedAccountRef,
  );
  const usedCards = new Set(
    txs.flatMap((t) =>
      t.sameUserDuplicateOfId ? [t.sameUserDuplicateOfId] : [],
    ),
  );
  const pairs: { accountTxId: string; cardTxId: string }[] = [];
  const accounts = txs
    .filter(
      (t) =>
        t.methodType === 'ACCOUNT' &&
        t.kind === 'APPROVAL' &&
        !t.sameUserDuplicateOfId,
    )
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  for (const account of accounts) {
    const amount = krwOf(account);
    if (amount === null) continue;
    const match = cards
      .filter(
        (c) =>
          !usedCards.has(c.id) &&
          c.linkedAccountRef === account.methodRef &&
          krwOf(c) === amount &&
          Math.abs(c.occurredAt.getTime() - account.occurredAt.getTime()) <=
            NEAR_WINDOW_MS,
      )
      .sort(
        (a, b) =>
          Math.abs(a.occurredAt.getTime() - account.occurredAt.getTime()) -
          Math.abs(b.occurredAt.getTime() - account.occurredAt.getTime()),
      )[0];
    if (match) {
      usedCards.add(match.id);
      pairs.push({ accountTxId: account.id, cardTxId: match.id });
    }
  }
  return pairs;
}

// ─── 4-1-4 취소·환불 매칭 ───

export interface MatchTx {
  id: string;
  paymentMethodId: string;
  externalRef: string;
  kind: 'APPROVAL' | 'CANCEL';
  occurredAt: Date;
  merchantKey: string;
  originalAmount: string;
  originalCurrency: string;
  providerApprovalRef: string | null;
}

/**
 * 취소 거래가 가리키는 원 결제를 찾는다.
 * 1) 확정: providerApprovalRef = 원 승인 externalRef
 * 2) 추정: 같은 결제수단·가맹점 키·통화, 원 결제가 먼저, |취소| ≤ 원 금액 − 이미 매칭된 취소 합.
 *    후보가 여럿이면 금액이 정확히 같은 것 → 가장 최근 것
 * @param matchedAbs 원 결제 ID → 이미 매칭된 취소 금액 합(소수 4자리 정수, 양수)
 */
export function matchCancel(
  cancel: MatchTx,
  approvals: readonly MatchTx[],
  matchedAbs: ReadonlyMap<string, bigint> = new Map(),
): string | null {
  const pool = approvals.filter(
    (a) => a.kind === 'APPROVAL' && a.id !== cancel.id,
  );
  if (cancel.providerApprovalRef) {
    const exact = pool.filter(
      (a) => a.externalRef === cancel.providerApprovalRef,
    );
    const sameMethod = exact.find(
      (a) => a.paymentMethodId === cancel.paymentMethodId,
    );
    if (sameMethod ?? exact[0]) return (sameMethod ?? exact[0]).id;
  }
  const amount = absScaled(toScaled(cancel.originalAmount));
  const candidates = pool.filter((a) => {
    if (
      a.paymentMethodId !== cancel.paymentMethodId ||
      a.merchantKey !== cancel.merchantKey ||
      a.originalCurrency !== cancel.originalCurrency ||
      a.occurredAt >= cancel.occurredAt
    ) {
      return false;
    }
    const remaining =
      absScaled(toScaled(a.originalAmount)) - (matchedAbs.get(a.id) ?? 0n);
    return amount <= remaining;
  });
  candidates.sort((a, b) => {
    const exactA = absScaled(toScaled(a.originalAmount)) === amount ? 1 : 0;
    const exactB = absScaled(toScaled(b.originalAmount)) === amount ? 1 : 0;
    if (exactA !== exactB) return exactB - exactA;
    return b.occurredAt.getTime() - a.occurredAt.getTime();
  });
  return candidates[0]?.id ?? null;
}
