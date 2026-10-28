import { Controller, Get, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { DeletionRequestResponse, Me } from '@yeojeong/shared';
import type { AuthUser } from '../common/auth/auth-context.js';
import { CurrentUser, SkipConsentCheck } from '../common/auth/decorators.js';
import { ApiErrorResponse } from '../common/errors/api-error.dto.js';
import { StrictThrottle } from '../common/throttle.js';
import { DeletionRequestResponseDto, MeDto } from './dto/user.dto.js';
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
    summary: '탈퇴·삭제 요청 코드 발급 (FR-108)',
    description:
      '24시간 유효한 요청 코드와 고객센터 메일 초안을 돌려준다. 메일은 화면이 mailto로 연다. 재동의 전에도 부를 수 있다.',
  })
  @ApiCreatedResponse({ type: DeletionRequestResponseDto })
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @SkipConsentCheck()
  @StrictThrottle()
  @Post('me/deletion-request')
  requestDeletion(
    @CurrentUser() user: AuthUser,
  ): Promise<DeletionRequestResponse> {
    return this.users.requestDeletion(user.id);
  }
}
