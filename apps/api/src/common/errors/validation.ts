import { ValidationPipe, type ValidationError } from '@nestjs/common';
import type { FieldError } from '@yeojeong/shared';
import { ValidationFailedError } from './app-exception.js';

// 화면이 폼 전체에 오류를 표시할 수 있게 첫 오류에서 멈추지 않고(stopAtFirstError 미사용) 모두 모은다
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new ValidationFailedError(toFieldErrors(errors)),
  });
}

export function toFieldErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = Object.entries(error.constraints ?? {}).map(
      ([code, message]) => ({ path, code, message }),
    );
    return [...own, ...toFieldErrors(error.children ?? [], path)];
  });
}
