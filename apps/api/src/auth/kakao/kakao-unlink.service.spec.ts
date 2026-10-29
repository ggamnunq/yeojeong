import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  KakaoUnlinkConfig,
  KakaoUnlinkService,
} from './kakao-unlink.service.js';

const KEY = 'kakao-admin-key-0123456789abcdef';

const config = (env: Record<string, string>) =>
  new KakaoUnlinkConfig(new ConfigService(env));

const service = (env: Record<string, string>) =>
  new KakaoUnlinkService({} as never, config(env), {} as never);

const req = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as unknown as Request;

describe('KakaoUnlinkConfig', () => {
  beforeEach(() => {
    vi.stubEnv('KAKAO_ADMIN_KEY', undefined);
    vi.stubEnv('KAKAO_APP_ID', undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is disabled without a key and validates the format of what is set', () => {
    expect(config({}).enabled).toBe(false);
    expect(config({ KAKAO_ADMIN_KEY: KEY }).enabled).toBe(true);
    expect(() => config({ KAKAO_ADMIN_KEY: 'short' })).toThrow(
      /KAKAO_ADMIN_KEY/,
    );
    expect(() => config({ KAKAO_ADMIN_KEY: `${KEY} x` })).toThrow();
    expect(() => config({ KAKAO_ADMIN_KEY: KEY, KAKAO_APP_ID: 'abc' })).toThrow(
      /KAKAO_APP_ID/,
    );
  });

  it('keeps only a digest of the key, never the key itself', () => {
    const c = config({ KAKAO_ADMIN_KEY: KEY });
    expect(JSON.stringify(c)).not.toContain(KEY);
  });
});

describe('KakaoUnlinkService.authenticate', () => {
  beforeEach(() => {
    vi.stubEnv('KAKAO_ADMIN_KEY', undefined);
    vi.stubEnv('KAKAO_APP_ID', undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('404 when disabled, 401 on wrong key / scheme / app id, passes on match', () => {
    expect(() => service({}).assertEnabled()).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    const s = service({ KAKAO_ADMIN_KEY: KEY, KAKAO_APP_ID: '42' });
    expect(() => s.authenticate(req(`KakaoAK ${KEY}`), '42')).not.toThrow();
    for (const [auth, appId] of [
      [undefined, '42'],
      [`KakaoAK ${KEY}0`, '42'],
      [`Bearer ${KEY}`, '42'],
      [`KakaoAK ${KEY}`, '43'],
      [`KakaoAK ${KEY}`, null],
    ] as const) {
      expect(() => s.authenticate(req(auth), appId)).toThrow(
        expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      );
    }
    // 앱 ID를 설정하지 않으면 키만 본다
    expect(() =>
      service({ KAKAO_ADMIN_KEY: KEY }).authenticate(
        req(`KakaoAK ${KEY}`),
        null,
      ),
    ).not.toThrow();
  });
});
