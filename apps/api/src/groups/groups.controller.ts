import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { LeaveGroupResponse, MemberSummary } from '@yeojeong/shared';
import {
  CurrentMembership,
  RequireRole,
  RequireTripStatus,
  type MembershipContext,
} from '../common/auth/index.js';
import { ApiErrorResponse, NotFoundError } from '../common/errors/index.js';
import { MemberSummaryDto } from '../trips/dto/trip-response.dto.js';
import { LeaveGroupResponseDto, MembersQueryDto } from './dto/groups.dto.js';
import { GroupsService } from './groups.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('groups')
@Controller('groups/:groupId')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @ApiOperation({ summary: '그룹원 목록(가입 순)', description: 'FR-206' })
  @ApiOkResponse({ type: [MemberSummaryDto] })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @Get('members')
  members(
    @Param('groupId') groupId: string,
    @CurrentMembership() me: MembershipContext,
    @Query() query: MembersQueryDto,
  ): Promise<MemberSummary[]> {
    return this.groups.members(groupId, me, query.includeLeft ?? false);
  }

  @ApiOperation({
    summary: '강퇴',
    description: 'FR-207. 그룹장만, 본인 제외, 시작 전·진행 중',
  })
  @ApiNoContentResponse()
  @ApiErrorResponse(400, 'CANNOT_KICK_SELF')
  @ApiErrorResponse(403, 'NOT_LEADER')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @RequireRole('LEADER')
  @RequireTripStatus(['UPCOMING', 'ONGOING'])
  @HttpCode(204)
  @Delete('members/:membershipId')
  async kick(
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<void> {
    if (!UUID.test(membershipId)) throw new NotFoundError();
    await this.groups.kick(groupId, me, membershipId);
  }

  @ApiOperation({
    summary: '그룹 나가기',
    description:
      'FR-208. 그룹장이면 가입 순 다음 멤버가 승계, 마지막 멤버면 그룹 삭제',
  })
  @ApiOkResponse({ type: LeaveGroupResponseDto })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @HttpCode(200)
  @Post('leave')
  leave(
    @Param('groupId') groupId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<LeaveGroupResponse> {
    return this.groups.leave(groupId, me);
  }

  @ApiOperation({
    summary: '그룹 삭제',
    description: 'FR-209. 그룹장만, 시작 전에만',
  })
  @ApiNoContentResponse()
  @ApiErrorResponse(403, 'NOT_LEADER')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @RequireRole('LEADER')
  @RequireTripStatus('UPCOMING')
  @HttpCode(204)
  @Delete()
  async remove(
    @Param('groupId') groupId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<void> {
    await this.groups.deleteGroup(groupId, me);
  }
}
