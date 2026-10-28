import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './create-test-app.js';

describe('HealthController (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up' });
  });

  afterEach(async () => {
    await app.close();
  });
});
