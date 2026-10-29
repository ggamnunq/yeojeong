import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADMIN_USER_PAGE_SIZE,
  ADMIN_USER_QUERY_MAX,
  ADMIN_USER_SORT_VALUES,
  ADMIN_USER_STATUS_VALUES,
  ADMIN_WITHDRAW_REASON_LENGTH,
  type AdminCardImportAccess,
  type AdminUserConsent,
  type AdminUserDetail,
  type AdminUserListItem,
  type AdminUserListQuery,
  type AdminUserListResponse,
  type AdminUserSort,
  type AdminUserStatus,
  type AdminUserTrip,
  type AdminWithdrawUserRequest,
  type AdminWithdrawUserResponse,
} from '@yeojeong/shared';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminUserListQueryDto implements AdminUserListQuery {
  @ApiPropertyOptional({
    maxLength: ADMIN_USER_QUERY_MAX,
    description: '닉네임 부분 일치. 사용자 ID(UUID) 모양이면 ID 정확 일치',
  })
  @IsOptional()
  @IsString({ message: '검색어는 문자열이어야 해요' })
  @MaxLength(ADMIN_USER_QUERY_MAX, { message: '검색어가 너무 길어요' })
  q?: string;

  @ApiPropertyOptional({ enum: ADMIN_USER_SORT_VALUES, default: 'createdAt' })
  @IsOptional()
  @IsIn(ADMIN_USER_SORT_VALUES, { message: '정렬 기준을 확인해 주세요' })
  sort?: AdminUserSort;

  @ApiPropertyOptional({ description: '앞 페이지의 nextCursor' })
  @IsOptional()
  @IsString({ message: '커서가 올바르지 않아요' })
  @MaxLength(256, { message: '커서가 올바르지 않아요' })
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: ADMIN_USER_PAGE_SIZE.MAX,
    default: ADMIN_USER_PAGE_SIZE.DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '개수는 정수여야 해요' })
  @Min(1, { message: '개수는 1 이상이어야 해요' })
  @Max(ADMIN_USER_PAGE_SIZE.MAX, {
    message: `개수는 ${ADMIN_USER_PAGE_SIZE.MAX} 이하여야 해요`,
  })
  limit?: number;
}

export class AdminWithdrawUserDto implements AdminWithdrawUserRequest {
  @ApiProperty({
    minLength: ADMIN_WITHDRAW_REASON_LENGTH.MIN,
    maxLength: ADMIN_WITHDRAW_REASON_LENGTH.MAX,
    description: '처리 사유(접근 기록에 남는다 — 개인정보를 적지 않는다)',
  })
  @IsString({ message: '사유를 입력해 주세요' })
  @Length(ADMIN_WITHDRAW_REASON_LENGTH.MIN, ADMIN_WITHDRAW_REASON_LENGTH.MAX, {
    message: `사유는 ${ADMIN_WITHDRAW_REASON_LENGTH.MIN}~${ADMIN_WITHDRAW_REASON_LENGTH.MAX}자로 적어 주세요`,
  })
  @Matches(/\S/, { message: '사유를 입력해 주세요' })
  reason: string;

  @ApiProperty({
    maxLength: 64,
    description: '확인용으로 다시 입력한 회원 닉네임',
  })
  @IsString({ message: '닉네임을 입력해 주세요' })
  @MaxLength(64, { message: '닉네임이 맞지 않아요' })
  confirmNickname: string;

  @ApiProperty({
    maxLength: 256,
    description: '재인증: 관리자 비밀번호(저장·기록하지 않는다)',
  })
  @IsString({ message: '비밀번호를 입력해 주세요' })
  @Length(1, 256, { message: '비밀번호를 입력해 주세요' })
  password: string;

  @ApiProperty({
    pattern: '^\\d{6}$',
    description: '재인증: 지금 인증 앱의 6자리 코드',
  })
  @IsString({ message: '인증 코드 6자리를 입력해 주세요' })
  @Matches(/^\d{6}$/, { message: '인증 코드 6자리를 입력해 주세요' })
  totp: string;
}

class AdminCardImportAccessDto implements AdminCardImportAccess {
  @ApiProperty({ description: 'CARD_IMPORT_ALLOWED_USER_IDS에 있는지' })
  allowlisted: boolean;
  @ApiProperty({ description: '지금 이 회원에게 기능이 켜져 있는지' })
  enabled: boolean;
}

export class AdminUserListItemDto implements AdminUserListItem {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty()
  nickname: string;
  @ApiProperty({ description: '가입 시각(ISO 8601 KST)' })
  createdAt: string;
  @ApiProperty({ description: '최근 로그인(ISO 8601 KST)' })
  lastLoginAt: string;
  @ApiProperty({ description: '참여 중인 여정 수' })
  tripCount: number;
  @ApiProperty({ description: '지갑 항목 수' })
  walletEntryCount: number;
  @ApiProperty({ enum: ADMIN_USER_STATUS_VALUES })
  status: AdminUserStatus;
  @ApiProperty({ type: AdminCardImportAccessDto })
  cardImport: AdminCardImportAccessDto;
}

export class AdminUserListResponseDto implements AdminUserListResponse {
  @ApiProperty({ type: [AdminUserListItemDto] })
  items: AdminUserListItemDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

class AdminUserConsentDto implements AdminUserConsent {
  @ApiProperty()
  consentId: string;
  @ApiProperty()
  version: string;
  @ApiProperty()
  agreed: boolean;
  @ApiProperty()
  agreedAt: string;
  @ApiProperty({ type: String, nullable: true })
  withdrawnAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  withdrawChannel: string | null;
}

class AdminUserTripDto implements AdminUserTrip {
  @ApiProperty({ format: 'uuid' })
  groupId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  tripId: string | null;
  @ApiProperty()
  name: string;
  @ApiProperty({ type: String, nullable: true })
  tripStatus: string | null;
  @ApiProperty({ type: String, nullable: true })
  startDate: string | null;
  @ApiProperty({ type: String, nullable: true })
  endDate: string | null;
  @ApiProperty({ enum: ['LEADER', 'MEMBER'] })
  role: 'LEADER' | 'MEMBER';
  @ApiProperty()
  joinedAt: string;
  @ApiProperty({ type: String, nullable: true })
  leftAt: string | null;
  @ApiProperty()
  deleted: boolean;
}

class AdminDeletionRequestDto {
  @ApiProperty()
  requestedAt: string;
  @ApiProperty({ type: String, nullable: true })
  expiresAt: string | null;
}

class AdminUserCountsDto {
  @ApiProperty({ description: '결제자인 여정 결제 수' })
  expenses: number;
  @ApiProperty()
  walletEntries: number;
  @ApiProperty()
  paymentMethods: number;
  @ApiProperty()
  activeSessions: number;
}

export class AdminUserDetailDto
  extends AdminUserListItemDto
  implements AdminUserDetail
{
  @ApiProperty({
    type: String,
    nullable: true,
    description: '카카오 회원번호 끝 4자리',
  })
  kakaoIdLast4: string | null;
  @ApiProperty({ type: AdminDeletionRequestDto, nullable: true })
  deletionRequest: AdminDeletionRequestDto | null;
  @ApiProperty({ type: [AdminUserConsentDto] })
  consents: AdminUserConsentDto[];
  @ApiProperty({ type: [AdminUserTripDto] })
  trips: AdminUserTripDto[];
  @ApiProperty({ type: AdminUserCountsDto })
  counts: AdminUserCountsDto;
}

export class AdminWithdrawUserResponseDto implements AdminWithdrawUserResponse {
  @ApiProperty({ enum: ['DELETED'] })
  status: 'DELETED';
  @ApiProperty({ format: 'uuid' })
  accountDeletionId: string;
  @ApiProperty()
  completedAt: string;
}
