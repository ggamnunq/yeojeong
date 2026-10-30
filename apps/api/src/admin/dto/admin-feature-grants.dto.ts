import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADMIN_FEATURE_GRANT_NOTE_MAX,
  ADMIN_FEATURE_GRANT_SOURCE_VALUES,
  ADMIN_FEATURE_OFF_REASON_VALUES,
  ADMIN_USER_QUERY_MAX,
  FEATURE_KEY_VALUES,
  FEATURE_MODE_VALUES,
  type AdminCreateFeatureGrantRequest,
  type AdminFeatureGrantCell,
  type AdminFeatureGrantList,
  type AdminFeatureGrantListQuery,
  type AdminFeatureGrantRow,
  type AdminFeatureGrantSource,
  type AdminFeatureOffReason,
  type AdminFeatureStatus,
  type FeatureKey,
  type FeatureMode,
} from '@yeojeong/shared';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdminFeatureGrantListQueryDto implements AdminFeatureGrantListQuery {
  @ApiPropertyOptional({
    maxLength: ADMIN_USER_QUERY_MAX,
    description:
      '비면 권한(관리자·env)이 있는 회원 전부. 닉네임 부분 일치, 사용자 ID(UUID) 모양이면 ID 정확 일치(권한 없는 회원도 보인다)',
  })
  @IsOptional()
  @IsString({ message: '검색어는 문자열이어야 해요' })
  @MaxLength(ADMIN_USER_QUERY_MAX, { message: '검색어가 너무 길어요' })
  q?: string;
}

export class AdminCreateFeatureGrantDto implements AdminCreateFeatureGrantRequest {
  @ApiProperty({ format: 'uuid', description: '권한을 줄 회원 ID' })
  @IsUUID('all', { message: '사용자 ID를 확인해 주세요' })
  userId: string;

  @ApiProperty({ enum: FEATURE_KEY_VALUES, description: '줄 기능' })
  @IsIn(FEATURE_KEY_VALUES, { message: '기능을 확인해 주세요' })
  feature: FeatureKey;

  @ApiPropertyOptional({
    maxLength: ADMIN_FEATURE_GRANT_NOTE_MAX,
    description:
      '운영 메모(선택). 권한 행에만 남고 접근 기록에는 메모가 있었는지만 남는다. 개인정보를 적지 않는다',
  })
  @IsOptional()
  @IsString({ message: '메모는 문자열이어야 해요' })
  @MaxLength(ADMIN_FEATURE_GRANT_NOTE_MAX, {
    message: `메모는 ${ADMIN_FEATURE_GRANT_NOTE_MAX}자까지 적을 수 있어요`,
  })
  note?: string;
}

class AdminFeatureStatusDto implements AdminFeatureStatus {
  @ApiProperty({ enum: FEATURE_KEY_VALUES })
  feature: FeatureKey;
  @ApiProperty({
    enum: FEATURE_MODE_VALUES,
    description: 'env 값(FEATURE_CARD_IMPORT · FEATURE_FILE_IMPORT)',
  })
  configuredMode: FeatureMode;
  @ApiProperty({
    enum: FEATURE_MODE_VALUES,
    description:
      '실제 단계(CODEF 키·운영 importKey 키가 없거나 FILE_IMPORT_PROVIDERS에 공급자가 없으면 off)',
  })
  effectiveMode: FeatureMode;
  @ApiProperty({
    enum: ADMIN_FEATURE_OFF_REASON_VALUES,
    nullable: true,
    description: '설정과 달리 꺼진 이유',
  })
  offReason: AdminFeatureOffReason | null;
  @ApiProperty({ description: 'env 허용 목록 인원 수(카드 불러오기만)' })
  envUserCount: number;
}

class AdminFeatureGrantCellDto implements AdminFeatureGrantCell {
  @ApiProperty({ enum: FEATURE_KEY_VALUES })
  feature: FeatureKey;
  @ApiProperty({
    enum: ADMIN_FEATURE_GRANT_SOURCE_VALUES,
    isArray: true,
    description:
      'ADMIN = 관리자 페이지에서 준 권한(회수 가능) · ENV = env CARD_IMPORT_ALLOWED_USER_IDS(회수 불가). 비면 권한 없음',
  })
  sources: AdminFeatureGrantSource[];
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
  @ApiProperty({ description: '지금 이 회원에게 켜져 있는지' })
  enabled: boolean;
}

class AdminFeatureGrantCardImportDto {
  @ApiProperty({ description: 'CARD_IMPORT 동의가 지금 유효한지' })
  consent: boolean;
  @ApiProperty({ description: '오늘(KST) 새 카드 조회 수' })
  todayFetchCount: number;
}

export class AdminFeatureGrantRowDto implements AdminFeatureGrantRow {
  @ApiProperty({ format: 'uuid' })
  userId: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'env에만 있고 회원이 없으면 null',
  })
  nickname: string | null;
  @ApiProperty({
    type: [AdminFeatureGrantCellDto],
    description: 'FEATURE_KEY_VALUES 순서',
  })
  cells: AdminFeatureGrantCellDto[];
  @ApiProperty({ type: AdminFeatureGrantCardImportDto })
  cardImport: AdminFeatureGrantCardImportDto;
}

export class AdminFeatureGrantListDto implements AdminFeatureGrantList {
  @ApiProperty()
  asOf: string;
  @ApiProperty({ type: [AdminFeatureStatusDto] })
  features: AdminFeatureStatusDto[];
  @ApiProperty({ description: 'CARD_IMPORT_FETCH_LIMIT.DAILY' })
  cardImportDailyLimit: number;
  @ApiProperty({ type: [AdminFeatureGrantRowDto] })
  items: AdminFeatureGrantRowDto[];
  @ApiProperty({ description: '검색 결과가 상한보다 많아 잘렸는지' })
  truncated: boolean;
}
