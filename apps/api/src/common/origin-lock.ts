import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { ERRORS, type ApiErrorBody } from '@yeojeong/shared';
import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from './logging/request-id.js';

const AUTH_HEADER = 'x-origin-auth';
const CLIENT_IP_HEADER = 'x-client-ip';
const MIN_SECRET_LENGTH = 32;

/**
 * Cloudflare Worker(jinyeojeong.com/api/*)를 거친 요청만 받는다.
 * Worker는 ORIGIN_SECRET을 x-origin-auth로, Cloudflare 엣지가 확인한 클라이언트 IP를 x-client-ip로 넘긴다.
 * 비밀값이 맞을 때만 x-client-ip를 믿고 req.ip(rate limit 기준)를 그 값으로 바꾼다.
 */
export function originLock(secret: string) {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`ORIGIN_SECRET은 ${MIN_SECRET_LENGTH}자 이상이어야 합니다`);
  }
  const expected = digest(secret);

  return (req: Request, res: Response, next: NextFunction) => {
    // Scheduler는 Cloud Run URL을 직접 호출한다. 뒤의 @InternalJob 가드가 OIDC를 검증한다.
    if (req.path.startsWith('/api/internal/')) {
      next();
      return;
    }
    const provided = req.headers[AUTH_HEADER];
    if (
      typeof provided !== 'string' ||
      !timingSafeEqual(digest(provided), expected)
    ) {
      // Nest 밖의 미들웨어라 전역 필터를 거치지 않으므로 같은 형식으로 직접 쓴다
      const body: ApiErrorBody = {
        code: 'FORBIDDEN',
        message: ERRORS.FORBIDDEN.message,
        requestId: getRequestId(req),
      };
      res.locals.errorCode = body.code;
      res.status(403).json(body);
      return;
    }
    delete req.headers[AUTH_HEADER];

    const clientIp = req.headers[CLIENT_IP_HEADER];
    if (typeof clientIp === 'string' && isIP(clientIp)) {
      Object.defineProperty(req, 'ip', {
        value: clientIp,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
}

// 길이가 다른 값도 같은 길이로 비교해 비교 시간으로 비밀값 길이가 드러나지 않게 한다
function digest(value: string) {
  return createHash('sha256').update(value).digest();
}
