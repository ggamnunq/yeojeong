import { createHmac, randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ConsentIpBackfillResult } from '@yeojeong/shared';
import request from 'supertest';
import { INTERNAL_JOB_SECRET_HEADER } from './../src/common/internal-job/index.js';
import { CONSENT_IP_BATCH } from './../src/consents/consent-ip-backfill.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import { createDbTestApp, describeWithDb } from './account-fixtures.js';
import { TEST_ENV } from './env.js';

const SECRET = 'internal-job-secret-for-e2e-only-0123456789';
const PATH = '/api/internal/jobs/consent-ip-backfill';
const hex64 = () => randomBytes(32).toString('hex');
const hmac = (ip: string) =>
  createHmac('sha256', TEST_ENV.AUDIT_HMAC_KEY).update(ip).digest('hex');

describeWithDb(
  'POST /api/internal/jobs/consent-ip-backfill 동의 기록 IP 이관 (e2e, 실제 DB)',
  () => {
    let app: NestExpressApplication;
    let db: PrismaService;
    const created: string[] = [];

    beforeAll(async () => {
      vi.stubEnv('INTERNAL_JOB_SECRET', SECRET);
      ({ app, db } = await createDbTestApp());
    });

    afterAll(async () => {
      await db.userConsent.deleteMany({ where: { id: { in: created } } });
      await app.close();
      vi.unstubAllEnvs();
    });

    const run = (target = app, secret: string | null = SECRET) => {
      const req = request(target.getHttpServer()).post(PATH);
      if (secret !== null) req.set(INTERNAL_JOB_SECRET_HEADER, secret);
      return req.send({});
    };

    /** 옛 리비전이 쓰던 모양(평문 ip, ip_hash 없음) */
    const legacyConsent = async (ip: string) => {
      const row = await db.userConsent.create({
        data: {
          userId: null,
          userRefHash: hex64(),
          consentId: 'TOS',
          version: '0.1-draft',
          agreed: true,
          ip,
          ua: 'e2e',
          screen: 'WF-04',
          method: 'ALL',
          docHash: hex64(),
        },
        select: { id: true },
      });
      created.push(row.id);
      return row.id;
    };

    const stored = (id: string) =>
      db.userConsent.findUniqueOrThrow({
        where: { id },
        select: { ip: true, ipHash: true },
      });

    it('answers 403 without the right secret', async () => {
      expect((await run(app, null).expect(403)).body.code).toBe('FORBIDDEN');
      await run(app, 'wrong-secret').expect(403);
    });

    it('leaves plaintext untouched when AUDIT_HMAC_KEY is missing', async () => {
      const id = await legacyConsent('198.51.100.20');
      vi.stubEnv('AUDIT_HMAC_KEY', '');
      const { app: keyless } = await createDbTestApp();
      try {
        const body = (await run(keyless).expect(200))
          .body as ConsentIpBackfillResult;
        expect(body.skipped).toBe('NO_KEY');
        expect(body.hashed).toBe(0);
        expect(body.remaining).toBeGreaterThanOrEqual(1);
      } finally {
        await keyless.close();
        vi.stubEnv('AUDIT_HMAC_KEY', TEST_ENV.AUDIT_HMAC_KEY);
      }
      expect(await stored(id)).toEqual({ ip: '198.51.100.20', ipHash: null });
    });

    it('hashes every plaintext IP across batches, clears it, and is idempotent', async () => {
      // 배치 경계를 넘기도록 한 배치보다 많이 만든다
      const ids: string[] = [];
      const many = Array.from({ length: CONSENT_IP_BATCH + 3 }, (_, i) => ({
        userId: null,
        userRefHash: hex64(),
        consentId: 'TOS' as const,
        version: '0.1-draft',
        agreed: true,
        ip: `10.0.${Math.floor(i / 250)}.${i % 250}`,
        ua: 'e2e',
        screen: 'WF-04',
        method: 'ALL',
        docHash: hex64(),
      }));
      const bulk = await db.userConsent.createManyAndReturn({
        data: many,
        select: { id: true },
      });
      created.push(...bulk.map((r) => r.id));
      ids.push(await legacyConsent('2001:db8::1'));
      ids.push(await legacyConsent('203.0.113.9'));

      const first = (await run().expect(200)).body as ConsentIpBackfillResult;
      expect(first.skipped).toBeUndefined();
      expect(first.hashed).toBeGreaterThanOrEqual(CONSENT_IP_BATCH + 5);
      expect(first.remaining).toBe(0);

      expect(await stored(ids[0])).toEqual({
        ip: null,
        ipHash: hmac('2001:db8::1'),
      });
      expect(await stored(ids[1])).toEqual({
        ip: null,
        ipHash: hmac('203.0.113.9'),
      });
      expect(await stored(bulk[0].id)).toEqual({
        ip: null,
        ipHash: hmac('10.0.0.0'),
      });
      expect(
        await db.userConsent.count({
          where: { id: { in: created }, ip: { not: null } },
        }),
      ).toBe(0);

      const again = (await run().expect(200)).body as ConsentIpBackfillResult;
      expect(again).toEqual({ hashed: 0, remaining: 0 });
      expect(await stored(ids[1])).toEqual({
        ip: null,
        ipHash: hmac('203.0.113.9'),
      });
    });
  },
);
