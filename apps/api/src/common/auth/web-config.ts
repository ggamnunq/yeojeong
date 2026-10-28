import { ConfigService } from '@nestjs/config';
import { parseWebOrigins } from '../web-origins.js';

/** 화면 주소와 관련된 설정. 시작할 때 한 번 검증하고 값이 없거나 틀리면 부팅을 멈춘다 */
export class WebConfig {
  /** 화면 주소(리다이렉트 대상). 예: https://jinyeojeong.com, 로컬 http://localhost:5173 */
  readonly baseUrl: URL;
  /** 상태 변경 요청(POST·PUT·PATCH·DELETE)을 받아 줄 Origin 목록 */
  readonly allowedOrigins: readonly string[];
  /** 쿠키 Secure 속성. 운영이거나 화면이 https면 켠다 */
  readonly secureCookies: boolean;

  constructor(config: ConfigService) {
    const raw = config.get<string>('WEB_BASE_URL');
    if (!raw) {
      throw new Error('WEB_BASE_URL이 필요합니다 (예: http://localhost:5173)');
    }
    const [origin] = parseWebOrigins(raw.replace(/\/$/, ''));
    if (!origin) throw new Error(`WEB_BASE_URL 형식이 잘못됐습니다: ${raw}`);
    this.baseUrl = new URL(origin);
    this.allowedOrigins = [
      ...new Set([
        origin,
        ...parseWebOrigins(config.get<string>('WEB_ORIGIN')),
      ]),
    ];
    this.secureCookies =
      config.get<string>('NODE_ENV') === 'production' ||
      this.baseUrl.protocol === 'https:';
  }

  /** 화면 경로 → 절대 URL */
  url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }
}
