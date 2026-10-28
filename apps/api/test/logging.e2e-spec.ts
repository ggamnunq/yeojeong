import { Controller, Get, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Public } from './../src/common/auth/index.js';
import { createLogger } from './../src/common/logging/logger.js';
import { createTestApp } from './create-test-app.js';

@Public()
@Controller('log-probe')
class LogProbeController {
  private readonly logger = new Logger(LogProbeController.name);

  @Get()
  probe() {
    this.logger.warn('정산 재계산 시작');
    return { ok: true };
  }
}

describe('Request logging (e2e)', () => {
  let app: NestExpressApplication;
  const lines: Record<string, unknown>[] = [];
  let raw = '';

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'info');
    const logger = createLogger(new ConfigService(), {
      write: (line: string) => {
        raw += line;
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    });
    app = await createTestApp([LogProbeController], { logger });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('logs one line per request with the request ID and without secrets', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/log-probe?email=traveler@example.com')
      .set('Authorization', 'Bearer secret-token')
      .set('Cookie', 'session=secret-cookie')
      .set('X-Request-Id', 'forged-request-id')
      .set('CF-Ray', '8f1c2d3e4a5b6c7d-ICN')
      .set('User-Agent', 'yeojeong-test')
      .expect(200);
    const requestId = res.headers['x-request-id'];

    expect(lines).toContainEqual(
      expect.objectContaining({
        severity: 'WARNING',
        requestId,
        context: LogProbeController.name,
        message: '정산 재계산 시작',
      }),
    );
    expect(lines).toContainEqual(
      expect.objectContaining({
        severity: 'INFO',
        requestId,
        method: 'GET',
        path: '/api/log-probe',
        status: 200,
        responseTimeMs: expect.any(Number),
        ip: expect.any(String),
        userAgent: 'yeojeong-test',
        cfRay: '8f1c2d3e4a5b6c7d-ICN',
        message: 'GET /api/log-probe 200',
      }),
    );
    expect(raw).not.toMatch(/secret-token|secret-cookie|traveler@|forged/);
  });
});
