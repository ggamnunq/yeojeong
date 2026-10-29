import {
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IS_ADMIN_ROUTE_KEY } from '../common/auth/index.js';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { AdminConfig } from './admin-config.js';
import {
  AdminSessionService,
  type AdminContext,
} from './admin-session.service.js';

/**
 * 관리자 세션 확인. 쿠키 __Host-yj_admin만 본다(사용자 세션 yj_session은 보지 않는다).
 * 관리자 기능이 꺼져 있으면 404, 세션이 없거나 만료·폐기면 401 ADMIN_UNAUTHENTICATED(쿠키를 지운다).
 */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly admin: AdminConfig,
    private readonly sessions: AdminSessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.admin.enabled) throw new NotFoundError();
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const session = await this.sessions.resolve(
      req,
      http.getResponse<Response>(),
    );
    if (!session) throw AppException.of('ADMIN_UNAUTHENTICATED');
    req.admin = session;
    return true;
  }
}

/**
 * 관리자 세션이 있어야 하는 라우트. 전역 AuthGuard·ConsentGuard(사용자 세션)를 건너뛰고 AdminSessionGuard가 막는다.
 * CSRF(Origin)·rate limit·origin lock은 그대로 걸린다.
 */
export const AdminOnly = () =>
  applyDecorators(
    SetMetadata(IS_ADMIN_ROUTE_KEY, true),
    UseGuards(AdminSessionGuard),
  );

/** 관리자 로그인처럼 세션 없이 부르는 관리자 라우트(사용자 세션도 읽지 않는다). 핸들러가 직접 인증한다 */
export const AdminPublic = () => SetMetadata(IS_ADMIN_ROUTE_KEY, true);

/** AdminSessionGuard가 붙인 관리자 세션 */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminContext => {
    const admin = ctx.switchToHttp().getRequest<Request>().admin;
    if (!admin) throw AppException.of('ADMIN_UNAUTHENTICATED');
    return admin;
  },
);
