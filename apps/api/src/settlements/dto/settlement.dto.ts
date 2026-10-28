import { ApiProperty } from '@nestjs/swagger';
import {
  BUDGET_STATE_VALUES,
  EXPENSE_ORIGIN_VALUES,
  EXPENSE_STATUS_VALUES,
  FX_POLICY_VALUES,
  MEMBER_ROLE_VALUES,
  type BudgetState,
  type ExpenseListItem,
  type ExpenseOrigin,
  type ExpenseStatus,
  type FxPolicy,
  type MemberRole,
  type MemberSummary,
  type SettlementDirection,
  type SettlementMemberExpenses,
  type SettlementMemberView,
  type SettlementRecomputeResult,
  type SettlementSweepResult,
  type SettlementTransferView,
  type SettlementView,
  type TripSummary,
  type TripSummaryBurden,
} from '@yeojeong/shared';
import { IsUUID } from 'class-validator';

// Swagger 문서용 응답 클래스. 다른 모듈 DTO와 스키마 이름이 겹치지 않게 Settlement/Summary 접두사를 붙인다.

const DIRECTIONS: SettlementDirection[] = ['RECEIVE', 'SEND', 'EVEN'];

export class SettlementMemberRefDto implements MemberSummary {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;
  @ApiProperty({ example: '준용', description: '탈퇴했으면 "탈퇴한 멤버"' })
  nickname: string;
  @ApiProperty({ type: String, nullable: true })
  profileImageUrl: string | null;
  @ApiProperty({ enum: MEMBER_ROLE_VALUES })
  role: MemberRole;
  @ApiProperty()
  joinOrder: number;
  @ApiProperty()
  isMe: boolean;
  @ApiProperty({ description: '지금 나가 있는지' })
  isLeft: boolean;
}

class SummaryMeDto {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;
  @ApiProperty({ example: -32080, description: '+ 받을 돈 / − 낼 돈' })
  netKrw: number;
  @ApiProperty({ example: 32080 })
  toPayKrw: number;
  @ApiProperty({ example: 0 })
  toReceiveKrw: number;
}

class SummarySpendingDto {
  @ApiProperty({ example: 174190 })
  totalKrw: number;
  @ApiProperty({ example: 94770 })
  sharedBurdenKrw: number;
  @ApiProperty({ example: 79420 })
  personalKrw: number;
  @ApiProperty({ type: Number, nullable: true, example: 54 })
  sharedPct: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 46 })
  personalPct: number | null;
}

class SummaryBurdenDto implements TripSummaryBurden {
  @ApiProperty({ type: () => SettlementMemberRefDto })
  member: SettlementMemberRefDto;
  @ApiProperty({ example: 94770 })
  burdenKrw: number;
}

export class TripSummaryDto implements TripSummary {
  @ApiProperty({ example: '2026-11-13T18:34:00+09:00' })
  asOf: string;
  @ApiProperty({ type: () => SummaryMeDto })
  me: SummaryMeDto;
  @ApiProperty({ example: 352790 })
  sharedTotalKrw: number;
  @ApiProperty({ example: 1200000 })
  budgetKrw: number;
  @ApiProperty({ example: 0.294 })
  budgetRatio: number;
  @ApiProperty({ enum: BUDGET_STATE_VALUES })
  budgetState: BudgetState;
  @ApiProperty({ example: 0 })
  overBudgetKrw: number;
  @ApiProperty({ type: () => SummarySpendingDto })
  mySpending: SummarySpendingDto;
  @ApiProperty({ type: () => [SummaryBurdenDto] })
  burdens: SummaryBurdenDto[];
}

export class SettlementMemberViewDto implements SettlementMemberView {
  @ApiProperty({ type: () => SettlementMemberRefDto })
  member: SettlementMemberRefDto;
  @ApiProperty({ example: 316390 })
  paidKrw: number;
  @ApiProperty({ example: 4 })
  paidCount: number;
  @ApiProperty({ example: 213300 })
  burdenKrw: number;
  @ApiProperty({ example: 103090 })
  netKrw: number;
  @ApiProperty({ enum: DIRECTIONS })
  direction: SettlementDirection;
  @ApiProperty({ description: '종료 시점에 나간 멤버였는지' })
  isLeft: boolean;
}

class SettlementTransferViewDto implements SettlementTransferView {
  @ApiProperty()
  seq: number;
  @ApiProperty({ type: () => SettlementMemberRefDto })
  from: SettlementMemberRefDto;
  @ApiProperty({ type: () => SettlementMemberRefDto })
  to: SettlementMemberRefDto;
  @ApiProperty({ example: 67795 })
  amountKrw: number;
}

export class SettlementViewDto implements SettlementView {
  @ApiProperty({ format: 'uuid' })
  settlementId: string;
  @ApiProperty({ example: '2026-11-16T10:05:00+09:00' })
  settledAt: string;
  @ApiProperty({ enum: FX_POLICY_VALUES })
  fxPolicy: FxPolicy;
  @ApiProperty({ example: 'v1' })
  algorithmVersion: string;
  @ApiProperty({ example: 826910 })
  totalSharedKrw: number;
  @ApiProperty({ example: 11 })
  sharedCount: number;
  @ApiProperty({ example: 4 })
  memberCount: number;
  @ApiProperty({ example: 206728 })
  perCapitaKrw: number;
  @ApiProperty({ type: () => [SettlementMemberViewDto] })
  members: SettlementMemberViewDto[];
  @ApiProperty({
    type: () => [SettlementTransferViewDto],
    description: '송금 권장안(참고용, 화면 미노출)',
  })
  transfers: SettlementTransferViewDto[];
}

class SettlementExpenseFlagsDto {
  @ApiProperty()
  changed: boolean;
  @ApiProperty()
  duplicateSuspected: boolean;
  @ApiProperty()
  hasRefund: boolean;
}

class SettlementExpenseRefundDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty()
  occurredAt: string;
  @ApiProperty({ example: -3000 })
  krwAmount: number;
}

export class SettlementExpenseItemDto implements ExpenseListItem {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ example: '2026-11-12T11:20:00+09:00' })
  occurredAt: string;
  @ApiProperty({ example: '2026-11-12' })
  localDate: string;
  @ApiProperty({ type: Number, nullable: true })
  dayIndex: number | null;
  @ApiProperty({ enum: ['BEFORE', 'AFTER'], nullable: true })
  periodSide: 'BEFORE' | 'AFTER' | null;
  @ApiProperty()
  merchantName: string;
  @ApiProperty({ type: () => SettlementMemberRefDto })
  payer: SettlementMemberRefDto;
  @ApiProperty({ enum: EXPENSE_STATUS_VALUES })
  status: ExpenseStatus;
  @ApiProperty({ description: '순액(환불 반영)' })
  krwAmount: number;
  @ApiProperty({ example: '5960' })
  originalAmount: string;
  @ApiProperty({ example: 'JPY' })
  originalCurrency: string;
  @ApiProperty({ type: () => [SettlementMemberRefDto], nullable: true })
  participants: SettlementMemberRefDto[] | null;
  @ApiProperty({ type: () => SettlementExpenseFlagsDto })
  flags: SettlementExpenseFlagsDto;
  @ApiProperty({ type: () => [SettlementExpenseRefundDto] })
  refunds: SettlementExpenseRefundDto[];
  @ApiProperty({ enum: EXPENSE_ORIGIN_VALUES })
  origin: ExpenseOrigin;
  @ApiProperty()
  version: number;
}

export class SettlementMemberExpensesDto
  extends SettlementMemberViewDto
  implements SettlementMemberExpenses
{
  @ApiProperty({ type: () => [SettlementExpenseItemDto] })
  sharedPayments: SettlementExpenseItemDto[];
  @ApiProperty({ example: 3 })
  personalCount: number;
  @ApiProperty({
    type: () => [SettlementExpenseItemDto],
    nullable: true,
    description: '본인을 열었을 때만, 남이면 null',
  })
  personalPayments: SettlementExpenseItemDto[] | null;
}

export class RecomputeSettlementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: '여정 ID를 확인해 주세요' })
  tripId: string;
}

export class SettlementRecomputeResultDto implements SettlementRecomputeResult {
  @ApiProperty({ format: 'uuid' })
  tripId: string;
  @ApiProperty({ format: 'uuid' })
  settlementId: string;
  @ApiProperty()
  replaced: boolean;
}

export class SettlementSweepResultDto implements SettlementSweepResult {
  @ApiProperty()
  checked: number;
  @ApiProperty()
  created: number;
  @ApiProperty()
  failed: number;
}
