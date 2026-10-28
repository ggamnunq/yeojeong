import {
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ERRORS,
  type ApiErrorBody,
  type ApiErrorDetails,
  type ErrorCode,
  type FieldError,
} from '@yeojeong/shared';

// Swagger 문서용 스키마. 실제 타입은 @yeojeong/shared에 있다.
export class FieldErrorDto implements FieldError {
  @ApiProperty({ example: 'title' })
  path: string;

  @ApiPropertyOptional({
    description: 'class-validator 제약 이름',
    example: 'maxLength',
  })
  code?: string;

  @ApiProperty({
    example: 'title must be shorter than or equal to 20 characters',
  })
  message: string;
}

export class ApiErrorBodyDto implements ApiErrorBody {
  @ApiProperty({
    enum: Object.keys(ERRORS),
    enumName: 'ErrorCode',
    example: 'NOT_FOUND',
  })
  code: ErrorCode;

  @ApiProperty({
    description: '화면에 그대로 보여도 되는 한국어 한 문장',
    example: ERRORS.NOT_FOUND.message,
  })
  message: string;

  @ApiPropertyOptional({
    type: 'object',
    description: 'VALIDATION_FAILED면 fields에 필드별 오류가 모두 담긴다',
    properties: {
      fields: { type: 'array', items: { $ref: getSchemaPath(FieldErrorDto) } },
    },
    additionalProperties: true,
  })
  details?: ApiErrorDetails;

  @ApiProperty({
    format: 'uuid',
    description: '응답 헤더 x-request-id와 같은 값. 서버 로그를 찾을 때 쓴다',
  })
  requestId: string;
}

/** 엔드포인트가 돌려줄 수 있는 에러를 문서에 적는다. 예: @ApiErrorResponse(404, 'TRIP_NOT_FOUND') */
export const ApiErrorResponse = (status: number, ...codes: ErrorCode[]) =>
  ApiResponse({
    status,
    type: ApiErrorBodyDto,
    description: codes.length > 0 ? codes.join(', ') : undefined,
  });
