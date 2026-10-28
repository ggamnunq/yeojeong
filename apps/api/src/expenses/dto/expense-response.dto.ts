import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EDIT_BLOCK_REASON_VALUES,
  EXPENSE_ORIGIN_VALUES,
  EXPENSE_STATUS_VALUES,
  FX_POLICY_VALUES,
  MEMBER_ROLE_VALUES,
  TRIP_STATUS_VALUES,
  type AddOutOfPeriodExpensesResponse,
  type EditBlockReason,
  type ExpenseDetailResponse,
  type ExpenseFxSnapshot,
  type ExpenseListPeriod,
  type ExpenseListResponse,
  type ExpenseOrigin,
  type ExpensePermissions,
  type ExpenseRefundLine,
  type ExpenseRow,
  type ExpenseStatus,
  type FxPolicy,
  type MemberRole,
  type MemberSummary,
  type OutOfPeriodCandidate,
  type TripStatus,
} from '@yeojeong/shared';

// Swagger 문서용 응답 스키마. 실제 타입은 @yeojeong/shared(api.ts, api/expenses.ts)에 있다.
// 이름이 다른 모듈의 DTO와 겹치지 않게 Expense 접두사를 붙인다.

export class ExpenseMemberDto implements MemberSummary {
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

  @ApiProperty({ description: '나간 멤버(프사 35% + "나간 멤버" 태그)' })
  isLeft: boolean;
}

export class ExpenseFlagsDto {
  @ApiProperty({
    description:
      '변경됨. 공동 + changedAfterShared, 결제자가 아닌 사람에게만 true',
  })
  changed: boolean;

  @ApiProperty({ description: '중복 의심(공동끼리, 표시 해제 전)' })
  duplicateSuspected: boolean;

  @ApiProperty({ description: '환불 묶음' })
  hasRefund: boolean;
}

export class ExpenseRefundLineDto implements ExpenseRefundLine {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-11-13T12:15:00+09:00' })
  occurredAt: string;

  @ApiProperty({ example: -121330 })
  krwAmount: number;

  @ApiProperty({ example: '-13200' })
  originalAmount: string;
}

export class ExpenseRowDto implements ExpenseRow {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-11-13T18:20:00+09:00' })
  occurredAt: string;

  @ApiProperty({
    example: '2026-11-13',
    description: 'KST 날짜(날짜 헤더 그룹 키)',
  })
  localDate: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2,
    description: '기간 밖이면 null',
  })
  dayIndex: number | null;

  @ApiProperty({
    enum: ['BEFORE', 'AFTER'],
    nullable: true,
    description: '여정 전/후. 기간 안이면 null',
  })
  periodSide: 'BEFORE' | 'AFTER' | null;

  @ApiProperty({ example: '551 호라이 난바본점' })
  merchantName: string;

  @ApiProperty({ type: ExpenseMemberDto })
  payer: ExpenseMemberDto;

  @ApiProperty({
    enum: EXPENSE_STATUS_VALUES,
    description: '종료된 여정의 미확정은 PERSONAL로 온다',
  })
  status: ExpenseStatus;

  @ApiProperty({ example: 25740, description: '순액(환불 반영)' })
  krwAmount: number;

  @ApiProperty({ example: 25740, description: '환불 전 원 결제 원화' })
  grossKrwAmount: number;

  @ApiProperty({ example: '2800' })
  originalAmount: string;

  @ApiProperty({
    example: '2800',
    description: '환불 반영 원통화 순액(0 이상)',
  })
  netOriginalAmount: string;

  @ApiProperty({ example: 'JPY' })
  originalCurrency: string;

  @ApiProperty({
    type: [ExpenseMemberDto],
    nullable: true,
    description: 'SHARED만. 정렬: 나 → 가입 순',
  })
  participants: ExpenseMemberDto[] | null;

  @ApiProperty({ type: ExpenseFlagsDto })
  flags: ExpenseFlagsDto;

  @ApiProperty({ type: [ExpenseRefundLineDto] })
  refunds: ExpenseRefundLineDto[];

  @ApiProperty({ enum: EXPENSE_ORIGIN_VALUES })
  origin: ExpenseOrigin;

  @ApiProperty({ description: '분류·중복 해제 요청에 그대로 보낸다' })
  version: number;
}

export class ExpenseListPeriodDto implements ExpenseListPeriod {
  @ApiProperty({ enum: TRIP_STATUS_VALUES })
  tripStatus: TripStatus;

  @ApiProperty({ example: '2026-11-12' })
  startDate: string;

  @ApiProperty({ example: '2026-11-15' })
  endDate: string;

  @ApiProperty({ example: 4 })
  days: number;

  @ApiProperty({ type: Number, nullable: true, example: 2 })
  todayDayIndex: number | null;
}

export class ExpenseListResponseDto implements ExpenseListResponse {
  @ApiProperty({ type: [ExpenseRowDto] })
  items: ExpenseRowDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;

  @ApiProperty({ example: 2, description: '확인 필요 n건(내 미확정)' })
  pendingCount: number;

  @ApiProperty({ description: '진행 중이면 "기간 외 결제 추가 ›"' })
  showOutOfPeriodEntry: boolean;

  @ApiProperty({ type: ExpenseListPeriodDto })
  period: ExpenseListPeriodDto;
}

export class ExpenseFxDto implements ExpenseFxSnapshot {
  @ApiProperty({ example: '9.192', description: '1단위당 원' })
  rate: string;

  @ApiProperty({ example: 100 })
  displayUnit: number;

  @ApiProperty({ example: '하나은행 매매기준율' })
  source: string;

  @ApiProperty({ example: '2026-11-13T18:00:00+09:00' })
  rateAt: string;

  @ApiProperty({ enum: FX_POLICY_VALUES })
  policy: FxPolicy;
}

export class ExpenseShareDto {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({ example: 6574 })
  amountKrw: number;

  @ApiProperty()
  isRemainderHolder: boolean;
}

export class ExpensePermissionsDto implements ExpensePermissions {
  @ApiProperty()
  canEdit: boolean;

  @ApiProperty({
    enum: EDIT_BLOCK_REASON_VALUES,
    nullable: true,
    description: 'TRIP_ENDED → LOCKED, PAYER_LEFT·NOT_PAYER → READ_ONLY',
  })
  reason: EditBlockReason | null;

  @ApiProperty()
  isPayer: boolean;
}

export class ExpenseDuplicateDto {
  @ApiProperty({ format: 'uuid' })
  groupId: string;

  @ApiProperty({ description: '결제자 · 진행 중이면 "표시 해제"' })
  canDismiss: boolean;
}

export class ExpenseDetailResponseDto
  extends ExpenseRowDto
  implements ExpenseDetailResponse
{
  @ApiProperty({
    type: String,
    nullable: true,
    example: '토스뱅크 체크카드 1934',
    description: '결제자에게만',
  })
  paymentMethodLabel: string | null;

  @ApiProperty({
    type: ExpenseFxDto,
    nullable: true,
    description: 'KRW 결제면 null',
  })
  fx: ExpenseFxDto | null;

  @ApiProperty({
    type: [ExpenseShareDto],
    description: 'SHARED만. 정렬: 나 → 가입 순',
  })
  shares: ExpenseShareDto[];

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 6572,
    description: '1인 = floor(순액 / n). SHARED가 아니면 null',
  })
  perPersonKrw: number | null;

  @ApiProperty({ example: 2, description: '원 단위 나머지("결제자 +2원")' })
  remainderKrw: number;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  remainderHolderMembershipId: string | null;

  @ApiProperty({ type: ExpensePermissionsDto })
  permissions: ExpensePermissionsDto;

  @ApiProperty({ type: ExpenseDuplicateDto, nullable: true })
  duplicate: ExpenseDuplicateDto | null;

  @ApiProperty({
    type: [ExpenseMemberDto],
    nullable: true,
    description:
      '부담 인원 토글(canEdit일 때만). 활성 멤버 + 지금 부담 인원의 나간 멤버(해제만)',
  })
  participantCandidates: ExpenseMemberDto[] | null;

  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    description:
      '토글 처음 선택값(canEdit일 때만). SHARED = 지금 부담 인원, 그 밖 = 활성 멤버 전원',
  })
  defaultParticipantMembershipIds: string[] | null;
}

export class OutOfPeriodCandidateDto implements OutOfPeriodCandidate {
  @ApiProperty({
    description: '5분 동안 유효한 서명된 임시 식별자',
    example: 'eyJ1IjoiLi4uIn0.0123456789abcdef...',
  })
  candidateId: string;

  @ApiProperty({ example: '2026-10-20T21:10:00+09:00' })
  occurredAt: string;

  @ApiProperty({ example: '2026-10-20' })
  localDate: string;

  @ApiProperty({ example: '아고다 · 오리엔탈 익스프레스 난바' })
  merchantName: string;

  @ApiProperty({ type: Number, nullable: true, example: 486000 })
  krwAmount: number | null;

  @ApiProperty({ example: '486000' })
  originalAmount: string;

  @ApiProperty({ example: 'KRW' })
  currency: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '토스뱅크 체크카드 1934',
  })
  paymentMethodLabel: string | null;
}

export class AddOutOfPeriodExpensesResponseDto implements AddOutOfPeriodExpensesResponse {
  @ApiProperty({ example: 2 })
  added: number;

  @ApiProperty({ type: [ExpenseRowDto] })
  items: ExpenseRowDto[];
}
