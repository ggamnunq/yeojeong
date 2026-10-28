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
});
