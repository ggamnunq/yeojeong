import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MANUAL_MEMO_MAX_LENGTH,
  type CreateTripExpenseRequest,
  type UpdateTripExpenseRequest,
} from '@yeojeong/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORTED_CURRENCY_CODES } from '../../fx/currencies.js';

// 직접 입력 결제(S7) 요청. 금액의 통화별 소수 자리·원화 상한·시각 범위는 서비스가 본다(manual-input.ts).

/** 내용 원문 크기 상한(정리 전). 정리 뒤 40자(MANUAL_MEMO_MAX_LENGTH)는 서비스가 본다 */
export const MEMO_RAW_MAX_LENGTH = 200;

export const AMOUNT_PATTERN = /^\s*\d{1,12}(\.\d{1,4})?\s*$/;

export const AmountProperty = () =>
  ApiProperty({
    example: '13200',
    description:
      '양수 decimal 문자열. 소수 자리는 통화 기준(KRW·JPY·VND·IDR 0, 그 밖 2), 원화 환산 10억 원까지',
  });

export class CreateTripExpenseDto implements CreateTripExpenseRequest {
  @AmountProperty()
  @IsString({ message: '금액을 입력해 주세요' })
  @Matches(AMOUNT_PATTERN, { message: '금액을 다시 확인해 주세요' })
  amount: string;

  @ApiPropertyOptional({
    example: 'JPY',
    description: 'ISO 4217(GET /api/currencies). 기본 = 여정 통화',
  })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCY_CODES, { message: '지원하지 않는 통화예요' })
  currency?: string;

  @ApiPropertyOptional({
    maxLength: MANUAL_MEMO_MAX_LENGTH,
    description: '비우면 "결제"로 저장된다',
  })
  @IsOptional()
  @IsString({ message: '메모 형식이 올바르지 않아요' })
  // 정리(줄바꿈·제어문자·앞뒤 공백 제거) 뒤 40자는 서비스가 본다. 여기서는 원문 크기만 막는다
  @MaxLength(MEMO_RAW_MAX_LENGTH, {
    message: `내용은 ${MANUAL_MEMO_MAX_LENGTH}자까지 쓸 수 있어요`,
  })
  memo?: string;

  @ApiPropertyOptional({
    example: '2026-11-13T14:10:00+09:00',
    description: '기본 = 지금. 여정 기간 밖이면 여정 전/후 그룹(periodSide)',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: '결제 시각을 다시 확인해 주세요' })
  occurredAt?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: '결제한 사람(활성 멤버). 기본 = 나',
  })
  @IsOptional()
  @IsUUID('all', { message: '결제한 사람을 다시 골라 주세요' })
  payerMembershipId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      '분담 인원(활성 멤버). 기본 = 활성 멤버 전원. 결제자 말고 한 명이라도 있으면 공동, 결제자 혼자면 개인(결제자가 나일 때만)',
  })
  @IsOptional()
  @IsArray({ message: '함께 낼 사람 형식이 올바르지 않아요' })
  @ArrayMaxSize(100, { message: '함께 낼 사람이 너무 많아요' })
  @ArrayUnique({ message: '같은 사람이 두 번 들어 있어요' })
  @IsUUID('all', { each: true, message: '함께 낼 사람 형식이 올바르지 않아요' })
  participantMembershipIds?: string[];

  @ApiPropertyOptional({
    default: false,
    description: '내 지갑에도 기록(결제자가 나일 때만, 아니면 400)',
  })
  @IsOptional()
  @IsBoolean({ message: '지갑 기록 값은 true 또는 false예요' })
  addToWallet?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      '중복 제출 방지 키(화면이 만든 UUID). 같은 값으로 다시 보내면 처음 만든 결제를 돌려준다',
  })
  @IsOptional()
  @IsUUID('all', { message: '요청 키 형식이 올바르지 않아요' })
  clientRequestId?: string;
}

export class UpdateTripExpenseDto implements UpdateTripExpenseRequest {
  @ApiProperty({ minimum: 0, description: '마지막으로 받은 결제의 version' })
  @IsInt({ message: 'version은 정수여야 해요' })
  @Min(0, { message: 'version은 0 이상이어야 해요' })
  version: number;

  @ApiPropertyOptional({ example: '13200' })
  @IsOptional()
  @IsString({ message: '금액을 입력해 주세요' })
  @Matches(AMOUNT_PATTERN, { message: '금액을 다시 확인해 주세요' })
  amount?: string;

  @ApiPropertyOptional({ example: 'JPY' })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCY_CODES, { message: '지원하지 않는 통화예요' })
  currency?: string;

  @ApiPropertyOptional({
    maxLength: MANUAL_MEMO_MAX_LENGTH,
    description: '빈 문자열이면 기본 이름("결제")',
  })
  @IsOptional()
  @IsString({ message: '메모 형식이 올바르지 않아요' })
  // 정리(줄바꿈·제어문자·앞뒤 공백 제거) 뒤 40자는 서비스가 본다. 여기서는 원문 크기만 막는다
  @MaxLength(MEMO_RAW_MAX_LENGTH, {
    message: `내용은 ${MANUAL_MEMO_MAX_LENGTH}자까지 쓸 수 있어요`,
  })
  memo?: string;

  @ApiPropertyOptional({ example: '2026-11-13T14:10:00+09:00' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: '결제 시각을 다시 확인해 주세요' })
  occurredAt?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: '지갑에 기록된 결제는 바꿀 수 없다(400)',
  })
  @IsOptional()
  @IsUUID('all', { message: '결제한 사람을 다시 골라 주세요' })
  payerMembershipId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: '바꾸면 공동/개인이 다시 정해진다',
  })
  @IsOptional()
  @IsArray({ message: '함께 낼 사람 형식이 올바르지 않아요' })
  @ArrayMaxSize(100, { message: '함께 낼 사람이 너무 많아요' })
  @ArrayUnique({ message: '같은 사람이 두 번 들어 있어요' })
  @IsUUID('all', { each: true, message: '함께 낼 사람 형식이 올바르지 않아요' })
  participantMembershipIds?: string[];

  @ApiPropertyOptional({
    description: '공동 → 개인이 되는 변경은 확인 다이얼로그 뒤 true',
  })
  @IsOptional()
  @IsBoolean({ message: '확인 값은 true 또는 false예요' })
  confirmSharedToPersonal?: boolean;
}

export class DeleteTripExpenseQueryDto {
  @ApiProperty({ minimum: 0, description: '마지막으로 받은 결제의 version' })
  @Type(() => Number)
  @IsInt({ message: 'version은 정수여야 해요' })
  @Min(0, { message: 'version은 0 이상이어야 해요' })
  version: number;
}
