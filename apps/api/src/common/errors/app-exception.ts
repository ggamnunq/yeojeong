import { HttpException } from '@nestjs/common';
import {
  ERRORS,
  type ApiErrorDetails,
  type ErrorCode,
  type FieldError,
} from '@yeojeong/shared';

interface AppExceptionOptions {
  message?: string;
  details?: ApiErrorDetails;
  /** 로그에만 남는 원인. 응답에는 나가지 않는다 */
  cause?: unknown;
}

/**
 * 서비스 코드에서 던지는 예외. 전역 필터가 { code, message, details, requestId }로 바꿔 응답한다.
 * message와 details는 그대로 응답에 나가므로 내부 정보나 개인정보를 넣지 않는다.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: number,
    message: string,
    readonly details?: ApiErrorDetails,
    cause?: unknown,
  ) {
    super({ code, message, details }, status, { cause });
  }

  /** shared의 코드 맵(ERRORS)에 적은 기본 상태와 문구로 만든다 */
  static of(code: ErrorCode, options: AppExceptionOptions = {}) {
    const definition = ERRORS[code];
    return new AppException(
      code,
      definition.status,
      options.message ?? definition.message,
      options.details,
      options.cause,
    );
  }
}

export class ValidationFailedError extends AppException {
  constructor(fields: FieldError[], message?: string) {
    super(
      'VALIDATION_FAILED',
      400,
      message ?? ERRORS.VALIDATION_FAILED.message,
      { fields },
    );
  }
}

export class UnauthenticatedError extends AppException {
  constructor(message?: string, details?: ApiErrorDetails) {
    super(
      'UNAUTHENTICATED',
      401,
      message ?? ERRORS.UNAUTHENTICATED.message,
      details,
    );
  }
}

export class ForbiddenError extends AppException {
  constructor(message?: string, details?: ApiErrorDetails) {
    super('FORBIDDEN', 403, message ?? ERRORS.FORBIDDEN.message, details);
  }
}

export class NotFoundError extends AppException {
  constructor(message?: string, details?: ApiErrorDetails) {
    super('NOT_FOUND', 404, message ?? ERRORS.NOT_FOUND.message, details);
  }
}

export class ConflictError extends AppException {
  constructor(message?: string, details?: ApiErrorDetails) {
    super('CONFLICT', 409, message ?? ERRORS.CONFLICT.message, details);
  }
}
