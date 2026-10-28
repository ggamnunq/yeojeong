import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CLASSIFY_STATUS_VALUES,
  EXPENSE_LIST_LIMIT,
  EXPENSE_LIST_ORDER_VALUES,
  EXPENSE_STATUS_VALUES,
  OUT_OF_PERIOD_ADD_MAX,
  OUT_OF_PERIOD_SIDE_VALUES,
  type AddOutOfPeriodExpensesRequest,
  type ClassifyExpenseRequest,
  type ClassifyStatus,
  type DismissDuplicateRequest,
  type ExpenseListOrder,
  type ExpenseListQuery,
  type ExpenseStatus,
  type OutOfPeriodSide,
} from '@yeojeong/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListExpensesQueryDto implements ExpenseListQuery {
  @ApiPropertyOptional({ description: '이전 응답의 nextCursor' })
  @IsOptional()
  @IsString({ message: '목록 위치가 올바르지 않아요' })
  @MaxLength(200, { message: '목록 위치가 올바르지 않아요' })
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: EXPENSE_LIST_LIMIT.MAX,
    default: EXPENSE_LIST_LIMIT.DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '개수는 정수여야 해요' })
  @Min(1, { message: '1개 이상이어야 해요' })
  @Max(EXPENSE_LIST_LIMIT.MAX, {
    message: `${EXPENSE_LIST_LIMIT.MAX}개까지 볼 수 있어요`,
  })
  limit?: number;

  @ApiPropertyOptional({
    enum: EXPENSE_STATUS_VALUES,
    description: 'PENDING = 확인 필요(내 미확정)만',
  })
  @IsOptional()
  @IsIn(EXPENSE_STATUS_VALUES, { message: '결제 상태가 올바르지 않아요' })
  status?: ExpenseStatus;

  @ApiPropertyOptional({ minimum: 1, description: '타임라인 Day N' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Day는 정수여야 해요' })
  @Min(1, { message: 'Day는 1부터예요' })
  @Max(366, { message: 'Day가 너무 커요' })
  day?: number;

  @ApiPropertyOptional({ enum: EXPENSE_LIST_ORDER_VALUES, default: 'desc' })
  @IsOptional()
  @IsIn(EXPENSE_LIST_ORDER_VALUES, { message: '정렬은 desc 또는 asc예요' })
  order?: ExpenseListOrder;
}

export class ClassifyExpenseDto implements ClassifyExpenseRequest {
  @ApiProperty({ enum: CLASSIFY_STATUS_VALUES })
  @IsIn(CLASSIFY_STATUS_VALUES, { message: '개인 또는 공동을 골라 주세요' })
  status: ClassifyStatus;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'SHARED일 때 부담 인원 membershipId. 생략하면 미확정·개인 → 공동은 활성 멤버 전원, 공동 → 공동은 그대로. 빈 배열이면 400 PARTICIPANTS_REQUIRED',
  })
  @IsOptional()
  @IsArray({ message: '부담 인원 형식이 올바르지 않아요' })
  @ArrayMaxSize(100, { message: '부담 인원이 너무 많아요' })
  @ArrayUnique({ message: '같은 사람이 두 번 들어 있어요' })
  @IsUUID('all', { each: true, message: '부담 인원 형식이 올바르지 않아요' })
  participantMembershipIds?: string[];

  @ApiProperty({ minimum: 0, description: '마지막으로 받은 결제의 version' })
  @IsInt({ message: 'version은 정수여야 해요' })
  @Min(0, { message: 'version은 0 이상이어야 해요' })
  version: number;

  @ApiPropertyOptional({
    description: '공동 → 개인 확인 다이얼로그(WF-32)를 거쳤으면 true',
  })
  @IsOptional()
  @IsBoolean({ message: '확인 값은 true 또는 false예요' })
  confirmSharedToPersonal?: boolean;
}

export class DismissDuplicateDto implements DismissDuplicateRequest {
  @ApiProperty({ minimum: 0 })
  @IsInt({ message: 'version은 정수여야 해요' })
  @Min(0, { message: 'version은 0 이상이어야 해요' })
  version: number;
}

export class OutOfPeriodCandidatesQueryDto {
  @ApiPropertyOptional({ enum: OUT_OF_PERIOD_SIDE_VALUES, default: 'BEFORE' })
  @IsOptional()
  @IsIn(OUT_OF_PERIOD_SIDE_VALUES, { message: '여정 전 또는 여정 후예요' })
  side?: OutOfPeriodSide;
}

export class AddOutOfPeriodExpensesDto implements AddOutOfPeriodExpensesRequest {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: OUT_OF_PERIOD_ADD_MAX,
  })
  @IsArray({ message: '추가할 결제를 골라 주세요' })
  @ArrayMinSize(1, { message: '추가할 결제를 골라 주세요' })
  @ArrayMaxSize(OUT_OF_PERIOD_ADD_MAX, {
    message: `한 번에 ${OUT_OF_PERIOD_ADD_MAX}건까지 추가할 수 있어요`,
  })
  @ArrayUnique({ message: '같은 결제가 두 번 들어 있어요' })
  @IsUUID('all', { each: true, message: '결제 형식이 올바르지 않아요' })
  candidateIds: string[];
}
