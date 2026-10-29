import { ConfigService } from '@nestjs/config';
import { codefHttpMock, codefResult } from '../../../test/fakes/codef-http.js';
import { AppException } from '../../common/errors/index.js';
import { CodefClient, decodeCodefBody } from './codef.client.js';
import { CodefConfig } from './codef.config.js';
import { CODEF_PATHS } from './codef.constants.js';

const config = new CodefConfig(
  new ConfigService({
    CODEF_ENV: 'development',
    CODEF_CLIENT_ID: 'id',
    CODEF_CLIENT_SECRET: 'secret',
    CODEF_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nAAAA\nBBBB\n-----END PUBLIC KEY-----',
  }),
);

describe('CodefClient', () => {
  it('normalizes env and public key', () => {
    expect(config.apiHost).toBe('https://development.codef.io');
    expect(config.publicKey).toBe('AAAABBBB');
    expect(config.loginMode).toBe('direct');
    expect(() => new CodefConfig(new ConfigService({ CODEF_ENV: 'prod' }))).toThrow(
      /CODEF_ENV/,
    );
  });

  it('decodes plain and URL-encoded bodies (+ is a space)', () => {
    expect(decodeCodefBody('{"a":1}')).toEqual({ a: 1 });
    expect(decodeCodefBody(encodeURIComponent('{"a":"b c"}'))).toEqual({ a: 'b c' });
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
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () => new TypeError('fetch failed id=leak'),
      [CODEF_PATHS.ACCOUNT_DELETE]: () => ({ nope: true }),
    });
    const client = new CodefClient(config, http.fetch);
    const error = await client
      .request(CODEF_PATHS.CARD_APPROVAL_LIST, { id: 'leak' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('CARD_IMPORT_FAILED');
    expect((error as Error).cause).toBeUndefined();
    await expect(client.request(CODEF_PATHS.ACCOUNT_DELETE, {})).rejects.toMatchObject({
      code: 'CARD_IMPORT_FAILED',
    });
  });
});
