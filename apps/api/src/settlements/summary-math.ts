import type { BudgetState } from '@yeojeong/shared';
import { divRoundHalfUp } from './compute.js';

// 현황 지표 계산식(기능명세 4-6·4-9, FR-601~604). 정수로만 비교하고 비율은 표시용으로만 만든다.

/**
 * 예산 상태. ratio = spent / budget: < 0.8 NORMAL · 0.8 ~ 1.0 CAUTION(경계 포함) · > 1.0 OVER.
 * 부동소수점 비교를 피하려고 spent × 10 < budget × 8처럼 정수로 비교한다.
 */
export function budgetState(spentKrw: number, budgetKrw: number): BudgetState {
  if (budgetKrw <= 0) return spentKrw > 0 ? 'OVER' : 'NORMAL';
  if (spentKrw * 10 < budgetKrw * 8) return 'NORMAL';
  if (spentKrw <= budgetKrw) return 'CAUTION';
  return 'OVER';
}

/** spent / budget, 소수 넷째 자리 반올림. 0.29399… → 0.294 */
export function budgetRatio(spentKrw: number, budgetKrw: number): number {
  if (budgetKrw <= 0) return 0;
  return divRoundHalfUp(spentKrw * 10_000, budgetKrw) / 10_000;
}

/** "초과 ₩84,500" */
export function overBudget(spentKrw: number, budgetKrw: number): number {
  return Math.max(0, spentKrw - budgetKrw);
}

/** 내가 낼 금액 = |net|(net < 0), 내가 받을 금액 = net(net > 0) */
export function toPayReceive(netKrw: number) {
  return {
    toPayKrw: netKrw < 0 ? -netKrw : 0,
    toReceiveKrw: netKrw > 0 ? netKrw : 0,
  };
}

/**
 * 내 지출 = 부담 + 개인. 공동% = round(부담 / 내 지출 × 100), 개인% = 100 − 공동%.
 * 내 지출이 0이면 비율은 null(바 비움·범례 숨김, FR-603 수락 기준 2).
 */
export function spendingSplit(sharedBurdenKrw: number, personalKrw: number) {
  const totalKrw = sharedBurdenKrw + personalKrw;
  if (totalKrw <= 0) {
    return { totalKrw, sharedPct: null, personalPct: null };
  }
  const sharedPct = divRoundHalfUp(sharedBurdenKrw * 100, totalKrw);
  return { totalKrw, sharedPct, personalPct: 100 - sharedPct };
}
