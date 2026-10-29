import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Me } from '@yeojeong/shared';
import type { AuthUser } from '../common/auth/auth-context.js';
import { CurrentUser } from '../common/auth/decorators.js';
import { ApiErrorResponse } from '../common/errors/api-error.dto.js';
import { MeDto, UpdateMeDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiCookieAuth('yj_session')
@ApiErrorResponse(401, 'UNAUTHENTICATED')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @ApiOperation({ summary: '내 정보 (FR-901·105)' })
  @ApiOkResponse({ type: MeDto })
  @ApiErrorResponse(403, 'CONSENT_REQUIRED', 'SIGNUP_REQUIRED')
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.users.me(user.id);
  }

  @ApiOperation({
    summary: '내 정보 수정 — 닉네임 (FR-902)',
    description:
      '가입(FR-103)과 같은 닉네임 규칙. 응답은 갱신된 내 정보. 프로필 사진은 카카오에서 로그인할 때마다 동기화되어 여기서 바꾸지 않는다.',
  })
  @ApiOkResponse({ type: MeDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(403, 'CSRF_REJECTED', 'CONSENT_REQUIRED')
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMeDto,
  ): Promise<Me> {
    return this.users.updateNickname(user.id, dto.nickname);
  }
}
