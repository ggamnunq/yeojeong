import { Controller, Get } from '@nestjs/common';
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
import { MeDto } from './dto/user.dto.js';
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
}
