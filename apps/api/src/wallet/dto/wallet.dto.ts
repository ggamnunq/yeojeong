import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EXPENSE_STATUS_VALUES,
  MANUAL_MEMO_MAX_LENGTH,
  TRIP_STATUS_VALUES,
  TX_KIND_VALUES,
  TX_SOURCE_VALUES,
  WALLET_ENTRY_FIELD_VALUES,
  WALLET_ENTRY_LIST_LIMIT,
  type CreateWalletEntryRequest,
  type ExpenseStatus,
  type TripStatus,
  type TxKind,
  type TxSource,
  type UpdateWalletEntryRequest,
  type WalletEntry,
  type WalletEntryField,
  type WalletEntryListResponse,
  type WalletEntryMutationResponse,
  type WalletLinkedTrip,
  type WalletTripCandidate,
  type WalletTripCandidatesResponse,
} from '@yeojeong/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ExpenseDetailResponseDto } from '../../expenses/dto/expense-response.dto.js';
import {
  AMOUNT_PATTERN,
  AmountProperty,
  MEMO_RAW_MAX_LENGTH,
} from '../../expenses/dto/manual-request.dto.js';
import { SUPPORTED_CURRENCY_CODES } from '../../fx/currencies.js';

// ─── 요청 ───

export class ListWalletEntriesQueryDto {
  @ApiPropertyOptional({ description: '이전 응답의 nextCursor' })
  @IsOptional()
  @IsString({ message: '목록 위치가 올바르지 않아요' })
  @MaxLength(200, { message: '목록 위치가 올바르지 않아요' })
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: WALLET_ENTRY_LIST_LIMIT.MAX,
    default: WALLET_ENTRY_LIST_LIMIT.DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '개수는 정수여야 해요' })
  @Min(1, { message: '1개 이상이어야 해요' })
  @Max(WALLET_ENTRY_LIST_LIMIT.MAX, {
    message: `${WALLET_ENTRY_LIST_LIMIT.MAX}개까지 볼 수 있어요`,
  })
  limit?: number;
}

export class TripCandidatesQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-13T14:10:00+09:00',
    description: '결제 시각(ISO 8601). 기본 = 지금',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: '결제 시각을 다시 확인해 주세요' })
  at?: string;
}

export class CreateWalletEntryDto implements CreateWalletEntryRequest {
  @AmountProperty()
  @IsString({ message: '금액을 입력해 주세요' })
  @Matches(AMOUNT_PATTERN, { message: '금액을 다시 확인해 주세요' })
  amount: string;

  @ApiPropertyOptional({
    example: 'JPY',
    description:
      'ISO 4217(GET /api/currencies). 기본 = trip-candidates의 defaultCurrency(진행 중 여정의 통화, 없으면 KRW)',
  })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCY_CODES, { message: '지원하지 않는 통화예요' })
  currency?: string;

  @ApiPropertyOptional({
    maxLength: MANUAL_MEMO_MAX_LENGTH,
    description: '비우면 "결제"',
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
    description: '기본 = 지금',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: '결제 시각을 다시 확인해 주세요' })
  occurredAt?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      '생략 = 자동 연결(기간 안 예정·진행 중 여정), uuid = 그 여정(기간 밖이면 여정 전/후), null = 연결 안 함',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: '여정을 다시 골라 주세요' })
  tripId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      '중복 제출 방지 키(화면이 만든 UUID). 같은 값으로 다시 보내면 처음 만든 항목을 돌려준다',
  })
  @IsOptional()
  @IsUUID('all', { message: '요청 키 형식이 올바르지 않아요' })
  clientRequestId?: string;
}

export class UpdateWalletEntryDto implements UpdateWalletEntryRequest {
  @ApiProperty({ minimum: 0, description: '마지막으로 받은 항목의 version' })
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
    description: '빈 문자열이면 메모를 지운다',
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
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      '연결 여정 바꾸기: uuid = 예정·진행 중 여정으로 옮김(미확정), null = 연결 끊기. 연결된 결제가 확정(개인·공동)이면 409 EXPENSE_LOCKED',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: '여정을 다시 골라 주세요' })
  tripId?: string | null;
}

export class DeleteWalletEntryQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      '연결된 공동 결제(예정·진행 중 여정)도 같이 지운다. 확인 다이얼로그 뒤 true',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'includeShared는 true 또는 false예요' })
  includeShared?: boolean;
}

// ─── 응답 ───

export class WalletLinkedTripDto implements WalletLinkedTrip {
  @ApiProperty({ format: 'uuid' })
  tripId: string;

  @ApiProperty({ example: '오사카 먹방' })
  groupName: string;

  @ApiProperty({ example: '일본 오사카' })
  placeLabel: string;

  @ApiProperty({ enum: TRIP_STATUS_VALUES })
  tripStatus: TripStatus;

  @ApiProperty({ format: 'uuid' })
  expenseId: string;

  @ApiProperty({
    enum: EXPENSE_STATUS_VALUES,
    description: '종료된 여정의 미확정은 PERSONAL',
  })
  expenseStatus: ExpenseStatus;

  @ApiProperty()
  expenseVersion: number;
}

export class WalletEntryDto implements WalletEntry {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: TX_SOURCE_VALUES })
  source: TxSource;

  @ApiProperty({ enum: TX_KIND_VALUES })
  kind: TxKind;

  @ApiProperty({ example: '2026-11-13T14:10:00+09:00' })
  occurredAt: string;

  @ApiProperty({ example: '2026-11-13' })
  localDate: string;

  @ApiProperty({
    example: '이치란 라멘',
    description: '직접 입력은 메모(비었으면 "결제"), 가져온 거래는 가맹점',
  })
  merchantName: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '직접 입력의 메모(없으면 null)',
  })
  memo: string | null;

  @ApiProperty({ example: '2860', description: '부호 포함 decimal' })
  amount: string;

  @ApiProperty({ example: 'JPY' })
  currency: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      '연결된 여정 결제의 원화 → KRW 금액 → 매매기준율 추정. 모르면 null',
  })
  krwAmount: number | null;

  @ApiProperty({ type: String, nullable: true })
  paymentMethodLabel: string | null;

  @ApiProperty({ type: WalletLinkedTripDto, nullable: true })
  linkedTrip: WalletLinkedTripDto | null;

  @ApiProperty({
    enum: WALLET_ENTRY_FIELD_VALUES,
    isArray: true,
    description: '가져온 거래는 [], 종료된(나간) 여정에 연결된 항목은 ["memo"]',
  })
  editableFields: WalletEntryField[];

  @ApiProperty({
    description:
      '연결 여정을 바꿀 수 있는지(직접 입력 + 연결 없음 또는 미확정)',
  })
  canChangeTrip: boolean;

  @ApiProperty()
  canDelete: boolean;

  @ApiProperty({ description: '수정 요청에 그대로 보낸다' })
  version: number;
}

export class WalletEntryListResponseDto implements WalletEntryListResponse {
  @ApiProperty({ type: [WalletEntryDto] })
  items: WalletEntryDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class WalletEntryMutationResponseDto implements WalletEntryMutationResponse {
  @ApiProperty({ type: WalletEntryDto })
  entry: WalletEntryDto;

  @ApiProperty({
    type: ExpenseDetailResponseDto,
    nullable: true,
    description: '연결된 여정 결제(entry.linkedTrip이 있을 때). 없으면 null',
  })
  linkedExpense: ExpenseDetailResponseDto | null;
}

export class WalletTripCandidateDto implements WalletTripCandidate {
  @ApiProperty({ format: 'uuid' })
  tripId: string;

  @ApiProperty()
  groupName: string;

  @ApiProperty()
  placeLabel: string;

  @ApiProperty({ enum: ['UPCOMING', 'ONGOING'] })
  status: 'UPCOMING' | 'ONGOING';

  @ApiProperty({ example: '2026-11-12' })
  startDate: string;

  @ApiProperty({ example: '2026-11-15' })
  endDate: string;

  @ApiProperty({ example: 'JPY' })
  currency: string;

  @ApiProperty({
    description: 'at이 여정 기간(KST 시작일 00:00 ~ 종료일 23:59:59) 안인지',
  })
  inPeriod: boolean;
}

export class WalletTripCandidatesResponseDto implements WalletTripCandidatesResponse {
  @ApiProperty({
    type: [WalletTripCandidateDto],
    description:
      '기간 안 → 진행 중 → 시작일이 at에 가까운 순. items[0].inPeriod면 자동 연결 대상',
  })
  items: WalletTripCandidateDto[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  suggestedTripId: string | null;

  @ApiProperty({ example: 'JPY' })
  defaultCurrency: string;
}
