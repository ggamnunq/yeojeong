import { ApiProperty } from '@nestjs/swagger';
import {
  END_REASON_VALUES,
  FX_POLICY_VALUES,
  MEMBER_ROLE_VALUES,
  TRIP_EDITABLE_FIELD_VALUES,
  TRIP_EVENT_TYPE_VALUES,
  TRIP_START_BLOCK_REASON_VALUES,
  TRIP_STATUS_VALUES,
  TRIP_TAB_VALUES,
  type AutoEndJobResponse,
  type CreateTripResponse,
  type EndPreviewResponse,
  type EndReason,
  type EndTripResponse,
  type FxPolicy,
  type MemberRole,
  type MemberSummary,
  type MyTripsResponse,
  type Place,
  type Profile,
  type SupportedCurrency,
  type TripDetailResponse,
  type TripEditableField,
  type TripEventType,
  type TripEventView,
  type TripListItem,
  type TripPermissions,
  type TripShell,
  type TripStartBlockReason,
  type TripStatus,
  type TripTab,
} from '@yeojeong/shared';

// Swagger 문서용 응답 DTO. 실제 타입은 @yeojeong/shared(api.ts, api/trips.ts)에 있다.

export class ProfileDto implements Profile {
  @ApiProperty({ example: '준용' })
  nickname: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'null이면 기본 이미지',
  })
  profileImageUrl: string | null;
}

export class MemberSummaryDto extends ProfileDto implements MemberSummary {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({ enum: MEMBER_ROLE_VALUES })
  role: MemberRole;

  @ApiProperty({ example: 1, description: '가입 순서. 생성자 = 1' })
  joinOrder: number;

  @ApiProperty()
  isMe: boolean;

  @ApiProperty({ description: '나간 멤버(강퇴 포함)' })
  isLeft: boolean;
  @ApiProperty({ description: '계정 탈퇴한 멤버' })
  isWithdrawn: boolean;
}

export class TripListItemDto implements TripListItem {
  @ApiProperty({ format: 'uuid' })
  tripId: string;

  @ApiProperty({ format: 'uuid' })
  groupId: string;

  @ApiProperty({ example: '오사카 3박 4일' })
  groupName: string;

  @ApiProperty({ enum: TRIP_STATUS_VALUES })
  status: TripStatus;

  @ApiProperty({ example: '2026-11-12' })
  startDate: string;

  @ApiProperty({ example: '2026-11-15' })
  endDate: string;

  @ApiProperty({ example: 4, description: '활성 멤버 수' })
  memberCount: number;

  @ApiProperty()
  isLeader: boolean;
}

export class MyTripsResponseDto implements MyTripsResponse {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  lastViewedTripId: string | null;

  @ApiProperty({ type: [TripListItemDto] })
  items: TripListItemDto[];
}

export class CreateTripResponseDto implements CreateTripResponse {
  @ApiProperty({ format: 'uuid' })
  tripId: string;

  @ApiProperty({ format: 'uuid' })
  groupId: string;

  @ApiProperty({ example: 'K7M2QX', description: '표시는 3-3(K7M-2QX)' })
  inviteCode: string;
}

class TripMeDto {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({ enum: MEMBER_ROLE_VALUES })
  role: MemberRole;

  @ApiProperty({ description: '이 여정의 내 미확정 결제 수' })
  pendingCount: number;

  @ApiProperty({ description: '내 토스 연결이 만료됐는지' })
  connectionExpired: boolean;
}

class TripFxDto {
  @ApiProperty({ enum: FX_POLICY_VALUES })
  policy: FxPolicy;

  @ApiProperty({ example: 'JPY' })
  tripCurrency: string;
}

class TripEventViewDto implements TripEventView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: TRIP_EVENT_TYPE_VALUES })
  type: TripEventType;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { newLeaderMembershipId: '…', nickname: '민지' },
  })
  payload: Record<string, unknown>;
}

class TripShellDto implements TripShell {
  @ApiProperty({ enum: TRIP_TAB_VALUES })
  defaultTab: TripTab;

  @ApiProperty({ enum: ['SUMMARY', 'SETTLEMENT'] })
  secondTab: 'SUMMARY' | 'SETTLEMENT';

  @ApiProperty({ enum: TRIP_TAB_VALUES, isArray: true })
  lockedTabs: TripTab[];
}

class TripPermissionsDto implements TripPermissions {
  @ApiProperty()
  canEdit: boolean;

  @ApiProperty({ enum: TRIP_EDITABLE_FIELD_VALUES, isArray: true })
  editableFields: TripEditableField[];

  @ApiProperty({ description: 'startBlockReason === null' })
  canStart: boolean;

  @ApiProperty({
    enum: TRIP_START_BLOCK_REASON_VALUES,
    nullable: true,
    description:
      '시작할 수 없는 이유(시작 API 거부 사유와 같은 순서: NOT_LEADER → NOT_UPCOMING → PERIOD_OVER). null이면 시작할 수 있다. 서버 시계(KST) 기준',
  })
  startBlockReason: TripStartBlockReason | null;

  @ApiProperty()
  canEnd: boolean;

  @ApiProperty()
  canDeleteGroup: boolean;

  @ApiProperty()
  canKick: boolean;

  @ApiProperty()
  canInvite: boolean;

  @ApiProperty()
  canLeave: boolean;

  @ApiProperty()
  canChangeFx: boolean;
}

export class TripDetailResponseDto
  extends TripListItemDto
  implements TripDetailResponse
{
  @ApiProperty({
    example: '제주 + 부산',
    description: '사용자가 적은 여행 장소',
  })
  placeLabel: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      '옛 장소 목록으로 만든 여정만 값이 있다(ISO 3166-1). 새 여정은 null',
  })
  countryCode: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: '옛 장소 목록으로 만든 여정만 값이 있다',
  })
  city: string | null;

  @ApiProperty({
    example: 'JPY',
    description: 'ISO 4217. 여정을 만들 때 고른 통화',
  })
  currency: string;

  @ApiProperty({ example: 1200000 })
  budgetKrw: number;

  @ApiProperty({ example: 3 })
  nights: number;

  @ApiProperty({ example: 4 })
  days: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '시작 전 D-n. 지났으면 null',
  })
  dDay: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '진행 중 오늘의 Day N',
  })
  todayDayIndex: number | null;

  @ApiProperty({ example: '2026-11-15T23:59:59+09:00' })
  autoEndAt: string;

  @ApiProperty({ type: String, nullable: true })
  startedAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  endedAt: string | null;

  @ApiProperty({ enum: END_REASON_VALUES, nullable: true })
  endReason: EndReason | null;

  @ApiProperty({ type: String, nullable: true, description: '종료 후 null' })
  inviteCode: string | null;

  @ApiProperty({ type: TripMeDto })
  me: TripMeDto;

  @ApiProperty({ type: [MemberSummaryDto], description: '활성 멤버, 가입 순' })
  members: MemberSummaryDto[];

  @ApiProperty({
    type: TripFxDto,
    nullable: true,
    description: 'KRW 여정이면 null',
  })
  fx: TripFxDto | null;

  @ApiProperty({
    type: [TripEventViewDto],
    description: '순서대로 보여 준 뒤 events/ack',
  })
  unseenEvents: TripEventViewDto[];

  @ApiProperty({ type: TripShellDto })
  shell: TripShellDto;

  @ApiProperty({ type: TripPermissionsDto })
  permissions: TripPermissionsDto;

  @ApiProperty({
    description: '낙관적 잠금. 수정·시작·종료 요청에 그대로 보낸다',
  })
  version: number;
}

export class EndPreviewResponseDto implements EndPreviewResponse {
  @ApiProperty({ description: '그룹 전체 미확정 건수' })
  pendingCount: number;

  @ApiProperty({ example: '2026-11-15T23:59:59+09:00' })
  autoEndAt: string;
}

export class EndTripResponseDto implements EndTripResponse {
  @ApiProperty({ type: TripDetailResponseDto })
  trip: TripDetailResponseDto;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  settlementId: string | null;

  @ApiProperty({ description: '개인으로 처리될 미확정 건수' })
  autoPersonalizedCount: number;
}

/** @deprecated 장소가 자유 입력이 되어 새 화면은 GET /api/places를 쓰지 않는다 */
export class PlaceDto implements Place {
  @ApiProperty({ example: 'JP' })
  countryCode: string;

  @ApiProperty({ example: '일본' })
  countryName: string;

  @ApiProperty({ type: String, nullable: true, example: '오사카' })
  city: string | null;

  @ApiProperty({ example: '일본 오사카' })
  label: string;

  @ApiProperty({ example: 'JPY' })
  currency: string;
}

export class SupportedCurrencyDto implements SupportedCurrency {
  @ApiProperty({ example: 'JPY', description: 'ISO 4217' })
  code: string;

  @ApiProperty({ example: '일본 엔', description: '표시 "JPY · 일본 엔"' })
  name: string;

  @ApiProperty({ example: '엔', description: '금액·환율 표기의 단위 이름' })
  unitName: string;

  @ApiProperty({ example: 100, description: '고시 단위(JPY·VND·IDR = 100)' })
  displayUnit: number;
}

export class AutoEndJobResponseDto implements AutoEndJobResponse {
  @ApiProperty({ type: [String] })
  endedTripIds: string[];

  @ApiProperty({ type: [String] })
  redeliveredTripIds: string[];
}
