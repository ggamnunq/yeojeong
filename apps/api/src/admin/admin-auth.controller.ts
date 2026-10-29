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
import { retryDetails } from '../card-import/card-import-limits.js';
import { AdminCredentials } from './admin-credentials.js';
import { AdminDeviceService } from './admin-device.js';
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
    private readonly sessions: AdminSessionService,
    private readonly throttle: AdminLoginThrottle,
    private readonly audit: AdminAuditLog,
    private readonly credentials: AdminCredentials,
    private readonly devices: AdminDeviceService,
  ) {}

  @ApiOperation({
    summary: '관리자 로그인',
    description:
      '아이디(상수 시간 비교) + 비밀번호(scrypt) + TOTP(재사용 금지). 확인 전에 시도를 센다(장치 쿠키 없으면 IP(/64)·전체, 있으면 그 장치만). 성공하면 기존 관리자 세션을 모두 끝내고 __Host-yj_admin(세션)·__Host-yj_admin_dev(장치, 90일) 쿠키(HttpOnly·Secure·SameSite=Strict).',
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
    // 장치 쿠키(이 브라우저로 로그인에 성공한 적 있음)가 유효하면 전체 잠금 대신 그 장치만 센다(OWASP device cookie)
    const deviceId = this.devices.read(req);
    const keys = deviceId
      ? AdminLoginThrottle.deviceKeys(deviceId)
      : AdminLoginThrottle.anonymousKeys(this.audit.rateLimitIpHash(req));
    const block = await this.throttle.consume(keys, now);
    if (block) {
      // 접근 기록은 키·창마다 처음 넘었을 때 한 번만(나머지는 admin_login_throttles.attempts로만 센다 — 기록 폭주 방지)
      if (block.first) {
        await this.audit.recordQuietly(req, 'ADMIN_LOGIN_FAILED', {
          resourceType: 'ADMIN',
          details: { reason: 'RATE_LIMITED', scope: block.scope },
        });
      }
      throw AppException.of('ADMIN_LOGIN_RATE_LIMITED', {
        details: retryDetails(block.until, now),
      });
    }
    const outcome = await this.credentials.login(
      body.username,
      body.password,
      body.totp,
    );
    if (outcome !== 'OK') {
      await this.audit.recordQuietly(req, 'ADMIN_LOGIN_FAILED', {
        resourceType: 'ADMIN',
        details: { reason: outcome, ...(deviceId && { device: 'TRUSTED' }) },
      });
      throw AppException.of('ADMIN_LOGIN_FAILED');
    }
    await this.throttle.reset(keys);
    // 접근 기록을 먼저 쓴다. 실패하면 세션을 주지 않는다(fail closed)
    await this.audit.record(req, 'ADMIN_LOGIN', { resourceType: 'ADMIN' });
    // 새로 로그인하면 기존 관리자 세션을 모두 끝낸다(다른 브라우저 포함, 세션 고정 방지)
    await this.sessions.revokeAll(now);
    this.devices.issue(res, deviceId);
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
