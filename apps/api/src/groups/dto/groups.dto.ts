import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TRIP_STATUS_VALUES,
  type InvitePreview,
  type JoinTripResponse,
  type LeaveGroupResponse,
  type TripStatus,
} from '@yeojeong/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  MemberSummaryDto,
  ProfileDto,
} from '../../trips/dto/trip-response.dto.js';

export class MembersQueryDto {
  @ApiPropertyOptional({
    default: false,
    description: '나간 멤버(강퇴 포함)도 함께',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'includeLeft는 true 또는 false예요' })
  includeLeft?: boolean;
}

export class LeaveGroupResponseDto implements LeaveGroupResponse {
  @ApiProperty({
    type: MemberSummaryDto,
    nullable: true,
    description: '그룹장이 나가 승계가 일어났을 때',
  })
  newLeader: MemberSummaryDto | null;

  @ApiProperty({ description: '마지막 멤버가 나가 그룹이 삭제됐는지' })
  groupDeleted: boolean;
}

export class InvitePreviewDto implements InvitePreview {
  @ApiProperty({ example: '오사카 3박 4일' })
  groupName: string;

  @ApiProperty({ example: '일본 오사카' })
  placeLabel: string;

  @ApiProperty({ example: '2026-11-12' })
  startDate: string;

  @ApiProperty({ example: '2026-11-15' })
  endDate: string;

  @ApiProperty({ enum: TRIP_STATUS_VALUES })
  status: TripStatus;

  @ApiProperty({ example: 3 })
  memberCount: number;

  @ApiProperty({ type: [ProfileDto], description: '가입 순 최대 4명' })
  membersPreview: ProfileDto[];

  @ApiProperty()
  alreadyMember: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: '이미 멤버일 때만',
  })
  tripId: string | null;
}

export class JoinTripResponseDto implements JoinTripResponse {
  @ApiProperty({ format: 'uuid' })
  tripId: string;

  @ApiProperty({ format: 'uuid' })
  groupId: string;

  @ApiProperty({ enum: TRIP_STATUS_VALUES })
  status: TripStatus;
}
