import { Body, Controller, Get, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERRORS } from '@yeojeong/shared';
import { IsString, MaxLength } from 'class-validator';
import request from 'supertest';
import { StrictThrottle } from './../src/common/throttle.js';
import { createTestApp } from './create-test-app.js';

class CreateNoteDto {
  @IsString()
  @MaxLength(20)
  title: string;
}

@Controller('security-probe')
class SecurityProbeController {
  @Post('notes')
  create(@Body() dto: CreateNoteDto) {
    return dto;
  }

  @Get('boom')
  boom(): never {
    throw new Error('internal detail for server logs only');
  }

  @StrictThrottle()
  @Get('strict')
  strict() {
    return { ok: true };
  }
}

function expectNoLeak(text: string) {
  expect(text).not.toMatch(/node_modules|\s+at\s|internal detail|stack/i);
}

describe('Security baseline (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp([SecurityProbeController]);
  });

  afterEach(async () => {
    await app.close();
    delete process.env.WEB_ORIGIN;
  });

  it('sets helmet headers and hides the framework', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  describe('validation', () => {
    it('accepts a body that matches the DTO', () => {
      return request(app.getHttpServer())
        .post('/api/security-probe/notes')
        .send({ title: '오사카' })
        .expect(201)
        .expect({ title: '오사카' });
    });

    it('rejects fields outside the DTO whitelist', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security-probe/notes')
        .send({ title: '오사카', isAdmin: true })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('isAdmin');
    });

    it('rejects invalid values', () => {
      return request(app.getHttpServer())
        .post('/api/security-probe/notes')
        .send({ title: 123 })
        .expect(400);
    });

    it('does not parse form-encoded bodies', () => {
      return request(app.getHttpServer())
        .post('/api/security-probe/notes')
        .type('form')
        .send('title=오사카')
        .expect(400);
    });
  });

  describe('error responses', () => {
    it('hides internal error details', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/security-probe/boom')
        .expect(500);
      expect(res.body).toEqual({
        code: 'INTERNAL_ERROR',
        message: ERRORS.INTERNAL_ERROR.message,
        requestId: res.headers['x-request-id'],
      });
      expectNoLeak(res.text);
    });

    it('rejects malformed JSON without a stack trace', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security-probe/notes')
        .set('Content-Type', 'application/json')
        .send('{"title": ')
        .expect(400);
      expectNoLeak(res.text);
    });

    it('rejects bodies over the size limit', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security-probe/notes')
        .send({ title: 'x'.repeat(200 * 1024) })
        .expect(413);
      expectNoLeak(res.text);
    });

    it('does not leak details on unknown routes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/does-not-exist')
        .expect(404);
      expectNoLeak(res.text);
    });
  });

  it('returns 429 once a strict endpoint exceeds its limit', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      await request(server).get('/api/security-probe/strict').expect(200);
    }
    await request(server).get('/api/security-probe/strict').expect(429);
  });

  describe('CORS', () => {
    it('sends no CORS headers when WEB_ORIGIN is unset', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'https://evil.example.com')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows only the configured origins', async () => {
      await app.close();
      process.env.WEB_ORIGIN = 'https://yeojeong.example.com';
      app = await createTestApp([SecurityProbeController]);

      const allowed = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'https://yeojeong.example.com')
        .expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe(
        'https://yeojeong.example.com',
      );
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');

      const denied = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'https://evil.example.com')
        .expect(200);
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
