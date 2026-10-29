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
});
