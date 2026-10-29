import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AppException } from '../common/errors/app-exception.js';
import { clientErrorBodyLimit } from './client-error-body-limit.js';
import { maskClientErrorMessage } from './client-error-mask.js';
import { FixedWindowLimiter } from './client-error-rate-limiter.js';
import type { ClientErrorReportDto } from './client-error.dto.js';
import {
  CLIENT_ERROR_INSTANCE_LIMIT_PER_MIN,
  CLIENT_ERROR_USER_LIMIT_PER_MIN,
  ClientErrorsService,
} from './client-errors.service.js';

const report = (
  overrides: Partial<ClientErrorReportDto> = {},
): ClientErrorReportDto => ({
  buildId: 'ccd404d9a1b2',
  route: '/trips/new',
  source: 'boundary',
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'members')",
  stack: ['NewTripPage-B3x9aQ.js:1:2345'],
  userAgent: 'Safari 18 / iOS 18',
  chunk: false,
  staleBuild: true,
  ...overrides,
});

describe('maskClientErrorMessage', () => {
  it.each([
    ['card 4111 1111 1111 1111 rejected', 'card [CARD] rejected'],
    ['pan=4111111111111111', 'pan=[CARD]'],
    ['user traveler@example.com', 'user [EMAIL]'],
    ['trip 3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', 'trip [ID]'],
    ['amount 125000, phone 01012345678', 'amount [NUM], phone [NUM]'],
    ['invite K7M2QX', 'invite [CODE]'],
    ['/join#code=K7M2QX', '/join#code=[REDACTED]'],
    [
      'Failed to fetch dynamically imported module: https://jinyeojeong.com/assets/A-1.js?x=1#code=Z',
      'Failed to fetch dynamically imported module: …/A-1.js',
    ],
    [
      'Unexpected token, "secret json" is not valid',
      'Unexpected token, "[STR]" is not valid',
    ],
    ['line1\nline2\u2028\u0000end', 'line1 line2 end'],
  ])('%s', (input, expected) => {
    expect(maskClientErrorMessage(input)).toBe(expected);
  });

  it('500자로 자른다', () => {
    expect(maskClientErrorMessage('word '.repeat(300))).toHaveLength(500);
  });
});

describe('FixedWindowLimiter', () => {
  it('창 안에서 한도까지만, 창이 지나면 다시', () => {
    const limiter = new FixedWindowLimiter(2, 1000);
    expect([0, 1, 2].map(() => limiter.take('a', 0))).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiter.take('b', 0)).toBe(true);
    expect(limiter.take('a', 1000)).toBe(true);
  });

  it('키가 상한을 넘으면 만료된 것부터 지우고, 그래도 많으면 비운다', () => {
    const limiter = new FixedWindowLimiter(1, 1000, 3);
    limiter.take('a', 0);
    limiter.take('b', 0);
    limiter.take('c', 0);
    limiter.take('d', 2000); // a·b·c 만료 → 지운다
    expect(limiter.size).toBe(1);
    limiter.take('e', 2000);
    limiter.take('f', 2000);
    limiter.take('g', 2000); // 만료된 것이 없어 비운다
    expect(limiter.size).toBe(1);
  });
});

describe('ClientErrorsService', () => {
  const create = (env: Record<string, string> = {}) =>
    new ClientErrorsService(new ConfigService(env));
  const KEY = 'k'.repeat(40);

  it('구조화 로그(error, event=client_error) 한 줄. 메시지는 다시 가리고 userId 대신 userRef', () => {
    const service = create({ USER_REF_HMAC_KEY: KEY });
    const spy = vi
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => {});
    const userId = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

    expect(
      service.record(report({ message: 'bad card 4111111111111111' }), {
        userId,
      }),
    ).toBe('logged');

    expect(spy).toHaveBeenCalledWith(
      {
        event: 'client_error',
        buildId: 'ccd404d9a1b2',
        route: '/trips/new',
        source: 'boundary',
        errorName: 'TypeError',
        errorMessage: 'bad card [CARD]',
        stack: ['NewTripPage-B3x9aQ.js:1:2345'],
        clientUserAgent: 'Safari 18 / iOS 18',
        chunk: false,
        staleBuild: true,
        userRef: service.userRef(userId),
      },
      'client_error TypeError /trips/new',
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain(userId);
  });

  it('route에 실제 ID·숫자가 실려 와도 가린다', () => {
    const service = create();
    const spy = vi
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => {});
    service.record(
      report({
        route: '/trips/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/import/0306',
      }),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/trips/[ID]/import/[NUM]' }),
      'client_error TypeError /trips/[ID]/import/[NUM]',
    );
  });

  it('userRef: 16자 hex, 같은 사용자는 같고 키가 다르면 다르다. 동의 기록 userRefHash(HMAC(userId))와 다르다', async () => {
    const { createHmac } = await import('node:crypto');
    const a = create({ USER_REF_HMAC_KEY: KEY });
    const b = create({ USER_REF_HMAC_KEY: 'z'.repeat(40) });
    const ref = a.userRef('user-1');
    expect(ref).toMatch(/^[0-9a-f]{16}$/);
    expect(a.userRef('user-1')).toBe(ref);
    expect(a.userRef('user-2')).not.toBe(ref);
    expect(b.userRef('user-1')).not.toBe(ref);
    const consentRef = createHmac('sha256', KEY).update('user-1').digest('hex');
    expect(consentRef.startsWith(ref)).toBe(false);
    // 키가 없는 로컬도 값은 만든다
    expect(create().userRef('user-1')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('사용자당 1분 한도를 넘으면 429 RATE_LIMITED', () => {
    const service = create({ USER_REF_HMAC_KEY: KEY });
    vi.spyOn(
      (service as unknown as { logger: { error: () => void } }).logger,
      'error',
    ).mockImplementation(() => {});
    for (let i = 0; i < CLIENT_ERROR_USER_LIMIT_PER_MIN; i++) {
      service.record(report(), { userId: 'u1', now: 0 });
    }
    expect(() => service.record(report(), { userId: 'u1', now: 0 })).toThrow(
      AppException,
    );
    // 다른 사용자·비로그인은 영향 없음, 1분 뒤 풀린다
    expect(service.record(report(), { userId: 'u2', now: 0 })).toBe('logged');
    expect(service.record(report(), { now: 0 })).toBe('logged');
    expect(service.record(report(), { userId: 'u1', now: 60_000 })).toBe(
      'logged',
    );
  });

  it('인스턴스 1분 상한을 넘으면 남기지 않고 버린다', () => {
    const service = create();
    const spy = vi
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => {});
    for (let i = 0; i < CLIENT_ERROR_INSTANCE_LIMIT_PER_MIN; i++) {
      service.record(report(), { now: 0 });
    }
    expect(service.record(report(), { now: 0 })).toBe('dropped');
    expect(spy).toHaveBeenCalledTimes(CLIENT_ERROR_INSTANCE_LIMIT_PER_MIN);
  });
});

describe('clientErrorBodyLimit', () => {
  function run(path: string, headers: Record<string, string>) {
    const res = {
      locals: {} as Record<string, unknown>,
      statusCode: 200,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    const next = vi.fn();
    clientErrorBodyLimit(100)(
      { path, headers } as unknown as Request,
      res as unknown as Response,
      next as NextFunction,
    );
    return { res, next };
  }

  it('상한 안이면 통과, 다른 경로는 보지 않는다', () => {
    expect(
      run('/api/client-errors', { 'content-length': '100' }).next,
    ).toHaveBeenCalled();
    expect(
      run('/api/trips', { 'content-length': '999999' }).next,
    ).toHaveBeenCalled();
  });

  it.each([
    ['/api/client-errors', { 'content-length': '101' }],
    ['/api/client-errors/', { 'content-length': '101' }],
    ['/API/Client-Errors', { 'content-length': '101' }],
    ['/api/client-errors', { 'transfer-encoding': 'chunked' }],
    ['/api/client-errors', { 'content-length': 'abc' }],
  ])('%s %j → 413 PAYLOAD_TOO_LARGE', (path, headers) => {
    const { res, next } = run(path, headers);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(res.locals.errorCode).toBe('PAYLOAD_TOO_LARGE');
  });
});
