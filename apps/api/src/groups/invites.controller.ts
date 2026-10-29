import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { InvitePreview, JoinTripResponse } from '@yeojeong/shared';
import { CurrentUser, type AuthUser } from '../common/auth/index.js';
import { ApiErrorResponse } from '../common/errors/index.js';
import { StrictThrottle } from '../common/throttle.js';
import {
  InviteCodeDto,
  InvitePreviewDto,
  JoinTripResponseDto,
} from './dto/groups.dto.js';
import { InviteUserThrottleGuard } from './invite-user-throttle.guard.js';
import { InvitesService } from './invites.service.js';

// 초대코드는 그룹 참여 권한이다. 경로·쿼리는 요청 로그·프록시 기록에 남으니 본문으로만 받는다.
// 무차별 대입 방지: IP당 1분 10회(StrictThrottle, 엔드포인트별) + 사용자당 10분 20회(미리보기·참여 합산).
// 코드는 대소문자·하이픈·공백을 무시한다.
@ApiTags('groups')
@StrictThrottle()
@UseGuards(InviteUserThrottleGuard)
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @ApiOperation({ summary: '초대코드 미리보기', description: 'FR-203' })
  @ApiOkResponse({ type: InvitePreviewDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(403, 'MEMBER_KICKED')
  @ApiErrorResponse(404, 'INVITE_CODE_INVALID')
  @ApiErrorResponse(409, 'INVITE_TRIP_ENDED')
  @ApiErrorResponse(429, 'RATE_LIMITED')
  @HttpCode(200)
  @Post('preview')
  preview(
    @Body() body: InviteCodeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<InvitePreview> {
    return this.invites.preview(body.code, user);
  }

  @ApiOperation({
    summary: '초대코드로 참여(승인 없음)',
    description: 'FR-204',
  })
  @ApiCreatedResponse({ type: JoinTripResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(403, 'MEMBER_KICKED')
  @ApiErrorResponse(404, 'INVITE_CODE_INVALID')
  @ApiErrorResponse(
    409,
    'INVITE_TRIP_ENDED',
    'ALREADY_MEMBER',
    'MEMBER_LIMIT_EXCEEDED',
  )
  @ApiErrorResponse(429, 'RATE_LIMITED')
  @HttpCode(201)
  @Post('join')
  join(
    @Body() body: InviteCodeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<JoinTripResponse> {
    return this.invites.join(body.code, user);
  }
}
