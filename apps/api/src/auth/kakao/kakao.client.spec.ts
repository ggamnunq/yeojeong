import { ConfigService } from '@nestjs/config';
import { TEST_ENV } from '../../../test/env.js';
import { AuthConfig } from '../../common/auth/auth-config.js';
import { safeReturnTo } from '../auth.service.js';
import { generateDeletionCode } from '../../users/users.service.js';
import {
  HttpKakaoClient,
  KakaoError,
  normalizeProfileImage,
} from './kakao.client.js';

const client = new HttpKakaoClient(new AuthConfig(new ConfigService(TEST_ENV)));

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpKakaoClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds the authorize URL with the minimum scope', () => {
    const url = new URL(client.authorizeUrl('state-123'));
    expect(url.origin + url.pathname).toBe(
      'https://kauth.kakao.com/oauth/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: TEST_ENV.KAKAO_CLIENT_ID,
      redirect_uri: TEST_ENV.KAKAO_REDIRECT_URI,
      scope: 'profile_nickname,profile_image',
      state: 'state-123',
    });
  });

  it('exchanges the code with the client secret and reads the profile', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(200, { access_token: 'kakao-access' }))
      .mockResolvedValueOnce(
        json(200, {
          id: 4001234567,
          kakao_account: {
            profile: {
              nickname: ' 준용 ',
              profile_image_url: 'http://k.kakaocdn.net/dn/p.jpg',
              is_default_image: false,
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetch);

    await expect(client.fetchProfile('auth-code')).resolves.toEqual({
      id: '4001234567',
      nickname: '준용',
      profileImageUrl: 'https://k.kakaocdn.net/dn/p.jpg',
    });

    const [tokenUrl, tokenInit] = fetch.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://kauth.kakao.com/oauth/token');
    expect(Object.fromEntries(tokenInit.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      client_id: TEST_ENV.KAKAO_CLIENT_ID,
      client_secret: TEST_ENV.KAKAO_CLIENT_SECRET,
      redirect_uri: TEST_ENV.KAKAO_REDIRECT_URI,
      code: 'auth-code',
    });
    const [profileUrl, profileInit] = fetch.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(profileUrl).toBe(
      'https://kapi.kakao.com/v2/user/me?secure_resource=true',
    );
    expect(profileInit.headers).toEqual({
      Authorization: 'Bearer kakao-access',
    });
  });

  it('turns Kakao errors and network failures into KakaoError', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json(400, { error: 'invalid_grant', error_code: 'KOE320' }),
        ),
    );
    await expect(client.fetchProfile('used-code')).rejects.toMatchObject({
      stage: 'token',
      status: 400,
      kakaoCode: 'KOE320',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );
    await expect(client.fetchProfile('code')).rejects.toBeInstanceOf(
      KakaoError,
    );
  });

  it.each([
    [undefined, false, null],
    ['https://k.kakaocdn.net/a.jpg', true, null],
    ['http://k.kakaocdn.net/a.jpg', false, 'https://k.kakaocdn.net/a.jpg'],
    ['javascript:alert(1)', false, null],
    [`https://k.kakaocdn.net/${'a'.repeat(3000)}`, false, null],
  ])('normalizes profile image %s (default=%s)', (url, isDefault, expected) => {
    expect(normalizeProfileImage(url, isDefault)).toBe(expected);
  });
});

describe('safeReturnTo', () => {
  it.each(['/', '/trips/abc', '/trips/abc?tab=stats#x'])(
    'accepts %s',
    (path) => {
      expect(safeReturnTo(path)).toBe(path);
    },
  );

  it.each([
    '//evil.com',
    'https://evil.com',
    '/\\evil.com',
    'trips',
    '/api/auth/logout',
    '/a\nb',
    `/${'a'.repeat(600)}`,
    42,
  ])('rejects %s', (path) => {
    expect(safeReturnTo(path)).toBeNull();
  });
});

describe('generateDeletionCode', () => {
  it('uses the unambiguous alphabet in YJD-XXXX-XXXX-XXXX form', () => {
    const codes = new Set(Array.from({ length: 50 }, generateDeletionCode));
    expect(codes.size).toBe(50);
    for (const code of codes) {
      expect(code).toMatch(/^YJD(-[2-9A-HJKMNP-Z]{4}){3}$/);
    }
  });
});
