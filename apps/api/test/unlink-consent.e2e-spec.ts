import { createHmac } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ConsentDocumentSummary } from '@yeojeong/shared';
import request from 'supertest';
import type { AuthUser } from './../src/common/auth/index.js';
import { INTERNAL_JOB_SECRET_HEADER } from './../src/common/internal-job/index.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createExpense,
  createGroupWithTrip,
  removeGroups,
} from './account-fixtures.js';
import { createTestAuth, TEST_ORIGIN, type TestAuth } from './auth-helpers.js';
import { TEST_ENV } from './env.js';
import {
  cleanupSeed,
  createPaymentTestApp,
  seedTrip,
  type SeededTrip,
} from './payment-helpers.js';

// 결제수단 전부 해제 → 연동 동의 철회·파기 → 재동의·재연결(기능명세 FR-804·4-10 v0.5.7, S4).
// 로그인만 스텁이고 동의 판정·멤버십은 실DB를 쓴다(PAYMENT_TEST_DATABASE_URL, payment-flow e2e와 같은 DB. 자기가 만든 행만 지운다).
const TEST_DB = process.env.PAYMENT_TEST_DATABASE_URL;
const JOB_SECRET = 'test-internal-job-secret-0123456789';
const UA = 'yeojeong-s4-e2e';

describe.skipIf(!TEST_DB)(
  'Unlink all → consent withdrawal & purge → re-consent (e2e, real DB)',
  () => {
    let app: NestExpressApplication;
    let auth: TestAuth;
    let prisma: PrismaService;
    const seeds: SeededTrip[] = [];
    const extraGroups: string[] = [];

    beforeAll(async () => {
      vi.stubEnv('DATABASE_URL', TEST_DB);
      vi.stubEnv('INTERNAL_JOB_SECRET', JOB_SECRET);
      auth = createTestAuth();
      ({ app } = await createPaymentTestApp({
        auth,
        prisma: 'real',
        realGuards: true,
      }));
      prisma = app.get(PrismaService);
      const [{ db }] = await prisma.$queryRaw<
        { db: string }[]
      >`SELECT current_database() AS db`;
      if (!db.endsWith('_test')) {
        throw new Error(
          `PAYMENT_TEST_DATABASE_URL은 _test DB여야 합니다: ${db}`,
        );
      }
      await prisma.exchangeRate.createMany({
        data: [
          {
            quoteCurrency: 'JPY',
            rate: '9.192',
            displayUnit: 100,
            source: 'S2B 테스트 고시',
            effectiveAt: new Date('2020-01-01T00:00:00Z'),
          },
        ],
        skipDuplicates: true,
      });
    });

    afterAll(async () => {
      await removeGroups(prisma, extraGroups);
      await cleanupSeed(prisma, seeds);
      await app.close();
      vi.unstubAllEnvs();
    });

    const server = () => app.getHttpServer();
    const asUser = (u: { id: string; nickname: string }): AuthUser => ({
      id: u.id,
      nickname: u.nickname,
      profileImageUrl: null,
    });

    /** 가입 동의 3건을 현재 버전으로(실제 ConsentChecker가 모든 요청에서 확인한다) */
    async function signupConsents(user: AuthUser) {
      const docs = (
        await request(server())
          .get('/api/consents/documents?stage=SIGNUP')
          .expect(200)
      ).body as ConsentDocumentSummary[];
      for (const doc of docs.filter((d) => d.required)) {
        await prisma.userConsent.create({
          data: {
            userId: user.id,
            userRefHash: 'b'.repeat(64),
            consentId: doc.consentId,
            version: doc.version,
            agreed: true,
            ua: UA,
            screen: 'WF-04',
            method: 'ALL',
            docHash: 'c'.repeat(64),
          },
        });
      }
    }

    /** WF-05b: 연동 동의 3건을 API로 저장 */
    async function agreeFinLink(user: AuthUser, screen = 'WF-05') {
      const docs = (
        await request(server())
          .get('/api/consents/documents?stage=FIN_LINK')
          .expect(200)
      ).body as ConsentDocumentSummary[];
      return request(server())
        .post('/api/consents')
        .set(auth.headers(user))
        .send({
          stage: 'FIN_LINK',
          agreements: docs.map((d) => ({
            consentId: d.consentId,
            version: d.version,
            agreed: true,
          })),
          method: 'ALL',
          screen,
        })
        .expect(201);
    }

    const finStatus = async (user: AuthUser) =>
      (
        await request(server())
          .get('/api/consents/status?stage=FIN_LINK')
          .set(auth.headers(user))
          .expect(200)
      ).body as { valid: boolean; missing: string[] };

    /** 연결 시작 → (DEMO 즉시 인증) 콜백 → 후보 → 세이프박스만 빼고 확정 */
    async function connect(user: AuthUser) {
      const start = await request(server())
        .post('/api/payment-connections')
        .set(auth.headers(user))
        .send({ provider: 'TOSS', purpose: 'SIGNUP' })
        .expect(201);
      const authUrl = new URL(start.body.authUrl);
      await request(server())
        .get(authUrl.pathname + authUrl.search)
        .set(auth.headers(user))
        .expect(302);
      const candidates = await request(server())
        .get(
          `/api/payment-connections/attempts/${start.body.attemptId}/candidates`,
        )
        .set(auth.headers(user))
        .expect(200);
      await request(server())
        .post(
          `/api/payment-connections/attempts/${start.body.attemptId}/confirm`,
        )
        .set(auth.headers(user))
        .send({
          candidateIds: (
            candidates.body as { candidateId: string; productName: string }[]
          )
            .filter((c) => c.productName !== '카카오뱅크 세이프박스')
            .map((c) => c.candidateId),
        })
        .expect(201);
    }

    async function unlinkAll(user: AuthUser) {
      const methods = await prisma.paymentMethod.findMany({
        where: { userId: user.id, status: { not: 'REMOVED' } },
        orderBy: { createdAt: 'asc' },
      });
      for (const m of methods) {
        await request(server())
          .delete(`/api/payment-methods/${m.id}`)
          .set(auth.headers(user))
          .expect(204);
      }
    }

    const classify = (
      user: AuthUser,
      tripId: string,
      expenseId: string,
      body: object,
    ) =>
      request(server())
        .put(`/api/trips/${tripId}/expenses/${expenseId}/classification`)
        .set(auth.headers(user))
        .send(body);

    const versionOf = async (id: string) =>
      (await prisma.expense.findUniqueOrThrow({ where: { id } })).version;

    it('re-consent after unlinking everything appends new rows and linking works again; THIRD_PARTY stays valid (W5 403 bug)', async () => {
      const seed = await seedTrip(prisma, {
        members: [{ nickname: '준용' }],
        status: 'ONGOING',
      });
      seeds.push(seed);
      const me = asUser(seed.users[0]);
      await signupConsents(me);

      // 연동 동의 없이 연결 시작은 403
      await request(server())
        .post('/api/payment-connections')
        .set(auth.headers(me))
        .send({ provider: 'TOSS', purpose: 'SIGNUP' })
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('CONSENT_REQUIRED'));
      await agreeFinLink(me);
      await connect(me);
      expect(await finStatus(me)).toMatchObject({ valid: true, missing: [] });

      await unlinkAll(me);
      // FIN_LINK·FIN_PRIVACY만 철회, THIRD_PARTY는 유지
      expect(await finStatus(me)).toMatchObject({
        valid: false,
        missing: ['FIN_LINK', 'FIN_PRIVACY'],
      });
      const blocked = await request(server())
        .post('/api/payment-connections')
        .set(auth.headers(me))
        .send({ provider: 'TOSS', purpose: 'SIGNUP' })
        .expect(403);
      expect(blocked.body).toMatchObject({
        code: 'CONSENT_REQUIRED',
        details: { missing: ['FIN_LINK', 'FIN_PRIVACY'] },
      });

      // 같은 버전으로 다시 동의 → 새 행이 쌓이고 유효해진다(철회 행은 그대로 남는다)
      await agreeFinLink(me, 'WF-28');
      expect(await finStatus(me)).toMatchObject({ valid: true, missing: [] });
      const rows = await prisma.userConsent.findMany({
        where: {
          userId: me.id,
          consentId: { in: ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY'] },
        },
        orderBy: [{ consentId: 'asc' }, { agreedAt: 'asc' }],
      });
      expect(
        rows.map((r) => [
          r.consentId,
          r.screen,
          r.withdrawChannel,
          r.withdrawnAt === null,
        ]),
      ).toEqual([
        ['FIN_LINK', 'WF-05', 'WF-27', false],
        ['FIN_LINK', 'WF-28', null, true],
        ['FIN_PRIVACY', 'WF-05', 'WF-27', false],
        ['FIN_PRIVACY', 'WF-28', null, true],
        // 이미 유효한 THIRD_PARTY는 새 행을 쌓지 않는다
        ['THIRD_PARTY', 'WF-05', null, true],
      ]);

      // 다시 연결된다
      await connect(me);
      expect(
        await prisma.paymentMethod.count({
          where: { userId: me.id, status: 'ACTIVE' },
        }),
      ).toBe(3);
    });

    it('unlinking everything purges PENDING·PERSONAL (incl. ended trips) regardless of purgeImported, keeps SHARED detached with sourceTxHash, blocks widening with 403 and deletes on shared → personal (204); relinking does not re-import the shared payment', async () => {
      const seed = await seedTrip(prisma, {
        members: [
          { nickname: '준용' },
          { nickname: '민지' },
          { nickname: '태현' },
        ],
        status: 'ONGOING',
      });
      seeds.push(seed);
      const [jy, mj, th] = seed.users;
      const me = asUser(jy);
      await signupConsents(me);
      await agreeFinLink(me);
      await connect(me);

      const pending = await prisma.expense.findMany({
        where: { tripId: seed.tripId, payerMembershipId: jy.membershipId! },
        orderBy: { occurredAt: 'asc' },
        include: { transaction: true },
      });
      expect(pending).toHaveLength(6);
      const [ichiran, donki, family, mk] = pending;

      // 공동 확정 때 원본 거래 해시를 남긴다
      await classify(me, seed.tripId, ichiran.id, {
        status: 'SHARED',
        participantMembershipIds: [
          jy.membershipId,
          mj.membershipId,
          th.membershipId,
        ],
        version: ichiran.version,
      }).expect(200);
      await classify(me, seed.tripId, donki.id, {
        status: 'SHARED',
        participantMembershipIds: [jy.membershipId, mj.membershipId],
        version: donki.version,
      }).expect(200);
      await classify(me, seed.tripId, family.id, {
        status: 'PERSONAL',
        version: family.version,
      }).expect(200);
      const expectedHash = createHmac('sha256', TEST_ENV.AUDIT_HMAC_KEY)
        .update(`source-tx:DEMO:${donki.transaction!.externalRef}`)
        .digest('hex');
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: donki.id } }))
          .sourceTxHash,
      ).toBe(expectedHash);

      // 종료된 다른 여정의 내 개인 결제(I-6 예외로 함께 파기된다)
      const ended = await createGroupWithTrip(prisma, {
        status: 'ENDED',
        members: [{ userId: jy.id }],
      });
      extraGroups.push(ended.group.id);
      const endedPersonal = await createExpense(prisma, {
        tripId: ended.trip.id,
        payerMembershipId: ended.memberships[0].id,
        status: 'PERSONAL',
        krw: 12_000,
        transactionId: mk.transactionId!,
      });

      // 전부 해제: 마지막 결제수단에 purgeImported를 주지 않아도 파기한다
      await unlinkAll(me);
      const left = await prisma.expense.findMany({
        where: { payer: { userId: jy.id } },
        orderBy: { occurredAt: 'asc' },
      });
      expect(left.map((e) => [e.id, e.status, e.transactionId])).toEqual([
        [ichiran.id, 'SHARED', null],
        [donki.id, 'SHARED', null],
      ]);
      expect(left[1].sourceTxHash).toBe(expectedHash);
      expect(left[0].sourceTxHash).toMatch(/^[0-9a-f]{64}$/);
      expect(
        await prisma.expense.count({ where: { id: endedPersonal.id } }),
      ).toBe(0);
      expect(await prisma.transaction.count({ where: { userId: jy.id } })).toBe(
        0,
      );
      expect(
        await prisma.paymentMethod.count({ where: { userId: jy.id } }),
      ).toBe(0);
      const purge = await prisma.accessLog.findFirstOrThrow({
        where: {
          userId: jy.id,
          action: 'PURGE_FINANCIAL_DATA',
          resourceType: 'USER',
        },
      });
      expect(purge.details).toEqual({
        expenses: 5,
        transactions: 10,
        paymentMethods: 3,
        detachedShared: 2,
      });

      // 공개를 넓히는 변경은 403 CONSENT_REQUIRED(reason NO_ACTIVE_PAYMENT_METHOD)
      const widened = await classify(me, seed.tripId, donki.id, {
        status: 'SHARED',
        participantMembershipIds: [
          jy.membershipId,
          mj.membershipId,
          th.membershipId,
        ],
        version: await versionOf(donki.id),
      }).expect(403);
      expect(widened.body).toMatchObject({
        code: 'CONSENT_REQUIRED',
        details: {
          missing: ['FIN_LINK', 'FIN_PRIVACY'],
          reason: 'NO_ACTIVE_PAYMENT_METHOD',
        },
      });
      // 개인 → 공동도 막는다(파기 뒤에 남은 개인 결제가 있다고 가정해 직접 만든다)
      const leftover = await createExpense(prisma, {
        tripId: seed.tripId,
        payerMembershipId: jy.membershipId!,
        status: 'PERSONAL',
        krw: 3_000,
      });
      await classify(me, seed.tripId, leftover.id, {
        status: 'SHARED',
        version: leftover.version,
      })
        .expect(403)
        .expect((r) =>
          expect(r.body.details.reason).toBe('NO_ACTIVE_PAYMENT_METHOD'),
        );
      await prisma.expense.delete({ where: { id: leftover.id } });

      // 인원을 줄이기만 하는 변경은 된다
      await classify(me, seed.tripId, ichiran.id, {
        status: 'SHARED',
        participantMembershipIds: [jy.membershipId, mj.membershipId],
        version: await versionOf(ichiran.id),
      }).expect(200);

      // 공동 → 개인은 개인 결제로 남기지 않고 지운다(204)
      await classify(me, seed.tripId, ichiran.id, {
        status: 'PERSONAL',
        confirmSharedToPersonal: true,
        version: await versionOf(ichiran.id),
      })
        .expect(204)
        .expect((r) => expect(r.text).toBe(''));
      expect(await prisma.expense.count({ where: { id: ichiran.id } })).toBe(0);
      expect(
        await prisma.expenseShare.count({ where: { expenseId: ichiran.id } }),
      ).toBe(0);
      expect(
        await prisma.accessLog.count({
          where: {
            userId: jy.id,
            action: 'PURGE_FINANCIAL_DATA',
            resourceType: 'EXPENSE',
            resourceId: ichiran.id,
          },
        }),
      ).toBe(1);

      // 다시 동의·연결: 남아 있는 공동 결제(돈키호테)의 거래는 새 미확정으로 다시 들어오지 않는다.
      // 지운 이치란은 새 동의로 다시 불러온다(5건 + 공동 1건)
      await agreeFinLink(me, 'WF-28');
      await connect(me);
      await request(server())
        .post('/api/internal/jobs/sync')
        .set('Origin', TEST_ORIGIN)
        .set(INTERNAL_JOB_SECRET_HEADER, JOB_SECRET)
        .expect(200);
      const after = await prisma.expense.findMany({
        where: { tripId: seed.tripId, payerMembershipId: jy.membershipId! },
        orderBy: { occurredAt: 'asc' },
      });
      expect(after.map((e) => [e.merchantName, e.status])).toEqual([
        ['이치란 라멘 도톤보리점', 'PENDING'],
        ['돈키호테 도톤보리점', 'SHARED'],
        ['패밀리마트 난바역점', 'PENDING'],
        ['MK택시', 'PENDING'],
        ['551 호라이 난바본점', 'PENDING'],
        ['야키니쿠 와규 이치 난바점', 'PENDING'],
      ]);
      expect(after[1].id).toBe(donki.id);
      // 다시 연결했으니 공개 확대도 다시 된다
      await classify(me, seed.tripId, donki.id, {
        status: 'SHARED',
        participantMembershipIds: [
          jy.membershipId,
          mj.membershipId,
          th.membershipId,
        ],
        version: await versionOf(donki.id),
      }).expect(200);
    });

    it('partial unlink keeps payments and consents; purgeImported still needs the last method of the connection', async () => {
      const seed = await seedTrip(prisma, {
        // DEMO 샘플은 사용자마다 다르다. 준용 샘플(결제수단 3개 선택)을 쓴다
        members: [{ nickname: '준용' }],
        status: 'ONGOING',
      });
      seeds.push(seed);
      const me = asUser(seed.users[0]);
      await signupConsents(me);
      await agreeFinLink(me);
      await connect(me);
      const methods = await prisma.paymentMethod.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: 'asc' },
      });
      await request(server())
        .delete(`/api/payment-methods/${methods[0].id}?purgeImported=true`)
        .set(auth.headers(me))
        .expect(400);
      await request(server())
        .delete(`/api/payment-methods/${methods[0].id}`)
        .set(auth.headers(me))
        .expect(204);
      expect(await finStatus(me)).toMatchObject({ valid: true });
      expect(
        await prisma.expense.count({ where: { tripId: seed.tripId } }),
      ).toBe(6);
      expect(
        await prisma.accessLog.count({
          where: { userId: me.id, action: 'PURGE_FINANCIAL_DATA' },
        }),
      ).toBe(0);
    });
  },
);
