import { Controller, Get, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERRORS } from '@yeojeong/shared';
import type { Request } from 'express';
import request from 'supertest';
import { StrictThrottle } from './../src/common/throttle.js';
import { createTestApp } from './create-test-app.js';

const SECRET = 'test-origin-secret-0123456789abcdefghij';

@Controller('origin-probe')
class OriginProbeController {
  @Get('ip')
  ip(@Req() req: Request) {
    return { ip: req.ip };
  }

  @StrictThrottle()
  @Get('strict')
  strict() {
    return { ok: true };
  }
}

describe('Origin lock (e2e)', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app.close();
    delete process.env.ORIGIN_SECRET;
  });

  describe('with ORIGIN_SECRET', () => {
    beforeEach(async () => {
      process.env.ORIGIN_SECRET = SECRET;
      app = await createTestApp([OriginProbeController]);
    });

    it('rejects requests without the secret header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(403);
      expect(res.body).toEqual({
        code: 'FORBIDDEN',
        message: ERRORS.FORBIDDEN.message,
        requestId: res.headers['x-request-id'],
      });
    });

    it('rejects a wrong secret', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .set('X-Origin-Auth', `${SECRET}x`)
        .expect(403);
    });

    it('accepts the secret from the Worker', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .set('X-Origin-Auth', SECRET)
        .expect(200);
    });

    it('uses the client IP from the Worker', () => {
      return request(app.getHttpServer())
        .get('/api/origin-probe/ip')
        .set('X-Origin-Auth', SECRET)
        .set('X-Client-IP', '203.0.113.7')
        .set('X-Forwarded-For', '198.51.100.9')
        .expect(200)
        .expect({ ip: '203.0.113.7' });
    });

    it('ignores a client IP header that is not an IP', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/origin-probe/ip')
        .set('X-Origin-Auth', SECRET)
        .set('X-Client-IP', 'not-an-ip')
        .expect(200);
      expect(res.body.ip).not.toBe('not-an-ip');
    });

    it('rate-limits per client IP from the Worker', async () => {
      const server = app.getHttpServer();
      const call = (ip: string) =>
        request(server)
          .get('/api/origin-probe/strict')
          .set('X-Origin-Auth', SECRET)
          .set('X-Client-IP', ip);

      for (let i = 0; i < 10; i++) {
        await call('203.0.113.7').expect(200);
      }
      await call('203.0.113.7').expect(429);
      await call('203.0.113.8').expect(200);
    });
  });

  describe('without ORIGIN_SECRET (local)', () => {
    beforeEach(async () => {
      app = await createTestApp([OriginProbeController]);
    });

    it('does not trust a client-supplied IP header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/origin-probe/ip')
        .set('X-Client-IP', '203.0.113.7')
        .expect(200);
      expect(res.body.ip).not.toBe('203.0.113.7');
    });
  });

  it('refuses to start with a short secret', async () => {
    process.env.ORIGIN_SECRET = 'short';
    await expect(createTestApp()).rejects.toThrow('ORIGIN_SECRET');
    delete process.env.ORIGIN_SECRET;
    app = await createTestApp();
  });
});
