import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERRORS } from '@yeojeong/shared';
import request from 'supertest';
import { createTestApp } from './create-test-app.js';

describe('Swagger (e2e)', () => {
  let app: NestExpressApplication;
  const originalEnv = process.env.NODE_ENV;

  afterEach(async () => {
    await app.close();
    process.env.NODE_ENV = originalEnv;
  });

  it('serves the docs outside production', async () => {
    app = await createTestApp();
    const server = app.getHttpServer();

    await request(server)
      .get('/api/docs')
      .expect(200)
      .expect('Content-Type', /html/);

    const { body } = await request(server).get('/api/docs-json').expect(200);
    const health = body.paths['/api/health'].get;
    expect(health.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/HealthResponseDto',
    });
    expect(health.responses['500'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ApiErrorBodyDto',
    });
    expect(body.components.schemas.ApiErrorBodyDto.required).toEqual(
      expect.arrayContaining(['code', 'message', 'requestId']),
    );
    expect(body.components.schemas.FieldErrorDto).toBeDefined();
  });

  it('does not register the docs in production', async () => {
    process.env.NODE_ENV = 'production';
    app = await createTestApp();
    const server = app.getHttpServer();

    const res = await request(server).get('/api/docs').expect(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: ERRORS.NOT_FOUND.message,
      requestId: res.headers['x-request-id'],
    });
    await request(server).get('/api/docs-json').expect(404);
  });
});
