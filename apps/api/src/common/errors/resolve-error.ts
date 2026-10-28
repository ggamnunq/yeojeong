import { HttpException } from '@nestjs/common';
import { ERRORS, type ApiErrorDetails, type ErrorCode } from '@yeojeong/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { AppException } from './app-exception.js';

export interface ResolvedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ApiErrorDetails;
  /** 서버 결함으로 보고 error 레벨로 스택과 함께 남긴다 */
  unexpected: boolean;
  /** 응답에는 나가지 않고 로그에만 남는 값 */
  logFields?: Record<string, unknown>;
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

// 그 밖의 Prisma 오류는 코드 버그나 DB 장애로 보고 500으로 돌려준다
const CODE_BY_PRISMA_CODE: Partial<Record<string, ErrorCode>> = {
  P2002: 'CONFLICT',
  P2025: 'NOT_FOUND',
};

/**
 * 어떤 예외든 응답할 status·code·message로 바꾼다.
 * AppException이 아니면 원래 메시지를 버리고 코드별 기본 문구만 쓴다. 내부 메시지, 스택, DB 오류가 응답에 섞이지 않게 한다.
 */
export function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof AppException) {
    const status = exception.getStatus();
    return {
      status,
      code: exception.code,
      message: exception.message,
      details: exception.details,
      unexpected: status >= 500,
    };
  }

  // ValidationPipe 밖의 Nest 예외(라우트 없음 404, 가드 403, throttler 429)와 잘못된 JSON(Nest가 400으로 바꿔 줌)
  if (exception instanceof HttpException) {
    return fromStatus(exception.getStatus());
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const code = CODE_BY_PRISMA_CODE[exception.code];
    const logFields = {
      prismaCode: exception.code,
      model: exception.meta?.modelName,
    };
    if (code) {
      const { status, message } = ERRORS[code];
      return { status, code, message, unexpected: false, logFields };
    }
    return { ...internalError(), logFields };
  }

  // body-parser가 던지는 http-errors (413 본문 초과, 415 지원하지 않는 charset 등)
  if (isClientHttpError(exception)) {
    return fromStatus(exception.status);
  }

  return internalError();
}

function fromStatus(status: number): ResolvedError {
  if (status >= 500) return { ...internalError(), status };
  const code = CODE_BY_STATUS[status] ?? 'BAD_REQUEST';
  return { status, code, message: ERRORS[code].message, unexpected: false };
}

function internalError(): ResolvedError {
  const { status, message } = ERRORS.INTERNAL_ERROR;
  return { status, code: 'INTERNAL_ERROR', message, unexpected: true };
}

function isClientHttpError(
  value: unknown,
): value is { status: number; expose: true } {
  if (typeof value !== 'object' || value === null) return false;
  const { status, expose } = value as { status?: unknown; expose?: unknown };
  return (
    expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  );
}
