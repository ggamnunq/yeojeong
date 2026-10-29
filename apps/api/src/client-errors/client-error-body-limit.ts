import { ERRORS, type ApiErrorBody } from '@yeojeong/shared';
import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from '../common/logging/request-id.js';

export const CLIENT_ERRORS_PATH = '/api/client-errors';
/** 보고 본문 상한. 정상 보고는 3KB를 넘지 않는다(메시지 500자 + 스택 8줄 + 짧은 필드) */
export const CLIENT_ERROR_MAX_BODY_BYTES = 8 * 1024;

/**
 * /api/client-errors 본문 크기 상한(전역 JSON 파서 100kb보다 훨씬 작게). 전역 파서보다 먼저 붙인다(setup-app.ts).
 * Content-Length가 상한을 넘거나, 길이를 미리 알 수 없는 chunked 본문이면 읽지 않고 413 PAYLOAD_TOO_LARGE.
 * (Node HTTP 파서가 Content-Length만큼만 본문으로 읽으므로 길이를 속여도 더 읽히지 않는다)
 */
export function clientErrorBodyLimit(maxBytes = CLIENT_ERROR_MAX_BODY_BYTES) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 라우터는 대소문자·끝 슬래시를 가리지 않으므로 같은 기준으로 본다
    if (req.path.replace(/\/+$/, '').toLowerCase() !== CLIENT_ERRORS_PATH) {
      next();
      return;
    }
    const header = req.headers['content-length'];
    const length = header === undefined ? undefined : Number(header);
    const chunked = req.headers['transfer-encoding'] !== undefined;
    if (
      chunked ||
      (length !== undefined && (!Number.isFinite(length) || length > maxBytes))
    ) {
      // Nest 밖의 미들웨어라 전역 필터를 거치지 않으므로 같은 형식으로 직접 쓴다
      const body: ApiErrorBody = {
        code: 'PAYLOAD_TOO_LARGE',
        message: ERRORS.PAYLOAD_TOO_LARGE.message,
        requestId: getRequestId(req),
      };
      res.locals.errorCode = body.code;
      // 본문을 읽지 않고 답하므로 연결을 닫아 남은 본문이 다음 요청으로 섞이지 않게 한다
      res.setHeader('Connection', 'close');
      res.status(413).json(body);
      return;
    }
    next();
  };
}
