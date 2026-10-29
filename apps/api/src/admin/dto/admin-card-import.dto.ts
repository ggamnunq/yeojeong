import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADMIN_CARD_IMPORT_GRANT_NOTE_MAX,
  ADMIN_CARD_IMPORT_GRANT_SOURCE_VALUES,
  type AdminCardImportGrant,
  type AdminCardImportGrantList,
  type AdminCardImportGrantSource,
  type AdminCreateCardImportGrantRequest,
} from '@yeojeong/shared';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdminCreateCardImportGrantDto implements AdminCreateCardImportGrantRequest {
  @ApiProperty({ format: 'uuid', description: '권한을 줄 회원 ID' })
  @IsUUID('all', { message: '사용자 ID를 확인해 주세요' })
  userId: string;

  @ApiPropertyOptional({
    maxLength: ADMIN_CARD_IMPORT_GRANT_NOTE_MAX,
    description: '운영 메모(선택). 접근 기록에도 남으니 개인정보를 적지 않는다',
  })
  @IsOptional()
  @IsString({ message: '메모는 문자열이어야 해요' })
  @MaxLength(ADMIN_CARD_IMPORT_GRANT_NOTE_MAX, {
    message: `메모는 ${ADMIN_CARD_IMPORT_GRANT_NOTE_MAX}자까지 적을 수 있어요`,
  })
  note?: string;
}

export class AdminCardImportGrantDto implements AdminCardImportGrant {
  @ApiProperty({ format: 'uuid' })
  userId: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'env에만 있고 회원이 없으면 null',
  })
  nickname: string | null;
  @ApiProperty({
    enum: ADMIN_CARD_IMPORT_GRANT_SOURCE_VALUES,
    isArray: true,
    description:
      'ADMIN = 관리자 페이지에서 준 권한(회수 가능) · ENV = env CARD_IMPORT_ALLOWED_USER_IDS(회수 불가)',
  })
  sources: AdminCardImportGrantSource[];
  @ApiProperty({ type: String, nullable: true })
  grantedAt: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '준 관리자 행위자 ID',
  })
  grantedBy: string | null;
  @ApiProperty({ type: String, nullable: true })
  note: string | null;
  @ApiProperty({ description: 'sources에 ADMIN이 있으면 true' })
  revocable: boolean;
  @ApiProperty({ description: 'CARD_IMPORT 동의가 지금 유효한지' })
  cardImportConsent: boolean;
  @ApiProperty({ description: '오늘(KST) 새 조회 수' })
  todayFetchCount: number;
}

class AdminCardImportFlagsDto {
  @ApiProperty({ enum: ['off', 'allowlist', 'on'] })
  featureCardImport: string;
  @ApiProperty({
    enum: ['off', 'allowlist', 'on'],
    description: 'CODEF 키가 없으면 off',
  })
  effectiveMode: string;
}

export class AdminCardImportGrantListDto implements AdminCardImportGrantList {
  @ApiProperty()
  asOf: string;
  @ApiProperty({ type: AdminCardImportFlagsDto })
  flags: AdminCardImportFlagsDto;
  @ApiProperty({ description: 'CARD_IMPORT_FETCH_LIMIT.DAILY' })
  dailyLimit: number;
  @ApiProperty({ type: [AdminCardImportGrantDto] })
  items: AdminCardImportGrantDto[];
}
