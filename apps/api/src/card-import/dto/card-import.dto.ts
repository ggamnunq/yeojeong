import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CARD_APPROVAL_BLOCK_REASON_VALUES,
  CARD_CANCEL_STATE_VALUES,
  CARD_IMPORT_ITEMS_MAX,
  CARD_IMPORT_ITEM_STATUS_VALUES,
  CARD_IMPORT_RANGE_BASIS_VALUES,
  CARD_IMPORT_TWO_WAY_METHOD_VALUES,
  MANUAL_MEMO_MAX_LENGTH,
  type CardApprovalBlockReason,
  type CardApprovalItem,
  type CardCancelState,
  type CardImportItemStatus,
  type CardImportConfig,
  type CardImportOrganization,
  type CardImportRangeBasis,
  type CardImportTwoWayInput,
  type CardImportTwoWayMethod,
  type FetchCardApprovalsRequest,
  type ImportWalletEntriesRequest,
  type ImportWalletEntriesResponse,
  type ImportWalletEntryItem,
} from '@yeojeong/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ConsentStatusResponseDto } from '../../consents/dto/consent.dto.js';
import {
  AMOUNT_PATTERN,
  MEMO_RAW_MAX_LENGTH,
} from '../../expenses/dto/manual-request.dto.js';
import { SUPPORTED_CURRENCY_CODES } from '../../fx/currencies.js';
import { WalletEntryDto } from '../../wallet/dto/wallet.dto.js';
import { CARD_IMPORT_ORGANIZATIONS } from '../codef/codef.constants.js';

// 요청 본문 검증 오류는 값을 되돌려 주지 않는다(createValidationPipe: value=false). 아이디·암호문이 응답·로그에 실리지 않는다.

const ORG_CODES = CARD_IMPORT_ORGANIZATIONS.map((o) => o.code);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const IMPORT_KEY = /^[0-9a-f]{64}$/;

// ─── 요청 ───

export class CardImportTwoWayDto implements CardImportTwoWayInput {
  @ApiProperty({ description: 'TWO_WAY_REQUIRED 응답의 twoWayToken' })
  @IsString({ message: '인증 정보가 올바르지 않아요' })
  @MaxLength(2048, { message: '인증 정보가 올바르지 않아요' })
  token: string;

  @ApiProperty({
    example: '123456',
    description: '카드사가 문자로 보낸 인증번호',
  })
  @IsString({ message: '인증번호를 입력해 주세요' })
  @Matches(/^\d{4,10}$/, { message: '인증번호를 다시 확인해 주세요' })
  code: string;
}

export class FetchCardApprovalsDto implements FetchCardApprovalsRequest {
  @ApiProperty({ enum: ORG_CODES, example: '0306' })
  @IsIn(ORG_CODES, { message: '불러올 수 없는 카드사예요' })
  organization: string;

  @ApiProperty({ description: '카드사 아이디(저장·기록하지 않는다)' })
  @IsString({ message: '아이디를 입력해 주세요' })
  @Length(1, 100, { message: '아이디를 다시 확인해 주세요' })
  loginId: string;

  @ApiProperty({
    description:
      '카드사 비밀번호를 config.publicKey로 RSA PKCS#1 v1.5 암호화한 base64(평문 비밀번호는 보내지 않는다)',
  })
  @IsString({ message: '비밀번호를 입력해 주세요' })
  @Length(16, 2048, { message: '다시 시도해 주세요' })
  @Matches(BASE64, { message: '다시 시도해 주세요' })
  encryptedPassword: string;

  @ApiProperty({ example: '2026-11-12', description: '조회 시작일(KST)' })
  @Matches(DAY, { message: '날짜를 다시 확인해 주세요' })
  @IsISO8601({ strict: true }, { message: '날짜를 다시 확인해 주세요' })
  from: string;

  @ApiProperty({
    example: '2026-11-15',
    description: '조회 종료일(KST, 오늘까지)',
  })
  @Matches(DAY, { message: '날짜를 다시 확인해 주세요' })
  @IsISO8601({ strict: true }, { message: '날짜를 다시 확인해 주세요' })
  to: string;

  @ApiPropertyOptional({
    example: '9410123412341934',
    description:
      '현대·하나(requiresCardNo)만: 카드번호 전체(저장·기록하지 않는다)',
  })
  @IsOptional()
  @Matches(/^\d{14,16}$/, { message: '카드번호를 다시 확인해 주세요' })
  loginCardNo?: string;

  @ApiPropertyOptional({
    description:
      '현대·하나(requiresCardNo)만: 카드 비밀번호 앞 2자리를 publicKey로 암호화한 base64',
  })
  @IsOptional()
  @IsString({ message: '다시 시도해 주세요' })
  @Length(16, 2048, { message: '다시 시도해 주세요' })
  @Matches(BASE64, { message: '다시 시도해 주세요' })
  encryptedCardPassword?: string;

  @ApiPropertyOptional({
    type: CardImportTwoWayDto,
    description:
      'TWO_WAY_REQUIRED 뒤 이어서 보낼 때만(나머지 필드는 처음과 같게)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardImportTwoWayDto)
  twoWay?: CardImportTwoWayDto;
}

export class ImportWalletEntryItemDto implements ImportWalletEntryItem {
  @ApiProperty({ description: 'CardApprovalItem.importKey(hex 64자)' })
  @IsString({ message: '불러온 결제 정보가 올바르지 않아요' })
  @Matches(IMPORT_KEY, { message: '불러온 결제 정보가 올바르지 않아요' })
  importKey: string;

  @ApiProperty({ description: 'CardApprovalItem.itemToken(서버 서명, 30분)' })
  @IsString({ message: '불러온 결제 정보가 올바르지 않아요' })
  @MaxLength(200, { message: '불러온 결제 정보가 올바르지 않아요' })
  itemToken: string;

  @ApiProperty({ example: '2026-11-13T14:10:00+09:00' })
  @IsISO8601({ strict: true }, { message: '결제 시각을 다시 확인해 주세요' })
  occurredAt: string;

  @ApiProperty({ example: '2860' })
  @IsString({ message: '금액을 입력해 주세요' })
  @Matches(AMOUNT_PATTERN, { message: '금액을 다시 확인해 주세요' })
  amount: string;

  @ApiProperty({ example: 'JPY' })
  @IsIn(SUPPORTED_CURRENCY_CODES, { message: '지원하지 않는 통화예요' })
  currency: string;

  @ApiProperty({ maxLength: MANUAL_MEMO_MAX_LENGTH, example: '이치란 라멘' })
  @IsString({ message: '가맹점 이름이 올바르지 않아요' })
  // 정리 뒤 40자는 서비스가 본다. 여기서는 원문 크기만 막는다
  @MaxLength(MEMO_RAW_MAX_LENGTH, {
    message: `내용은 ${MANUAL_MEMO_MAX_LENGTH}자까지 쓸 수 있어요`,
  })
  merchantName: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'CardApprovalItem.krwAmount(카드사 원화, 없으면 null)',
  })
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: '원화 금액이 올바르지 않아요' })
  @Min(0, { message: '원화 금액이 올바르지 않아요' })
  @Max(1_000_000_000_000, { message: '원화 금액이 올바르지 않아요' })
  krwAmount: number | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: '생략 = 자동 연결, uuid = 그 여정, null = 지갑에만',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: '여정을 다시 골라 주세요' })
  tripId?: string | null;
}

export class ImportWalletEntriesDto implements ImportWalletEntriesRequest {
  @ApiProperty({
    type: [ImportWalletEntryItemDto],
    maxItems: CARD_IMPORT_ITEMS_MAX,
  })
  @IsArray({ message: '저장할 결제를 골라 주세요' })
  @ArrayMinSize(1, { message: '저장할 결제를 골라 주세요' })
  @ArrayMaxSize(CARD_IMPORT_ITEMS_MAX, {
    message: `한 번에 ${CARD_IMPORT_ITEMS_MAX}건까지 저장할 수 있어요`,
  })
  @ValidateNested({ each: true })
  @Type(() => ImportWalletEntryItemDto)
  items: ImportWalletEntryItemDto[];
}

// ─── 응답 ───

export class CardImportOrganizationDto implements CardImportOrganization {
  @ApiProperty({ example: '0306' })
  code: string;

  @ApiProperty({ example: '신한카드' })
  name: string;

  @ApiProperty({ example: 90 })
  maxRangeDays: number;

  @ApiProperty({ example: 180 })
  maxLookbackDays: number;

  @ApiProperty({ description: '현대·하나: 카드번호·카드 비밀번호가 더 필요' })
  requiresCardNo: boolean;
}

export class CardImportDefaultRangeDto {
  @ApiProperty({ example: '2026-11-12' })
  from: string;

  @ApiProperty({ example: '2026-11-15' })
  to: string;

  @ApiProperty({ enum: CARD_IMPORT_RANGE_BASIS_VALUES })
  basis: CardImportRangeBasis;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  tripId: string | null;
}

export class CardImportConfigDto implements CardImportConfig {
  @ApiProperty({ enum: [true] })
  enabled: true;

  @ApiProperty({ description: 'CODEF RSA 공개키(base64 SPKI, 비밀 아님)' })
  publicKey: string;

  @ApiProperty({ description: '공개키(DER) SHA-256 hex' })
  publicKeyFingerprint: string;

  @ApiProperty({ type: [CardImportOrganizationDto] })
  organizations: CardImportOrganizationDto[];

  @ApiProperty({ example: 92 })
  maxRangeDays: number;

  @ApiProperty({ example: 365 })
  maxLookbackDays: number;

  @ApiProperty({ type: CardImportDefaultRangeDto })
  defaultRange: CardImportDefaultRangeDto;

  @ApiProperty({ type: ConsentStatusResponseDto })
  consent: ConsentStatusResponseDto;

  @ApiProperty({ example: 160 })
  twoWayTimeoutSeconds: number;

  @ApiProperty({ example: 10, description: '오늘(KST) 남은 조회 횟수' })
  remainingToday: number;
}

export class CardApprovalItemDto implements CardApprovalItem {
  @ApiProperty({ description: 'HMAC hex 64자. 저장(import)에 그대로 보낸다' })
  importKey: string;

  @ApiProperty({ example: '2026-11-13T14:10:00+09:00' })
  approvedAt: string;

  @ApiProperty({ example: '2860' })
  amount: string;

  @ApiProperty({ example: 'JPY' })
  currency: string;

  @ApiProperty({ type: Number, nullable: true })
  krwAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  estimatedKrwAmount: number | null;

  @ApiProperty({ example: '이치란 라멘' })
  merchantName: string;

  @ApiProperty()
  overseas: boolean;

  @ApiProperty({ example: '0306' })
  organization: string;

  @ApiProperty({ example: '신한카드' })
  organizationName: string;

  @ApiProperty({ type: String, nullable: true, example: '1934' })
  cardLast4: string | null;

  @ApiProperty({ type: String, nullable: true })
  cardName: string | null;

  @ApiProperty({
    enum: CARD_IMPORT_ITEM_STATUS_VALUES,
    description:
      '화면 칩: ALREADY_IMPORTED > CANCELLED > SIMILAR > PARTIAL_CANCEL > NEW',
  })
  status: CardImportItemStatus;

  @ApiProperty({ enum: CARD_CANCEL_STATE_VALUES })
  cancelState: CardCancelState;

  @ApiProperty({ type: String, nullable: true })
  partialCancelAmount: string | null;

  @ApiProperty()
  alreadyImported: boolean;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  similarManualEntryId: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  inTripId: string | null;

  @ApiProperty()
  selectable: boolean;

  @ApiProperty()
  defaultSelected: boolean;

  @ApiProperty({ enum: CARD_APPROVAL_BLOCK_REASON_VALUES, nullable: true })
  blockReason: CardApprovalBlockReason | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '저장용 서버 서명(고를 수 있는 항목만, 30분)',
  })
  itemToken: string | null;
}

/** 200 응답: status로 갈린다(OK = items, TWO_WAY_REQUIRED = twoWayToken·method·expiresAt) */
export class FetchCardApprovalsResponseDto {
  @ApiProperty({ enum: ['OK', 'TWO_WAY_REQUIRED'] })
  status: 'OK' | 'TWO_WAY_REQUIRED';

  @ApiPropertyOptional({ description: 'OK' })
  organization?: string;

  @ApiPropertyOptional({ description: 'OK' })
  from?: string;

  @ApiPropertyOptional({ description: 'OK' })
  to?: string;

  @ApiPropertyOptional({ type: [CardApprovalItemDto], description: 'OK' })
  items?: CardApprovalItemDto[];

  @ApiPropertyOptional({ description: 'TWO_WAY_REQUIRED' })
  twoWayToken?: string;

  @ApiPropertyOptional({
    enum: CARD_IMPORT_TWO_WAY_METHOD_VALUES,
    description: 'TWO_WAY_REQUIRED',
  })
  method?: CardImportTwoWayMethod;

  @ApiPropertyOptional({ description: 'TWO_WAY_REQUIRED' })
  expiresAt?: string;
}

export class ImportWalletEntryResultDto {
  @ApiProperty()
  importKey: string;

  @ApiProperty({ description: 'false면 이미 저장돼 있던 항목' })
  created: boolean;

  @ApiProperty({ type: WalletEntryDto })
  entry: WalletEntryDto;
}

export class ImportWalletEntriesResponseDto implements ImportWalletEntriesResponse {
  @ApiProperty({ type: [ImportWalletEntryResultDto] })
  items: ImportWalletEntryResultDto[];

  @ApiProperty({ description: '새로 만든 건수' })
  created: number;

  @ApiProperty({ description: '이미 있어 건너뛴 건수' })
  skipped: number;

  @ApiProperty({ description: '새로 만든 것 중 여정에 연결된 건수' })
  linked: number;
}
