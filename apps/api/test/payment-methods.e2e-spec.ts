import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { INTERNAL_JOB_SECRET_HEADER } from './../src/transactions/internal-job.guard.js';
import { createTestAuth, TEST_ORIGIN, type TestAuth } from './auth-helpers.js';
import { createPaymentTestApp } from './payment-helpers.js';

// DB 없이 도는 결제수단 e2e(CI): 연동 동의 가드, 로그인, 내부 잡 시크릿·CSRF.
describe('Payment methods guards (e2e, no DB)', () => {
  let app: NestExpressApplication;
  let auth: TestAuth;
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    connectionAttempt: { findMany: vi.fn().mockResolvedValue([]) },
    paymentConnection: { findMany: vi.fn().mockResolvedValue([]) },
  };

  beforeEach(async () => {
    vi.stubEnv('INTERNAL_JOB_SECRET', 'test-internal-job-secret-0123456789');
    auth = createTestAuth();
    ({ app } = await createPaymentTestApp({ auth, prisma }));
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const server = () => app.getHttpServer();

  it('requires FIN_LINK·FIN_PRIVACY·THIRD_PARTY to start or confirm a connection', async () => {
    const me = auth.addUser({ nickname: '준용' });
    auth.withoutConsent(me, 'FIN_LINK', 'THIRD_PARTY');
    const res = await request(server())
      .post('/api/payment-connections')
      .set(auth.headers(me))
      .send({ provider: 'TOSS', purpose: 'SIGNUP' })
      .expect(403);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
    expect(res.body.details.missing).toEqual(['FIN_LINK', 'THIRD_PARTY']);

    await request(server())
      .post(`/api/payment-connections/attempts/${crypto.randomUUID()}/confirm`)
      .set(auth.headers(me))
      .send({ candidateIds: [crypto.randomUUID()] })
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('CONSENT_REQUIRED'));
  });

  it('requires a session for wallet routes but keeps the provider callback public', async () => {
    await request(server()).get('/api/payment-methods').expect(401);
    await request(server())
      .post('/api/payment-methods/sync')
      .set('Origin', TEST_ORIGIN)
      .expect(401);
    const res = await request(server())
      .get('/api/payment-connections/callback/toss')
      .expect(302);
    expect(res.headers.location).toBe(
      'http://localhost:5173/wallet/connect/toss?error=invalid',
    );
  });

  it('validates the start body', async () => {
    const me = auth.addUser();
    const res = await request(server())
      .post('/api/payment-connections')
      .set(auth.headers(me))
      .send({ provider: 'KAKAO', purpose: 'NOPE', extra: 1 })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  describe('internal sync job', () => {
    const path = '/api/internal/jobs/sync';

    it('rejects a missing or wrong secret', async () => {
      await request(server()).post(path).set('Origin', TEST_ORIGIN).expect(403);
      await request(server())
        .post(path)
        .set('Origin', TEST_ORIGIN)
        .set(INTERNAL_JOB_SECRET_HEADER, 'wrong')
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('FORBIDDEN'));
    });

    it('is still behind the global CSRF guard (callers send Origin)', async () => {
      await request(server())
        .post(path)
        .set(INTERNAL_JOB_SECRET_HEADER, 'test-internal-job-secret-0123456789')
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('CSRF_REJECTED'));
    });

    it('runs with the right secret', async () => {
      const res = await request(server())
        .post(path)
        .set('Origin', TEST_ORIGIN)
        .set(INTERNAL_JOB_SECRET_HEADER, 'test-internal-job-secret-0123456789')
        .expect(200);
      expect(res.body).toEqual({
        connections: 0,
        ok: 0,
        failed: 0,
        expired: 0,
        skipped: 0,
        fetched: 0,
        imported: 0,
        expiredAttempts: 0,
      });
    });
  });
});
