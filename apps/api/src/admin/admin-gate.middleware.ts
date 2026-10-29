import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../common/errors/index.js';
import { AdminConfig } from './admin-config.js';

/**
 * /api/admin/* 앞단(Nest 미들웨어 — 가드보다 먼저 돈다).
 * - 관리자 env가 없으면 어떤 메서드·경로든 없는 라우트와 똑같은 404(CSRF 403 등으로 경로가 있다는 것조차 드러내지 않는다. 헤더도 붙이지 않는다)
 * - 켜져 있으면 응답(에러 포함)에 Cache-Control: no-store · X-Robots-Tag: noindex를 붙인다
 */
@Injectable()
export class AdminGateMiddleware implements NestMiddleware {
  constructor(private readonly admin: AdminConfig) {}

  use(_req: Request, res: Response, next: NextFunction) {
    if (!this.admin.enabled) throw new NotFoundError();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  }
}
