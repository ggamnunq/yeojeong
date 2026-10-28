import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorBody } from '@yeojeong/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma/client.js';
import { getRequestId } from '../logging/request-id.js';
import { resolveError, type ResolvedError } from './resolve-error.js';

/**
 * 모든 예외를 { code, message, details, requestId }로 응답한다.
 * 5xx는 스택과 함께 error로 남기고, 4xx는 요청 로그 한 줄에 errorCode로만 남긴다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly fallbackLogger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const error = resolveError(exception);
    this.log(req, exception, error);
    res.locals.errorCode = error.code;

    if (res.headersSent) {
      res.end();
      return;
    }
    const body: ApiErrorBody = {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      requestId: getRequestId(req),
    };
    res.status(error.status).json(body);
  }

  private log(req: Request, exception: unknown, error: ResolvedError) {
    // req.log는 요청 로그 미들웨어가 붙인 것으로 requestId가 들어 있다
    const logger: LogTarget = req.log ?? this.fallbackLogger;
    const fields = {
      context: AllExceptionsFilter.name,
      errorCode: error.code,
      status: error.status,
      ...error.logFields,
    };
    if (error.unexpected) {
      logger.error(
        { ...fields, err: loggable(exception) },
        '처리하지 못한 예외',
      );
    } else if (error.logFields) {
      logger.warn(fields, 'DB 오류를 응답 코드로 바꿈');
    }
  }
}

interface LogTarget {
  error(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

// Prisma 오류의 meta에는 입력값이 섞일 수 있어 빼고 남긴다
function loggable(exception: unknown) {
  if (
    exception instanceof Prisma.PrismaClientKnownRequestError ||
    exception instanceof Prisma.PrismaClientUnknownRequestError ||
    exception instanceof Prisma.PrismaClientValidationError
  ) {
    return {
      type: exception.name,
      message: exception.message,
      stack: exception.stack,
    };
  }
  return exception;
}
