import type { SettlementDirection } from '@yeojeong/shared';

// 정산 알고리즘(기능명세 4-4, FR-701·704·705). 순수·결정적 함수이고 정수(원)로만 계산한다.
// 현황(즉석 계산), 종료 정산 스냅샷, 종료 미리보기(trips end-preview)가 모두 이 함수를 쓴다.

export const SETTLEMENT_ALGORITHM_VERSION = 'v1';

export interface SettlementMemberInput {
  membershipId: string;
  /** 동률 정렬 기준 */
  joinOrder: number;
  /** 기준 시점(진행 중 = 지금, 종료 = 종료 시각)에 나간 멤버인지 */
  isLeft: boolean;
  /** 개인 결제 건수(스냅샷용, 계산에는 쓰지 않는다) */
  personalCount?: number;
}

/** SHARED 부모 결제 한 건 */
export interface SettlementExpenseInput {
  payerMembershipId: string;
  /** 순액(환불 반영, ≥ 0) */
  netKrw: number;
  /** 부담 인원 몫(나머지 포함). Σ amountKrw = netKrw(I-4) */
  shares: readonly { membershipId: string; amountKrw: number }[];
}

export interface SettlementInput {
  /** 그룹의 모든 멤버십(나간 멤버 포함). 결제·부담에 없는 나간 멤버는 결과에서 빠진다 */
  members: readonly SettlementMemberInput[];
  sharedExpenses: readonly SettlementExpenseInput[];
}

export interface SettlementMemberResult {
  membershipId: string;
  joinOrder: number;
  isLeft: boolean;
  paidKrw: number;
  paidCount: number;
  burdenKrw: number;
  /** paid − burden. + 받을 돈 / − 보낼 돈 */
  netKrw: number;
  personalCount: number;
}

export interface SettlementTransferResult {
  /** 1부터 */
  seq: number;
  fromMembershipId: string;
  toMembershipId: string;
  amountKrw: number;
}

export interface SettlementResult {
  totalSharedKrw: number;
  /** 공동 결제 건수(환불 묶음 = 1건, 순액 0원 포함) */
  sharedCount: number;
  /** 정산 대상 인원 N = |M| */
  memberCount: number;
  /** N빵 1인 = round_half_up(total / N). N = 0이면 0 */
  perCapitaKrw: number;
  /** M = 활성 멤버 ∪ 결제자·부담 인원인 나간 멤버. 가입 순 */
  members: SettlementMemberResult[];
  /** 송금 권장안(그리디, 최대 N−1건) */
  transfers: SettlementTransferResult[];
}

/** Σ netKrw ≠ 0. 종료 트랜잭션은 이 예외로 롤백한다(I-7, FR-701 수락 기준 2) */
export class SettlementImbalanceError extends Error {
  constructor(readonly imbalanceKrw: number) {
    super(`정산 검산 실패: 순잔액 합이 ${imbalanceKrw}원입니다`);
    this.name = 'SettlementImbalanceError';
  }
}

function assertKrw(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label}은(는) 0 이상의 정수여야 합니다: ${value}`);
  }
}

/** 0 이상 정수 나눗셈 반올림(half-up). round_half_up(206727.5) = 206728 */
export function divRoundHalfUp(numer: number, denom: number): number {
  if (!Number.isSafeInteger(numer) || numer < 0) {
    throw new RangeError('numer는 0 이상의 정수여야 합니다');
  }
  if (!Number.isSafeInteger(denom) || denom <= 0) {
    throw new RangeError('denom은 양의 정수여야 합니다');
  }
  return Math.floor((numer * 2 + denom) / (denom * 2));
}

export function settlementDirection(netKrw: number): SettlementDirection {
  if (netKrw > 0) return 'RECEIVE';
  if (netKrw < 0) return 'SEND';
  return 'EVEN';
}

/**
 * 송금 권장안(기능명세 4-4). 채권자는 순잔액 내림차순, 채무자는 |순잔액| 내림차순, 동률은 가입 순.
 * 앞에서부터 min(채권, |채무|)만큼 보내고 0이 된 쪽을 뺀다(다시 정렬하지 않는다). 횟수 최소는 보장하지 않는다.
 */
export function greedyTransfers(
  members: readonly Pick<
    SettlementMemberResult,
    'membershipId' | 'joinOrder' | 'netKrw'
  >[],
): SettlementTransferResult[] {
  const byJoin = (a: { joinOrder: number }, b: { joinOrder: number }) =>
    a.joinOrder - b.joinOrder;
  const creditors = members
    .filter((m) => m.netKrw > 0)
    .map((m) => ({ ...m, left: m.netKrw }))
    .sort((a, b) => b.left - a.left || byJoin(a, b));
  const debtors = members
    .filter((m) => m.netKrw < 0)
    .map((m) => ({ ...m, left: -m.netKrw }))
    .sort((a, b) => b.left - a.left || byJoin(a, b));

  const transfers: SettlementTransferResult[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0];
    const debtor = debtors[0];
    const amount = Math.min(creditor.left, debtor.left);
    transfers.push({
      seq: transfers.length + 1,
      fromMembershipId: debtor.membershipId,
      toMembershipId: creditor.membershipId,
      amountKrw: amount,
    });
    creditor.left -= amount;
    debtor.left -= amount;
    if (creditor.left === 0) creditors.shift();
    if (debtor.left === 0) debtors.shift();
  }
  return transfers;
}

/**
 * 정산 계산(기능명세 4-4).
 * paid(m) = Σ 결제 순액(결제자 = m), burden(m) = Σ 부담 몫(부담 인원 = m), net = paid − burden.
 * @param options.assertBalanced false면 검산 실패를 예외로 던지지 않는다(현황 화면용). 스냅샷은 기본값(true)으로 부른다.
 * @throws SettlementImbalanceError Σ net ≠ 0
 * @throws RangeError 금액이 음수·비정수이거나 멤버 목록에 없는 멤버십이 나올 때
 */
export function computeSettlement(
  input: SettlementInput,
  options: { assertBalanced?: boolean } = {},
): SettlementResult {
  const ledger = new Map(
    input.members.map((m) => [
      m.membershipId,
      {
        member: m,
        paidKrw: 0,
        paidCount: 0,
        burdenKrw: 0,
        involved: false,
      },
    ]),
  );
  const entry = (membershipId: string) => {
    const found = ledger.get(membershipId);
    if (!found) {
      throw new RangeError(`멤버 목록에 없는 멤버십: ${membershipId}`);
    }
    return found;
  };

  let totalSharedKrw = 0;
  for (const expense of input.sharedExpenses) {
    assertKrw(expense.netKrw, '결제 순액');
    const payer = entry(expense.payerMembershipId);
    payer.paidKrw += expense.netKrw;
    payer.paidCount += 1;
    payer.involved = true;
    totalSharedKrw += expense.netKrw;
    for (const share of expense.shares) {
      assertKrw(share.amountKrw, '부담 몫');
      const holder = entry(share.membershipId);
      holder.burdenKrw += share.amountKrw;
      holder.involved = true;
    }
  }

  const members: SettlementMemberResult[] = [...ledger.values()]
    .filter((row) => !row.member.isLeft || row.involved)
    .sort((a, b) => a.member.joinOrder - b.member.joinOrder)
    .map((row) => ({
      membershipId: row.member.membershipId,
      joinOrder: row.member.joinOrder,
      isLeft: row.member.isLeft,
      paidKrw: row.paidKrw,
      paidCount: row.paidCount,
      burdenKrw: row.burdenKrw,
      netKrw: row.paidKrw - row.burdenKrw,
      personalCount: row.member.personalCount ?? 0,
    }));

  const imbalance = members.reduce((sum, m) => sum + m.netKrw, 0);
  if (imbalance !== 0 && options.assertBalanced !== false) {
    throw new SettlementImbalanceError(imbalance);
  }

  const memberCount = members.length;
  return {
    totalSharedKrw,
    sharedCount: input.sharedExpenses.length,
    memberCount,
    perCapitaKrw:
      memberCount > 0 ? divRoundHalfUp(totalSharedKrw, memberCount) : 0,
    members,
    transfers: imbalance === 0 ? greedyTransfers(members) : [],
  };
}
