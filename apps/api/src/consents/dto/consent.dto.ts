import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONSENT_ID_VALUES,
  REVOCABLE_CONSENTS,
  type RevocableConsent,
  type RevocableConsentId,
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

/** POST /api/consents로 받는 단계와, 단계마다 허용하는 화면 */
export const SUBMIT_STAGE_SCREENS = {
  FIN_LINK: ['WF-05', 'WF-28', 'WF-42'],
  CARD_IMPORT: ['CARD_IMPORT'],
} as const satisfies Record<
  ConsentSubmitRequest['stage'],
  readonly ConsentSubmitRequest['screen'][]
>;
const SUBMIT_STAGES = Object.keys(
  SUBMIT_STAGE_SCREENS,
) as ConsentSubmitRequest['stage'][];
const SUBMIT_SCREENS = [
  ...new Set(Object.values(SUBMIT_STAGE_SCREENS).flat()),
] as ConsentSubmitRequest['screen'][];

export class ConsentSubmitDto
  extends AgreementsBodyDto
  implements ConsentSubmitRequest
{
  @ApiProperty({
    enum: SUBMIT_STAGES,
    description:
      'FIN_LINK = 결제수단 연결 전(FR-809), CARD_IMPORT = 카드 승인내역 불러오기 전(S8)',
  })
  @IsIn(SUBMIT_STAGES, { message: '이 단계의 동의는 받을 수 없어요' })
  stage: ConsentSubmitRequest['stage'];

  @ApiProperty({
    enum: SUBMIT_SCREENS,
    description:
      '동의 시트를 띄운 화면. FIN_LINK = WF-05·WF-28·WF-42, CARD_IMPORT = CARD_IMPORT',
  })
  @IsIn(SUBMIT_SCREENS, { message: '화면 값이 올바르지 않아요' })
  screen: ConsentSubmitRequest['screen'];
}

export class RevocableConsentDto implements RevocableConsent {
  @ApiProperty({ enum: REVOCABLE_CONSENTS })
  consentId: RevocableConsentId;

  @ApiProperty({ example: '카드 승인내역 불러오기' })
  title: string;

  @ApiProperty({ example: '0.1-draft' })
  version: string;

  @ApiProperty({ example: '2026-11-13T14:10:00+09:00' })
  agreedAt: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/consents/CARD_IMPORT',
  })
  docUrl: string | null;
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
