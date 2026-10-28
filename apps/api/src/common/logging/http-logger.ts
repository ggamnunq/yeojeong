import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { pinoHttp, type HttpLogger } from 'pino-http';
import { assignRequestId } from './request-id.js';

const HEALTH_PATH = '/api/health';
const MAX_FIELD_LENGTH = 256;
const CF_RAY = /^[\w-]{1,64}$/;

/**
 * 요청마다 한 줄을 남긴다: method, path(쿼리 제외), status, 소요 ms, requestId, cfRay, ip, userAgent.
 * 본문과 헤더는 남기지 않는다. req.log에는 requestId가 붙어 그 요청 안의 모든 로그에 함께 찍힌다.
 */
export function createHttpLogger(
  logger: Logger,
): HttpLogger<Request, Response> {
  return pinoHttp<Request, Response>({
    logger,
    genReqId: assignRequestId,
    quietReqLogger: true,
    quietResLogger: true,
    wrapSerializers: false,
    customAttributeKeys: { reqId: 'requestId' },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      // Cloud Run 헬스 체크 소음은 운영 레벨(info)에서 보이지 않게 한다
      return pathOf(req) === HEALTH_PATH ? 'debug' : 'info';
    },
    customSuccessMessage: requestMessage,
    customErrorMessage: requestMessage,
    customSuccessObject: requestFields,
    customErrorObject: (req, res, _err, value) =>
      requestFields(req, res, value),
  });
}

function requestMessage(req: Request, res: Response) {
  return `${req.method} ${pathOf(req)} ${res.statusCode}`;
}

function requestFields(
  req: Request,
  res: Response,
  value: { responseTime?: number },
) {
  const cfRay = req.headers['cf-ray'];
  return {
    method: req.method,
    path: pathOf(req),
    status: res.statusCode,
    responseTimeMs: value.responseTime,
    // origin lock이 Worker가 넘긴 클라이언트 IP로 바꿔 둔 값
    ip: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, MAX_FIELD_LENGTH),
    cfRay: typeof cfRay === 'string' && CF_RAY.test(cfRay) ? cfRay : undefined,
    errorCode: (res.locals as { errorCode?: string } | undefined)?.errorCode,
    aborted: res.writableEnded ? undefined : true,
  };
}

function pathOf(req: Request) {
  return (req.originalUrl || req.url).split('?')[0].slice(0, MAX_FIELD_LENGTH);
}
