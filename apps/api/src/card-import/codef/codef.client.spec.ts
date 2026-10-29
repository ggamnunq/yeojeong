import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { codefHttpMock, codefResult } from '../../../test/fakes/codef-http.js';
import { AppException } from '../../common/errors/index.js';
import {
  CodefClient,
  MAX_RESPONSE_BYTES,
  decodeCodefBody,
} from './codef.client.js';
import { CodefConfig } from './codef.config.js';
import { CODEF_PATHS } from './codef.constants.js';

const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'spki', format: 'pem' })
  .toString();
const config = new CodefConfig(
  new ConfigService({
    CODEF_ENV: 'development',
    CODEF_CLIENT_ID: 'id',
    CODEF_CLIENT_SECRET: 'secret',
    CODEF_PUBLIC_KEY: pem,
  }),
);

describe('CodefClient', () => {
  it('normalizes env and public key', () => {
    expect(config.apiHost).toBe('https://development.codef.io');
    expect(config.publicKey).toBe(
      pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, ''),
    );
    expect(config.modulusBytes).toBe(256);
    expect(config.publicKeyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(
      () =>
        new CodefConfig(new ConfigService({ CODEF_PUBLIC_KEY: 'AAAABBBB' })),
    ).toThrow(/RSA/);
    expect(config.loginMode).toBe('direct');
    expect(
      () => new CodefConfig(new ConfigService({ CODEF_ENV: 'prod' })),
    ).toThrow(/CODEF_ENV/);
  });

  it('decodes plain and URL-encoded bodies (+ is a space)', () => {
    expect(decodeCodefBody('{"a":1}')).toEqual({ a: 1 });
    expect(decodeCodefBody(encodeURIComponent('{"a":"b c"}'))).toEqual({
      a: 'b c',
    });
    expect(decodeCodefBody('%7B%22a%22%3A%22b+c%22%7D')).toEqual({ a: 'b c' });
  });

  it('sends a URL-encoded JSON body with a cached bearer token', async () => {
    const http = codefHttpMock(
      { [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []) },
      { urlEncodeResponse: true },
    );
    const client = new CodefClient(config, http.fetch);
    const res = await client.request(CODEF_PATHS.CARD_APPROVAL_LIST, {
      password: 'ab+/c==',
    });
    await client.request(CODEF_PATHS.CARD_APPROVAL_LIST, {});
    expect(res.result.code).toBe('CF-00000');
    expect(http.tokenRequests()).toBe(1);
    expect(http.calls[0].body).toEqual({ password: 'ab+/c==' });
    expect(http.calls[0].url).toBe(
      'https://development.codef.io/v1/kr/card/p/account/approval-list',
    );
  });

  it('re-issues the token once on a token error code', async () => {
    const http = codefHttpMock({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: (_b, n) =>
        codefResult(n === 0 ? 'CF-00401' : 'CF-00000', []),
    });
    const client = new CodefClient(config, http.fetch);
    const res = await client.request(CODEF_PATHS.CARD_APPROVAL_LIST, {});
    expect(res.result.code).toBe('CF-00000');
    expect(http.tokenRequests()).toBe(2);
  });

  it('turns network failures and malformed bodies into CARD_IMPORT_FAILED without the cause', async () => {
    const http = codefHttpMock({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
        new TypeError('fetch failed id=leak'),
      [CODEF_PATHS.ACCOUNT_DELETE]: () => ({ nope: true }),
    });
    const client = new CodefClient(config, http.fetch);
    const error = await client
      .request(CODEF_PATHS.CARD_APPROVAL_LIST, { id: 'leak' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('CARD_IMPORT_FAILED');
    expect((error as Error).cause).toBeUndefined();
    await expect(
      client.request(CODEF_PATHS.ACCOUNT_DELETE, {}),
    ).rejects.toMatchObject({
      code: 'CARD_IMPORT_FAILED',
    });
  });

  it('refuses account mode in production without CODEF_ALLOW_ACCOUNT_MODE (L5)', () => {
    const make = (env: Record<string, string>) =>
      new CodefConfig({
        get: (name: string) => env[name],
      } as unknown as ConfigService);
    expect(make({ CODEF_LOGIN_MODE: 'account' }).loginMode).toBe('account');
    expect(
      make({ NODE_ENV: 'production', CODEF_LOGIN_MODE: 'account' }).loginMode,
    ).toBe('direct');
    expect(
      make({
        NODE_ENV: 'production',
        CODEF_LOGIN_MODE: 'account',
        CODEF_ALLOW_ACCOUNT_MODE: 'true',
      }).loginMode,
    ).toBe('account');
  });

  it('caps the response body at 5MB and counts only account deletes toward the budget (L8·M1)', async () => {
    const big = 'x'.repeat(MAX_RESPONSE_BYTES + 1);
    const fetchFn = vi.fn((input: string | URL | Request) =>
      Promise.resolve(
        (input instanceof Request ? input.url : input.toString()).includes(
          'oauth',
        )
          ? new Response(JSON.stringify({ access_token: 't', expires_in: 600 }))
          : new Response(big),
      ),
    );
    const counter = { recordCodefCall: vi.fn().mockResolvedValue(undefined) };
    const client = new CodefClient(
      config,
      fetchFn as unknown as typeof fetch,
      counter,
    );
    await expect(
      client.request(CODEF_PATHS.CARD_APPROVAL_LIST, {}),
    ).rejects.toMatchObject({ code: 'CARD_IMPORT_FAILED' });
    expect(counter.recordCodefCall).not.toHaveBeenCalled();
    const ok = codefHttpMock({
      [CODEF_PATHS.ACCOUNT_DELETE]: () => codefResult('CF-00000', {}),
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []),
    });
    const counted = new CodefClient(config, ok.fetch, counter);
    await counted.request(CODEF_PATHS.CARD_APPROVAL_LIST, {});
    await counted.request(CODEF_PATHS.ACCOUNT_DELETE, {});
    expect(counter.recordCodefCall).toHaveBeenCalledTimes(1);
  });
});
