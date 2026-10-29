import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FX_POLICY_VALUES,
  RATE_TYPE_VALUES,
  type FxJobResult,
  type FxPolicy,
  type FxRateView,
  type RateType,
  type TripFxView,
  type UpdateFxPolicyRequest,
  type UpdateFxPolicyResponse,
} from '@yeojeong/shared';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

export class FxRateQueryDto {
  @ApiProperty({
    example: 'JPY',
    description: '환율을 볼 통화(ISO 4217, KRW 제외)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^(?!KRW)[A-Z]{3}$/, { message: '통화 코드를 확인해 주세요' })
  base: string;

  @ApiPropertyOptional({
    example: '2026-11-13',
    description:
      '이 시각까지 유효한 고시. 날짜만이면 그날 KST 23:59:59까지, 없으면 최신',
  })
  @IsOptional()
  @Matches(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/,
    { message: '날짜는 YYYY-MM-DD 또는 ISO 8601 시각으로 보내 주세요' },
  )
  date?: string;
}

export class UpdateFxPolicyDto implements UpdateFxPolicyRequest {
  @ApiProperty({ enum: FX_POLICY_VALUES })
  @IsIn(FX_POLICY_VALUES, { message: '환율 적용 기준을 골라 주세요' })
  policy: FxPolicy;

  @ApiPropertyOptional({
    example: '919.20',
    description:
      'FIXED일 때 필수. 고시 단위당 원(100엔당 919.20), 소수 둘째 자리까지',
  })
  @ValidateIf(
    (o: UpdateFxPolicyDto) => o.policy === 'FIXED' || o.fixedRate !== undefined,
  )
  @IsString({ message: '고정 환율을 입력해 주세요' })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, {
    message: '0보다 큰 환율을 소수 둘째 자리까지 입력해 주세요',
  })
  fixedRate?: string;

  @ApiProperty({ description: 'GET 응답의 version' })
  @IsInt({ message: 'version을 보내 주세요' })
  @Min(0)
  version: number;
}

export class FxRateViewDto implements FxRateView {
  @ApiProperty({ enum: ['KRW'] })
  baseCurrency: 'KRW';
  @ApiProperty({ example: 'JPY' })
  currency: string;
  @ApiProperty({ example: '엔' })
  currencyNameKo: string;
  @ApiProperty({ example: 100 })
  displayUnit: number;
  @ApiProperty({ example: '9.192000', description: '1단위당 원' })
  rate: string;
  @ApiProperty({ example: '919.20', description: '고시 단위당 원' })
  displayRate: string;
  @ApiProperty({ example: '100엔 = 919.20원' })
  label: string;
  @ApiProperty({ enum: RATE_TYPE_VALUES })
  rateType: RateType;
  @ApiProperty({ example: '데모 매매기준율' })
  source: string;
  @ApiPropertyOptional({
    example: 'https://www.exchangerate-api.com',
    description:
      '출처 표기에 링크가 필요한 출처(약관상 표기 의무)일 때만 있다. 화면은 source를 이 링크로 감싼다',
  })
  sourceUrl?: string;
  @ApiProperty({ example: '2026-11-13T18:00:00+09:00' })
  effectiveAt: string;
  @ApiProperty({ example: '2026-11-13T18:00:05+09:00' })
  fetchedAt: string;
}

export class TripFxViewDto implements TripFxView {
  @ApiProperty({ enum: ['KRW'] })
  baseCurrency: 'KRW';
  @ApiProperty({ example: 'JPY' })
  tripCurrency: string;
  @ApiProperty({ example: '엔' })
  currencyNameKo: string;
  @ApiProperty({ example: 100 })
  displayUnit: number;
  @ApiProperty()
  isKrwTrip: boolean;
  @ApiProperty({ type: () => FxRateViewDto, nullable: true })
  current: FxRateViewDto | null;
  @ApiProperty({ enum: FX_POLICY_VALUES })
  policy: FxPolicy;
  @ApiProperty({ type: String, nullable: true, example: '919.20' })
  fixedRate: string | null;
  @ApiProperty({ type: String, nullable: true })
  policyChangedAt: string | null;
  @ApiProperty({ description: '그룹장 ∧ 종료 전 ∧ 외화 여정' })
  canEdit: boolean;
  @ApiProperty()
  version: number;
}

export class UpdateFxPolicyResponseDto implements UpdateFxPolicyResponse {
  @ApiProperty({ type: () => TripFxViewDto })
  fx: TripFxViewDto;
  @ApiProperty({ description: '원화가 바뀐 결제 수(취소 자식 포함)' })
  recalculatedCount: number;
}

export class FxJobResultDto implements FxJobResult {
  @ApiProperty()
  source: string;
  @ApiProperty({ type: [String] })
  currencies: string[];
  @ApiProperty()
  fetched: number;
  @ApiProperty()
  inserted: number;
  @ApiProperty({
    description: '직전 고시와 20% 넘게 차이 나 저장하지 않은 고시 수',
  })
  rejected: number;
  @ApiProperty()
  recalculatedTrips: number;
}
