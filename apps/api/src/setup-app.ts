import type { NestApplicationOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { parseWebOrigins } from './common/web-origins.js';

// 기본 파서(json + urlencoded)를 끄고 JSON만 받는다. 폼 전송으로 들어오는 CSRF 경로를 줄인다.
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

export function setupApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.set('trust proxy', trustProxyHops(config));
  app.use(helmet());
  app.useBodyParser('json', { limit: '100kb' });

  const origins = parseWebOrigins(config.get<string>('WEB_ORIGIN'));
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }
}

// Cloud Run은 Google 프런트엔드가 X-Forwarded-For 맨 끝에 실제 클라이언트 IP를 붙여 넘긴다(K_SERVICE로 감지).
// 앞에 프록시가 더 붙으면(예: Cloudflare) TRUST_PROXY_HOPS를 그 수만큼 올린다. docs/security.md 참고.
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
