import { ConfigService } from '@nestjs/config';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  it('writes Cloud Logging JSON in production and redacts credentials', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );

    logger.warn(
      { headers: { authorization: 'Bearer secret', cookie: 'session=secret' } },
      '헤더를 통째로 남긴 실수',
    );

    const line = JSON.parse(output) as Record<string, unknown>;
    expect(line).toMatchObject({
      severity: 'WARNING',
      message: '헤더를 통째로 남긴 실수',
      headers: { authorization: '[REDACTED]', cookie: '[REDACTED]' },
    });
    expect(line).not.toHaveProperty('level');
    expect(output).not.toContain('secret');
  });

  it('redacts card-import credentials even when a body, DTO or error is logged by mistake (S8)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const leakyError = Object.assign(new Error('CODEF 호출 실패'), {
      request: {
        loginId: 'leak-login-id',
        encryptedPassword: 'leak-cipher',
        connectedId: 'leak-connected-id',
      },
    });

    logger.error({ body: { loginId: 'leak-login-id' } }, '본문째 남긴 실수');
    logger.error(
      {
        dto: {
          organization: '0306',
          loginId: 'leak-login-id',
          encryptedPassword: 'leak-cipher',
          twoWay: { token: 'leak-two-way', code: '123456' },
        },
      },
      'DTO째 남긴 실수',
    );
    logger.error({ err: leakyError }, '에러 객체에 요청이 붙은 실수');
    logger.error(
      { codef: { data: { twoWayInfo: { jti: 'leak-jti' }, password: 'pw' } } },
      'CODEF 응답째 남긴 실수',
    );

    expect(output).not.toMatch(/leak-|"pw"|123456/);
    const lines = output
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines[0]).toMatchObject({ body: '[REDACTED]' });
    expect(lines[1]).toMatchObject({
      dto: {
        organization: '0306',
        loginId: '[REDACTED]',
        encryptedPassword: '[REDACTED]',
        twoWay: '[REDACTED]',
      },
    });
    expect(lines[2]).toMatchObject({
      err: { message: 'CODEF 호출 실패', request: { loginId: '[REDACTED]' } },
    });
  });

  it('masks by key at any depth: CODEF bodies, arrays, error causes and err.body (S8 review L1)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const cause = Object.assign(new Error('inner'), {
      request: { body: { loginId: 'leak-cause-login' } },
    });
    const outer = Object.assign(new Error('outer', { cause }), {
      body: '{"id":"leak-err-body"}',
    });

    logger.error(
      { codefBody: { id: 'leak-codef-id', organization: '0306' } },
      'a',
    );
    logger.error({ x: { accountList: [{ id: 'leak-account-id' }] } }, 'b');
    logger.error({ err: outer }, 'c');
    logger.error(
      {
        deep: {
          a: { b: { c: { d: { e: { loginCardNo: 'leak-deep-card' } } } } },
        },
      },
      'd',
    );
    logger.error(
      { list: [{ nested: [{ encryptedPassword: 'leak-array-cipher' }] }] },
      'e',
    );
    logger.error({ step: { loginType: '1', id: 'leak-sibling-id' } }, 'f');
    logger.info(
      { accessLogId: 'keep-this-id', req: { id: 'keep-req-id' } },
      'g',
    );

    expect(output).not.toContain('leak-');
    expect(output).toContain('keep-this-id');
    const lines = output
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines[0]).toMatchObject({
      codefBody: { id: '[REDACTED]', organization: '0306' },
    });
    expect(lines[1]).toMatchObject({
      x: { accountList: [{ id: '[REDACTED]' }] },
    });
    expect(lines[2]).toMatchObject({
      err: { message: expect.stringContaining('outer'), body: '[REDACTED]' },
    });
  });

  it('normalizes key case and separators, masks SMS codes in card-import context and avoids over-masking (review Low 3)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const shared = { label: 'keep-shared' };
    logger.error(
      {
        LoginId: 'leak-pascal',
        login_id: 'leak-snake',
        PASSWORD: 'leak-upper',
        'encrypted-password': 'leak-kebab',
        Connected_ID: 'leak-connected',
      },
      'a',
    );
    logger.error({ cardImportRequest: { code: 'leak-sms-1' } }, 'b');
    logger.error(
      { req2: { organization: '0306', loginId: 'x', code: 'leak-sms-2' } },
      'c',
    );
    logger.info(
      {
        item: { organization: '0306', id: 'keep-org-id' },
        a: shared,
        b: shared,
        result: { code: 'CF-00000' },
      },
      'd',
    );
    expect(output).not.toContain('leak-');
    const keep = output.trim().split('\n').at(-1) ?? '';
    expect(JSON.parse(keep)).toMatchObject({
      item: { organization: '0306', id: 'keep-org-id' },
      a: { label: 'keep-shared' },
      b: { label: 'keep-shared' },
      result: { code: 'CF-00000' },
    });
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(() => logger.info({ circular }, 'e')).not.toThrow();
    expect(output).toContain('[Circular]');
  });
  it('redacts admin login credentials (username, password, passwordHash) at any depth (ADMIN)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    logger.warn(
      {
        dto: { username: 'ops-admin-xyz', password: 'pw-secret-123' },
        err: Object.assign(new Error('boom'), {
          cause: {
            request: { userName: 'ops-admin-xyz', password_hash: 'scrypt$1$2' },
          },
        }),
      },
      '관리자 로그인 본문을 남긴 실수',
    );
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('ops-admin-xyz');
    expect(output).not.toContain('pw-secret-123');
    expect(output).not.toContain('scrypt$1$2');
  });
});
