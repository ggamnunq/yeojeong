import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONSENT_ID_VALUES,
  type ConsentAgreementInput,
  type ConsentDocumentSummary,
  type ConsentId,
  type ConsentRequirement,
  type ConsentStatusResponse,
  type ConsentSubmitRequest,
} from '@yeojeong/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export const AGREEMENT_METHODS = ['ALL', 'INDIVIDUAL'] as const;

export class ConsentAgreementDto implements ConsentAgreementInput {
  @ApiProperty({ enum: CONSENT_ID_VALUES, example: 'TOS' })
  @IsIn(CONSENT_ID_VALUES, { message: '알 수 없는 동의 항목이에요' })
  consentId: ConsentId;

  @ApiProperty({
    description:
      '화면이 보여 준 문서 버전(GET /api/consents/documents의 version)',
    example: '0.1-draft',
  })
  @IsString({ message: '문서 버전이 필요해요' })
  @Matches(/^[0-9A-Za-z.-]{1,16}$/, { message: '문서 버전 형식이 아니에요' })
  version: string;

  @ApiProperty()
  @IsBoolean({ message: '동의 여부가 필요해요' })
  agreed: boolean;
}

export class AgreementsBodyDto {
  @ApiProperty({ type: [ConsentAgreementDto] })
  @IsArray({ message: '동의 항목이 필요해요' })
  @ArrayMinSize(1, { message: '동의 항목이 필요해요' })
  @ArrayMaxSize(CONSENT_ID_VALUES.length)
  @ValidateNested({ each: true })
  @Type(() => ConsentAgreementDto)
  agreements: ConsentAgreementDto[];

  @ApiProperty({
    enum: AGREEMENT_METHODS,
    description: '전체 동의 / 개별 체크',
  })
  @IsIn(AGREEMENT_METHODS, { message: '동의 방식이 올바르지 않아요' })
  method: (typeof AGREEMENT_METHODS)[number];
}

export class ConsentSubmitDto
  extends AgreementsBodyDto
  implements ConsentSubmitRequest
{
  @ApiProperty({ enum: ['FIN_LINK'] })
  @IsIn(['FIN_LINK'], { message: '이 단계의 동의는 받을 수 없어요' })
  stage: 'FIN_LINK';

  @ApiProperty({
    enum: ['WF-05', 'WF-28', 'WF-42'],
    description: '동의 시트를 띄운 화면',
  })
  @IsIn(['WF-05', 'WF-28', 'WF-42'], { message: '화면 값이 올바르지 않아요' })
  screen: 'WF-05' | 'WF-28' | 'WF-42';
}

export class ConsentRequirementDto implements ConsentRequirement {
  @ApiProperty({ enum: CONSENT_ID_VALUES })
  id: ConsentId;

  @ApiProperty({ example: '0.1-draft' })
  version: string;
}

export class ConsentDocumentSummaryDto implements ConsentDocumentSummary {
  @ApiProperty({ enum: CONSENT_ID_VALUES })
  consentId: ConsentId;

  @ApiProperty({ example: '서비스 이용약관' })
  title: string;

  @ApiProperty()
  required: boolean;

  @ApiProperty({ example: '0.1-draft' })
  version: string;

  @ApiProperty({ type: String, nullable: true, example: '/terms' })
  docUrl: string | null;

  @ApiProperty({ description: '전문 보기(›)를 둘지' })
  hasDetail: boolean;

  @ApiProperty({ description: '화면에 노출하지 않는 항목(MARKETING)' })
  hidden: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  summary: string | null;

  @ApiProperty({ description: '시행 전 초안. 정식본이 나오면 다시 동의받는다' })
  isDraft: boolean;
}

export class ConsentStatusResponseDto implements ConsentStatusResponse {
  @ApiProperty()
  valid: boolean;

  @ApiProperty({ enum: CONSENT_ID_VALUES, isArray: true })
  missing: ConsentId[];

  @ApiProperty({ type: [ConsentRequirementDto] })
  required: ConsentRequirementDto[];
}
