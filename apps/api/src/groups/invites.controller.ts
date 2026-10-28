import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { InvitePreview, JoinTripResponse } from '@yeojeong/shared';
import { CurrentUser, type AuthUser } from '../common/auth/index.js';
import { ApiErrorResponse } from '../common/errors/index.js';
import { StrictThrottle } from '../common/throttle.js';
import { InvitePreviewDto, JoinTripResponseDto } from './dto/groups.dto.js';
import { InvitesService } from './invites.service.js';

// 초대코드는 무차별 대입 대상이라 1분 10회(StrictThrottle). 코드는 대소문자·하이픈·공백을 무시한다.
@ApiTags('groups')
@ApiParam({ name: 'code', example: 'K7M-2QX' })
@StrictThrottle()
@Controller('invites/:code')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @ApiOperation({ summary: '초대코드 미리보기', description: 'FR-203' })
  @ApiOkResponse({ type: InvitePreviewDto })
  @ApiErrorResponse(403, 'MEMBER_KICKED')
  @ApiErrorResponse(404, 'INVITE_CODE_INVALID')
  @ApiErrorResponse(409, 'INVITE_TRIP_ENDED')
  @ApiErrorResponse(429, 'RATE_LIMITED')
  @Get()
  preview(
    @Param('code') code: string,
    @CurrentUser() user: AuthUser,
  ): Promise<InvitePreview> {
    return this.invites.preview(code, user);
  }

  @ApiOperation({
    summary: '초대코드로 참여(승인 없음)',
    description: 'FR-204',
  })
  @ApiCreatedResponse({ type: JoinTripResponseDto })
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
    @Param('code') code: string,
    @CurrentUser() user: AuthUser,
  ): Promise<JoinTripResponse> {
    return this.invites.join(code, user);
  }
}
