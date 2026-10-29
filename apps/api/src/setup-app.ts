import type { NestApplicationOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Logger as PinoInstance } from 'pino';
import { clientErrorBodyLimit } from './client-errors/client-error-body-limit.js';
import { createHttpLogger } from './common/logging/http-logger.js';
import { PINO_LOGGER } from './common/logging/logging.module.js';
import { REQUEST_ID_HEADER } from './common/logging/request-id.js';
import { originLock } from './common/origin-lock.js';
import { setupSwagger } from './common/swagger.js';
import { parseWebOrigins } from './common/web-origins.js';

export const APP_OPTIONS: NestApplicationOptions = {
  // 기본 파서(json + urlencoded)를 끄고 JSON만 받는다. 폼 전송으로 들어오는 CSRF 경로를 줄인다.
  bodyParser: false,
  // 시작 로그도 pino로 나가게 useLogger 전까지 모아 둔다
  bufferLogs: true,
};

export function setupApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('api');
  app.set('trust proxy', trustProxyHops(config));
  // 요청 ID와 요청 로그는 맨 앞에 둬서 origin lock 403, 본문 413도 남게 한다
  app.use(createHttpLogger(app.get<PinoInstance>(PINO_LOGGER)));
  app.use(helmet());

  // 운영(Cloud Run)에서만 설정한다. 비어 있으면 로컬 개발처럼 잠그지 않는다.
  const originSecret = config.get<string>('ORIGIN_SECRET');
  if (originSecret) {
    app.use(originLock(originSecret));
  }

  // 화면 오류 보고(/api/client-errors)는 로그인 없이 열려 있어 본문을 8KB로 더 좁힌다. 전역 파서보다 먼저 둔다
  app.use(clientErrorBodyLimit());
  app.useBodyParser('json', { limit: '100kb' });

  // 화면과 API가 같은 origin(jinyeojeong.com)이라 운영에서는 비워 둔다
  const origins = parseWebOrigins(config.get<string>('WEB_ORIGIN'));
  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      credentials: true,
      exposedHeaders: [REQUEST_ID_HEADER],
    });
  }

  if (config.get<string>('NODE_ENV') !== 'production') {
    setupSwagger(app);
  }
}

// Cloud Run은 Google 프런트엔드가 X-Forwarded-For 맨 끝에 접속한 IP를 붙여 넘긴다(K_SERVICE로 감지).
// 운영에서는 그 IP가 Cloudflare Worker의 것이라, 실제 클라이언트 IP는 originLock이 x-client-ip로 채운다.
// 이 값은 ORIGIN_SECRET 없이 띄웠을 때만 쓰인다. docs/security.md 참고.
function trustProxyHops(config: ConfigService): number {
  const configured = config.get<string>('TRUST_PROXY_HOPS');
  if (configured === undefined || configured === '') {
    return config.get<string>('K_SERVICE') ? 1 : 0;
  }
  const hops = Number(configured);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(
      `TRUST_PROXY_HOPS는 0 이상의 정수여야 합니다: ${configured}`,
    );
  }
  return hops;
}
