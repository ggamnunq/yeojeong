import { ApiProperty } from '@nestjs/swagger';
import {
  FILE_IMPORT_CHECK_MAX,
  FILE_IMPORT_ITEMS_MAX,
  FILE_IMPORT_PROVIDER_VALUES,
  FILE_IMPORT_TXN_DIGEST_PATTERN,
  MANUAL_MEMO_MAX_LENGTH,
  type FileImportCheckRequest,
  type FileImportCheckResponse,
  type FileImportItem,
  type FileImportProvider,
  type FileImportRequest,
  type FileImportResponse,
} from '@yeojeong/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  AMOUNT_PATTERN,
  MEMO_RAW_MAX_LENGTH,
} from '../../expenses/dto/manual-request.dto.js';
import { FILE_IMPORT_CURRENCIES } from '../providers.js';

// 요청 본문 검증 오류는 값을 되돌려 주지 않는다(createValidationPipe: value=false, forbidNonWhitelisted).
// 계약 밖 필드(상품·결제 수단·가맹점 주문 번호·비고·거래 번호 원문 등)는 400으로 거절한다 — 서버는 받지 않는다.

const TXN_DIGEST = new RegExp(FILE_IMPORT_TXN_DIGEST_PATTERN);
/** 오프셋이 있는 시각만(오프셋이 없으면 서버 시간대로 읽혀 결제 시각이 어긋난다) */
const WITH_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;
const INVALID_ITEM = '가져온 결제 정보가 올바르지 않아요';

// ─── 요청 ───

export class FileImportItemDto implements FileImportItem {
  @ApiProperty({
    description:
      'SHA-256("{provider}:{거래 번호}") 소문자 hex 64자(브라우저가 계산). 서버는 HMAC(importKey)으로만 쓰고 저장·로그하지 않는다',
    example: 'c0ffee'.padEnd(64, '0'),
  })
  @IsString({ message: INVALID_ITEM })
  @Matches(TXN_DIGEST, { message: INVALID_ITEM })
  txnDigest: string;

  @ApiProperty({
    example: '2026-10-01T12:34:56+08:00',
    description: '오프셋 포함 ISO 8601. 위챗 파일 시각은 중국 표준시(+08:00)',
  })
  @IsString({ message: '결제 시각을 다시 확인해 주세요' })
  @IsISO8601({ strict: true }, { message: '결제 시각을 다시 확인해 주세요' })
  @Matches(WITH_OFFSET, { message: '결제 시각을 다시 확인해 주세요' })
  occurredAt: string;

  @ApiProperty({ example: '128.00' })
  @IsString({ message: '금액을 입력해 주세요' })
  @Matches(AMOUNT_PATTERN, { message: '금액을 다시 확인해 주세요' })
  amount: string;

  @ApiProperty({ example: 'CNY', enum: FILE_IMPORT_CURRENCIES })
  @IsIn(FILE_IMPORT_CURRENCIES, { message: '지원하지 않는 통화예요' })
  currency: string;

  @ApiProperty({ maxLength: MANUAL_MEMO_MAX_LENGTH, example: '瑞幸咖啡' })
  @IsString({ message: '가맹점 이름이 올바르지 않아요' })
  // 정리 뒤 40자는 서비스가 본다. 여기서는 원문 크기만 막는다
  @MaxLength(MEMO_RAW_MAX_LENGTH, {
    message: `내용은 ${MANUAL_MEMO_MAX_LENGTH}자까지 쓸 수 있어요`,
  })
  merchantName: string;
}

export class FileImportDto implements FileImportRequest {
  @ApiProperty({ enum: FILE_IMPORT_PROVIDER_VALUES, example: 'WECHAT' })
  @IsIn(FILE_IMPORT_PROVIDER_VALUES, { message: '지원하지 않는 파일이에요' })
  provider: FileImportProvider;

  @ApiProperty({ type: [FileImportItemDto], maxItems: FILE_IMPORT_ITEMS_MAX })
  @IsArray({ message: '저장할 결제를 골라 주세요' })
  @ArrayMinSize(1, { message: '저장할 결제를 골라 주세요' })
  @ArrayMaxSize(FILE_IMPORT_ITEMS_MAX, {
    message: `한 번에 ${FILE_IMPORT_ITEMS_MAX}건까지 저장할 수 있어요`,
  })
  @ValidateNested({ each: true })
  @Type(() => FileImportItemDto)
  items: FileImportItemDto[];
}

export class FileImportCheckDto implements FileImportCheckRequest {
  @ApiProperty({ enum: FILE_IMPORT_PROVIDER_VALUES, example: 'WECHAT' })
  @IsIn(FILE_IMPORT_PROVIDER_VALUES, { message: '지원하지 않는 파일이에요' })
  provider: FileImportProvider;

  @ApiProperty({
    type: [String],
    maxItems: FILE_IMPORT_CHECK_MAX,
    description:
      'FileImportItem.txnDigest(SHA-256 hex) 배열만. 일시·금액·가맹점은 받지 않는다(명세 4-13-7)',
  })
  @IsArray({ message: '확인할 결제가 없어요' })
  @ArrayMinSize(1, { message: '확인할 결제가 없어요' })
  @ArrayMaxSize(FILE_IMPORT_CHECK_MAX, {
    message: `한 번에 ${FILE_IMPORT_CHECK_MAX}건까지 확인할 수 있어요`,
  })
  @IsString({ each: true, message: INVALID_ITEM })
  @Matches(TXN_DIGEST, { each: true, message: INVALID_ITEM })
  txnDigests: string[];
}

// ─── 응답 ───

export class FileImportResultDto {
  @ApiProperty({ description: 'false = 이미 저장돼 있던 거래(건너뜀)' })
  created: boolean;

  @ApiProperty({ format: 'uuid', description: '지갑 항목 ID' })
  entryId: string;
}

export class FileImportResponseDto implements FileImportResponse {
  @ApiProperty({ type: [FileImportResultDto], description: '요청 순서대로' })
  items: FileImportResultDto[];

  @ApiProperty({ description: '새로 만든 건수' })
  created: number;

  @ApiProperty({ description: '이미 있어 건너뛴 건수' })
  skipped: number;

  @ApiProperty({ description: '새로 만든 것 중 여정에 연결된 건수' })
  linked: number;
}

export class FileImportCheckResponseDto implements FileImportCheckResponse {
  @ApiProperty({
    type: [Boolean],
    description: '요청 순서대로. true = 이미 지갑에 저장한 거래("추가됨")',
  })
  imported: boolean[];
}
