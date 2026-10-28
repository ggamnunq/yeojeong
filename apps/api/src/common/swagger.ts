import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorBodyDto, FieldErrorDto } from './errors/api-error.dto.js';

export const SWAGGER_PATH = 'api/docs';

// 운영(NODE_ENV=production)에서는 등록하지 않는다. setupApp 참고.
export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('여정 API')
    .setDescription(
      '성공 응답은 데이터를 그대로 돌려주고, 에러는 모두 ApiErrorBody 형식이다.',
    )
    .setVersion('0.0.1')
    // 로그인은 httpOnly 쿠키라 Swagger UI에서 직접 넣을 수 없다. 화면에서 로그인한 브라우저로 /api/docs를 열면 쿠키가 같이 간다.
    .addCookieAuth('yj_session', { type: 'apiKey' }, 'yj_session')
    .addGlobalResponse(
      {
        status: 429,
        description: 'RATE_LIMITED',
        type: ApiErrorBodyDto,
      },
      {
        status: 500,
        description: 'INTERNAL_ERROR',
        type: ApiErrorBodyDto,
      },
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ApiErrorBodyDto, FieldErrorDto],
  });
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    raw: ['json'],
  });
}
