import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminSessionView } from '@yeojeong/shared';
import type { Request, Response } from 'express';
import { AppException, ApiErrorResponse } from '../common/errors/index.js';
import { StrictThrottle } from '../common/throttle.js';
import { AdminAuditLog } from './admin-audit.js';
import { AdminConfig } from './admin-config.js';
import { AdminLoginThrottle } from './admin-login-throttle.js';
import {
  AdminSessionService,
  adminSessionView,
  type AdminContext,
} from './admin-session.service.js';
import { ADMIN_COOKIE } from './admin.constants.js';
import { AdminOnly, AdminPublic, CurrentAdmin } from './admin.guard.js';
import { AdminLoginDto, AdminSessionViewDto } from './dto/admin-auth.dto.js';

@ApiTags('admin')
@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly admin: AdminConfig,
    private readonly sessions: AdminSessionService,
    private readonly throttle: AdminLoginThrottle,
    private readonly audit: AdminAuditLog,
  ) {}

  @ApiOperation({
    summary: '관리자 로그인',
    description:
      'env ADMIN_USERNAME·ADMIN_PASSWORD_HASH와 비교(아이디 상수 시간 비교 + scrypt). 비밀번호 확인 전에 IP당·전체 시도를 센다. 성공하면 __Host-yj_admin 쿠키(HttpOnly·Secure·SameSite=Strict).',
  })
  @ApiOkResponse({ type: AdminSessionViewDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(401, 'ADMIN_LOGIN_FAILED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @ApiErrorResponse(429, 'ADMIN_LOGIN_RATE_LIMITED')
  @AdminPublic()
  @StrictThrottle()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() body: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminSessionView> {
    const now = new Date();
    const ipKey = AdminLoginThrottle.ipKey(this.audit.ipHash(req));
    try {
      await this.throttle.consume(ipKey, now);
    } catch (error) {
      if (error instanceof AppException) {
        await this.audit.recordQuietly(req, 'ADMIN_LOGIN_FAILED', {
          resourceType: 'ADMIN',
          details: { reason: 'RATE_LIMITED' },
        });
      }
      throw error;
    }
    if (!(await this.admin.verify(body.username, body.password))) {
      await this.audit.recordQuietly(req, 'ADMIN_LOGIN_FAILED', {
        resourceType: 'ADMIN',
        details: { reason: 'BAD_CREDENTIALS' },
      });
      throw AppException.of('ADMIN_LOGIN_FAILED');
    }
    await this.throttle.reset(ipKey);
    // 접근 기록을 먼저 쓴다. 실패하면 세션을 주지 않는다(fail closed)
    await this.audit.record(req, 'ADMIN_LOGIN', { resourceType: 'ADMIN' });
    // 세션 고정 방지: 들고 온 관리자 쿠키가 있으면 폐기하고 새로 발급한다
    await this.sessions.revokeCurrent(req, undefined, now);
    return adminSessionView(await this.sessions.issue(res, now));
  }

  @ApiOperation({
    summary: '관리자 로그아웃',
    description: '이 세션을 서버에서 폐기하고 쿠키를 지운다',
  })
  @ApiCookieAuth(ADMIN_COOKIE)
  @ApiNoContentResponse()
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @AdminOnly()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revokeCurrent(req, res);
    await this.audit.recordQuietly(req, 'ADMIN_LOGOUT', {
      resourceType: 'ADMIN',
    });
  }

  @ApiOperation({
    summary: '관리자 세션 확인',
    description:
      '유효하면 만료 시각(유휴·절대). 부를 때마다 유휴 만료가 늦춰진다',
  })
  @ApiCookieAuth(ADMIN_COOKIE)
  @ApiOkResponse({ type: AdminSessionViewDto })
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @AdminOnly()
  @Get('session')
  session(@CurrentAdmin() admin: AdminContext): AdminSessionView {
    return adminSessionView(admin);
  }
}
