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

// 요청 본문 DTO. 형식만 여기서 보고, 날짜 범위·국가 지원 여부·단계별 허용 항목은 서비스(trip-rules.ts)가 본다.

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = '날짜는 YYYY-MM-DD 형식이에요';

export class PlaceInputDto implements PlaceInput {
  @ApiProperty({ example: 'JP', description: 'ISO 3166-1 alpha-2. 국내 KR' })
  @Matches(/^[A-Z]{2}$/, { message: '국가 코드를 다시 확인해 주세요' })
  countryCode: string;

  @ApiPropertyOptional({ example: '오사카', nullable: true, maxLength: 40 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: '도시를 다시 확인해 주세요' })
  @MaxLength(PLACE_LABEL_MAX_LENGTH, { message: '도시는 40자까지예요' })
  city?: string | null;

  @ApiProperty({ example: '일본 오사카', maxLength: 40 })
  @Transform(trim)
  @IsString({ message: '여행 장소를 골라 주세요' })
  @Length(1, PLACE_LABEL_MAX_LENGTH, { message: '여행 장소를 골라 주세요' })
  label: string;
}

export class CreateTripDto implements CreateTripRequest {
  @ApiProperty({ example: '오사카 3박 4일', maxLength: GROUP_NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString({ message: '그룹명을 입력해 주세요' })
  @Length(1, GROUP_NAME_MAX_LENGTH, { message: '그룹명은 1~20자예요' })
  groupName: string;

  @ApiProperty({ type: PlaceInputDto })
  @IsObject({ message: '여행 장소를 골라 주세요' })
  @ValidateNested()
  @Type(() => PlaceInputDto)
  place: PlaceInputDto;

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
  @IsObject({ message: '여행 장소를 골라 주세요' })
  @ValidateNested()
  @Type(() => PlaceInputDto)
  place?: PlaceInputDto;

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
