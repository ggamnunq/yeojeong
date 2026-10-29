import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GROUP_NAME_MAX_LENGTH,
  PLACE_LABEL_MAX_LENGTH,
  TRIP_BUDGET_MAX_KRW,
  TRIP_BUDGET_MIN_KRW,
  type AckTripEventsRequest,
  type CreateTripRequest,
  type PlaceInput,
  type TripVersionRequest,
  type UpdateTripRequest,
} from '@yeojeong/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TRIP_CURRENCY_CODES } from '../currencies.js';

// 요청 본문 DTO. 형식·지원 통화는 여기서 보고, 날짜 범위·단계별 허용 항목은 서비스(trip-rules.ts)가 본다.

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = '날짜는 YYYY-MM-DD 형식이에요';

export class PlaceInputDto implements PlaceInput {
  @ApiProperty({
    example: '제주 + 부산',
    maxLength: PLACE_LABEL_MAX_LENGTH,
    description: '자유 입력. 앞뒤 공백을 빼고 1~40자',
  })
  @Transform(trim)
  @IsString({ message: '여행 장소를 입력해 주세요' })
  @Length(1, PLACE_LABEL_MAX_LENGTH, {
    message: ({ value }) =>
      typeof value === 'string' && value.length > 0
        ? `여행 장소는 ${PLACE_LABEL_MAX_LENGTH}자까지예요`
        : '여행 장소를 입력해 주세요',
  })
  label: string;

  @ApiPropertyOptional({
    type: String,
    example: 'JP',
    nullable: true,
    deprecated: true,
    description:
      '옛 장소 목록 호환. 받으면 저장만 하고 통화 판단에는 쓰지 않는다',
  })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: '국가 코드를 다시 확인해 주세요' })
  countryCode?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '오사카',
    nullable: true,
    maxLength: PLACE_LABEL_MAX_LENGTH,
    deprecated: true,
    description: '옛 장소 목록 호환. 받으면 저장만 한다',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: '도시를 다시 확인해 주세요' })
  @MaxLength(PLACE_LABEL_MAX_LENGTH, { message: '도시는 40자까지예요' })
  city?: string | null;
}

/** 여정 통화. 빠지면 '통화를 골라 주세요', 목록 밖이면 '지원하지 않는 통화예요'(한 필드에 오류 하나) */
const currencyMessage = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === ''
    ? '통화를 골라 주세요'
    : '지원하지 않는 통화예요';

const CURRENCY_PROPERTY = {
  example: 'JPY',
  enum: TRIP_CURRENCY_CODES,
  description: 'ISO 4217. GET /api/currencies 목록 중 하나(국내 여행은 KRW)',
} as const;

const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateTripDto implements CreateTripRequest {
  @ApiProperty({ example: '오사카 3박 4일', maxLength: GROUP_NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString({ message: '그룹명을 입력해 주세요' })
  @Length(1, GROUP_NAME_MAX_LENGTH, { message: '그룹명은 1~20자예요' })
  groupName: string;

  @ApiProperty({ type: PlaceInputDto })
  @IsObject({ message: '여행 장소를 입력해 주세요' })
  @ValidateNested()
  @Type(() => PlaceInputDto)
  place: PlaceInputDto;

  @ApiProperty(CURRENCY_PROPERTY)
  @Transform(upperTrim)
  @IsIn(TRIP_CURRENCY_CODES, { message: currencyMessage })
  currency: string;

  @ApiProperty({ example: '2026-11-12', description: 'KST 날짜' })
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  startDate: string;

  @ApiProperty({
    example: '2026-11-15',
    description: 'KST 날짜. 시작일 이후, 최대 31일',
  })
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  endDate: string;

  @ApiProperty({
    example: 1200000,
    minimum: TRIP_BUDGET_MIN_KRW,
    maximum: TRIP_BUDGET_MAX_KRW,
  })
  @IsInt({ message: '예산은 원 단위 숫자예요' })
  @Min(TRIP_BUDGET_MIN_KRW, { message: '예산은 1원 이상이에요' })
  @Max(TRIP_BUDGET_MAX_KRW, { message: '예산은 10억 원까지예요' })
  budgetKrw: number;
}

export class TripVersionDto implements TripVersionRequest {
  @ApiProperty({ example: 0, description: 'GET /api/trips/:tripId의 version' })
  @IsInt({ message: 'version을 다시 확인해 주세요' })
  @Min(0, { message: 'version을 다시 확인해 주세요' })
  version: number;
}

export class UpdateTripDto extends TripVersionDto implements UpdateTripRequest {
  @ApiPropertyOptional({
    example: '오사카 먹방',
    maxLength: GROUP_NAME_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: '그룹명을 입력해 주세요' })
  @Length(1, GROUP_NAME_MAX_LENGTH, { message: '그룹명은 1~20자예요' })
  groupName?: string;

  @ApiPropertyOptional({ type: PlaceInputDto, description: '시작 전에만' })
  @IsOptional()
  @IsObject({ message: '여행 장소를 입력해 주세요' })
  @ValidateNested()
  @Type(() => PlaceInputDto)
  place?: PlaceInputDto;

  @ApiPropertyOptional({
    ...CURRENCY_PROPERTY,
    description: `${CURRENCY_PROPERTY.description}. 시작 전에만. 바뀌면 고정 환율은 결제 시점 환율로 돌아간다`,
  })
  @IsOptional()
  @Transform(upperTrim)
  @IsIn(TRIP_CURRENCY_CODES, { message: currencyMessage })
  currency?: string;

  @ApiPropertyOptional({ example: '2026-11-12', description: '시작 전에만' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-11-16',
    description: '진행 중에는 오늘 이후로만',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  endDate?: string;

  @ApiPropertyOptional({ example: 1500000 })
  @IsOptional()
  @IsInt({ message: '예산은 원 단위 숫자예요' })
  @Min(TRIP_BUDGET_MIN_KRW, { message: '예산은 1원 이상이에요' })
  @Max(TRIP_BUDGET_MAX_KRW, { message: '예산은 10억 원까지예요' })
  budgetKrw?: number;
}

export class AckTripEventsDto implements AckTripEventsRequest {
  @ApiProperty({
    format: 'uuid',
    description: '마지막으로 보여 준 unseenEvents[].id',
  })
  @IsUUID('all', { message: '이벤트 ID를 다시 확인해 주세요' })
  lastEventId: string;
}

export class PlaceQueryDto {
  @ApiPropertyOptional({ example: '오사카', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(PLACE_LABEL_MAX_LENGTH)
  query?: string;
}
