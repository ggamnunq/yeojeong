import { ConfigService } from '@nestjs/config';
import { TEST_ENV } from '../../../test/env.js';
import { AuthConfig } from './auth-config.js';
import { WebConfig } from './web-config.js';

const config = (overrides: Record<string, string> = {}) =>
  new ConfigService({ ...TEST_ENV, ...overrides });

describe('AuthConfig', () => {
  it('loads valid settings', () => {
    const auth = new AuthConfig(config());
    expect(auth.kakao.redirectUri).toBe(TEST_ENV.KAKAO_REDIRECT_URI);
  });

  it.each([
    'KAKAO_CLIENT_ID',
    'KAKAO_CLIENT_SECRET',
    'KAKAO_REDIRECT_URI',
    'SESSION_SECRET',
    'TOKEN_ENCRYPTION_KEY',
    'USER_REF_HMAC_KEY',
  ])('refuses to start without %s', (name) => {
    expect(() => new AuthConfig(config({ [name]: '' }))).toThrow(name);
  });

  it.each([
    ['SESSION_SECRET', 'short'],
    ['USER_REF_HMAC_KEY', 'short'],
    ['TOKEN_ENCRYPTION_KEY', Buffer.alloc(16).toString('base64')],
    ['KAKAO_REDIRECT_URI', 'not a url'],
  ])('rejects a bad %s', (name, value) => {
    expect(() => new AuthConfig(config({ [name]: value }))).toThrow(name);
  });

  it('allows an http redirect URI only outside production', () => {
    const http = {
      KAKAO_REDIRECT_URI: 'http://localhost:5173/api/auth/kakao/callback',
    };
    expect(() => new AuthConfig(config(http))).not.toThrow();
    expect(
      () => new AuthConfig(config({ ...http, NODE_ENV: 'production' })),
    ).toThrow('https');
  });

  it('hashes user references with USER_REF_HMAC_KEY', () => {
    const auth = new AuthConfig(config());
    const ref = auth.userRefHash('user-1');
    expect(ref).toMatch(/^[0-9a-f]{64}$/);
    expect(ref).toBe(auth.userRefHash('user-1'));
    expect(
      new AuthConfig(config({ USER_REF_HMAC_KEY: 'z'.repeat(32) })).userRefHash(
        'user-1',
      ),
    ).not.toBe(ref);
  });
});

describe('WebConfig', () => {
  it('derives the allowed origins and the Secure flag', () => {
    const local = new WebConfig(config());
    expect(local.allowedOrigins).toEqual(['http://localhost:5173']);
    expect(local.secureCookies).toBe(false);
    expect(local.url('/signup/nickname')).toBe(
      'http://localhost:5173/signup/nickname',
    );

    const prod = new WebConfig(
      config({ WEB_BASE_URL: 'https://jinyeojeong.com/' }),
    );
    expect(prod.allowedOrigins).toEqual(['https://jinyeojeong.com']);
    expect(prod.secureCookies).toBe(true);
  });

  it('refuses to start without a valid WEB_BASE_URL', () => {
    expect(() => new WebConfig(config({ WEB_BASE_URL: '' }))).toThrow(
      'WEB_BASE_URL',
    );
    expect(
      () => new WebConfig(config({ WEB_BASE_URL: 'https://a.com/app' })),
    ).toThrow();
  });
});
