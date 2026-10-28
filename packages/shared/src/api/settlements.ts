import type { ExpenseListItem, MemberSummary } from '../api.js';
import type { BudgetState, FxPolicy } from '../domain.js';

// 현황·정산 응답(기능명세 4-4·4-6·4-9, 5-6·5-7, 6-3 "현황·정산"). 원화는 모두 정수(원).

/** 정산 방향. 순잔액 > 0 받을 돈 · < 0 보낼 돈 · 0 */
export type SettlementDirection = 'RECEIVE' | 'SEND' | 'EVEN';

/** GET /api/trips/:tripId/summary (FR-601~604). 진행 중 즉석 계산, 저장하지 않는다 */
export interface TripSummary {
  /** 계산 시각(ISO 8601 KST) */
  asOf: string;
  me: {
    membershipId: string;
    /** 내 공동 결제 합 − 내 부담 합(현재 SHARED 기준). + 받을 돈 / − 낼 돈 */
    netKrw: number;
    /** "내가 낼 금액" = max(0, −netKrw) */
    toPayKrw: number;
    /** "내가 받을 금액" = max(0, netKrw). 0보다 크면 라벨을 바꾼다(제안) */
    toReceiveKrw: number;
  };
  /** 공동 지출 = Σ SHARED 결제 순액. 개인·미확정은 넣지 않는다 */
  sharedTotalKrw: number;
  budgetKrw: number;
  /** sharedTotal / budget, 소수 넷째 자리 반올림(표시용). 상태 판정은 budgetState를 쓴다 */
  budgetRatio: number;
  /** < 80% NORMAL · 80~100% CAUTION · > 100% OVER */
  budgetState: BudgetState;
  /** max(0, sharedTotal − budget). "초과 ₩84,500" */
  overBudgetKrw: number;
  mySpending: {
    /** 내 부담 합 + 내 개인 결제 순액 합(미확정 제외) */
    totalKrw: number;
    sharedBurdenKrw: number;
    personalKrw: number;
    /** round(부담 / 내 지출 × 100). 내 지출이 0이면 null(바 비움·범례 숨김) */
    sharedPct: number | null;
    /** 100 − sharedPct. 내 지출이 0이면 null */
    personalPct: number | null;
  };
  /** 멤버별 부담. 활성 멤버 + 공동 결제에 관여한 나간 멤버. 정렬: 나 → 가입 순 */
  burdens: TripSummaryBurden[];
}

export interface TripSummaryBurden {
  member: MemberSummary;
  burdenKrw: number;
}

/** 정산 멤버 행(FR-702·705) */
export interface SettlementMemberView {
  /** isLeft는 지금 상태(아바타 흐림). 종료 시점 기준은 아래 isLeft */
  member: MemberSummary;
  /** 공동 결제 합계·건수 */
  paidKrw: number;
  paidCount: number;
  /** 최종 부담 */
  burdenKrw: number;
  /** paid − burden. + 받을 돈 / − 보낼 돈 */
  netKrw: number;
  direction: SettlementDirection;
  /** 종료 시점에 나간 멤버였는지(WF-44 "나간 멤버") */
  isLeft: boolean;
}

/** 송금 권장안(FR-704). 참고 데이터, MVP 화면에는 그리지 않는다 */
export interface SettlementTransferView {
  seq: number;
  from: MemberSummary;
  to: MemberSummary;
  amountKrw: number;
}

/** GET /api/trips/:tripId/settlement (FR-702·704·705). 종료 시 고정한 스냅샷 */
export interface SettlementView {
  settlementId: string;
  /** 정산 확정 시각 = 여정 종료 시각(ISO 8601 KST) */
  settledAt: string;
  fxPolicy: FxPolicy;
  algorithmVersion: string;
  /** 총 공동 지출 */
  totalSharedKrw: number;
  /** 공동 결제 건수(환불 묶음은 1건) */
  sharedCount: number;
  /** 정산 대상 인원 N */
  memberCount: number;
  /** N빵 1인 = round(total / N), 참고용 */
  perCapitaKrw: number;
  /** 정렬: 나 → 가입 순 */
  members: SettlementMemberView[];
  transfers: SettlementTransferView[];
}

/** GET /api/trips/:tripId/settlement/members/:membershipId/expenses (FR-703) */
export interface SettlementMemberExpenses extends SettlementMemberView {
  /** 그 멤버가 결제한 공동 결제. occurredAt 오름차순(여행 순서) */
  sharedPayments: ExpenseListItem[];
  /** 개인 결제 건수. 남에게는 이것만 보인다("개인 결제 n건 · 비공개") */
  personalCount: number;
  /** 본인 행을 열었을 때만 목록, 남이면 null(가맹점·금액·날짜 모두 응답에 없음) */
  personalPayments: ExpenseListItem[] | null;
}

/** POST /api/internal/jobs/settlements (종료됐는데 정산이 없는 여정 복구) */
export interface SettlementSweepResult {
  checked: number;
  created: number;
  failed: number;
}

/** POST …/settlement/recompute, POST /api/internal/jobs/settlements/recompute */
export interface SettlementRecomputeResult {
  tripId: string;
  settlementId: string;
  /** 기존 스냅샷을 지우고 다시 만들었는지(없었으면 false) */
  replaced: boolean;
}
