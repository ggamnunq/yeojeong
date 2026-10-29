import { randomBytes, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PurgeJobResult, PurgeStep } from '@yeojeong/shared';
import request from 'supertest';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import { INTERNAL_JOB_SECRET_HEADER } from './../src/common/internal-job/index.js';
import {
  createDbTestApp,
  createExpense,
  createGroupWithTrip,
  createPaymentSetup,
  createSession,
  createTransaction,
  createUser,
  daysAgo,
  describeWithDb,
  removeGroups,
  removeUsers,
  yearsAgo,
} from './account-fixtures.js';
import { TEST_ORIGIN } from './auth-helpers.js';

const SECRET = 'internal-job-secret-for-e2e-only-0123456789';
const hex64 = () => randomBytes(32).toString('hex');

describeWithDb('POST /api/internal/jobs/purge 파기 배치 (e2e, 실제 DB)', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  const userIds: string[] = [];
  const groupIds: string[] = [];

  beforeAll(async () => {
    vi.stubEnv('INTERNAL_JOB_SECRET', SECRET);
    ({ app, db } = await createDbTestApp());
  });

  afterAll(async () => {
    await removeGroups(db, groupIds);
    await removeUsers(db, userIds);
    await app.close();
    vi.unstubAllEnvs();
  });

  // 로컬 대체 시크릿으로 Cloud Scheduler 호출을 흉내 낸다.
  const purge = (body: object = {}, secret: string | null = SECRET) => {
    const req = request(app.getHttpServer())
      .post('/api/internal/jobs/purge')
      .set('Origin', TEST_ORIGIN);
    if (secret !== null) req.set(INTERNAL_JOB_SECRET_HEADER, secret);
    return req.send(body);
  };

  const user = async (input: Parameters<typeof createUser>[1] = {}) => {
    const u = await createUser(db, input);
    userIds.push(u.id);
    return u;
  };

  it('answers 403 without the right secret', async () => {
    expect((await purge({}, null).expect(403)).body.code).toBe('FORBIDDEN');
    await purge({}, 'wrong-secret').expect(403);
  });

  it('blocks every call when INTERNAL_JOB_SECRET is not set', async () => {
    vi.stubEnv('INTERNAL_JOB_SECRET', '');
    const { app: closed } = await createDbTestApp();
    try {
      await request(closed.getHttpServer())
        .post('/api/internal/jobs/purge')
        .set('Origin', TEST_ORIGIN)
        .set(INTERNAL_JOB_SECRET_HEADER, '')
        .send({})
        .expect(403);
    } finally {
      await closed.close();
      vi.stubEnv('INTERNAL_JOB_SECRET', SECRET);
    }
  });

  /** 보존 기간 경계 양쪽에 하나씩(지울 것 / 남길 것) 만든다 */
  async function seed() {
    const owner = await user({ nickname: '파기' });
    const pay = await createPaymentSetup(db, owner.id);

    // 1단계: 소프트 삭제 30일 전(파기, 29일 기준) / 28일 전(유지)
    const softOld = await createGroupWithTrip(db, {
      status: 'ENDED',
      members: [{ userId: owner.id }],
      deletedAt: daysAgo(30),
    });
    const softOldTx = await createTransaction(db, owner.id, pay.method.id);
    const softOldDup = await createTransaction(db, owner.id, pay.method.id, {
      sameUserDuplicateOfId: softOldTx.id,
    });
    const softOldExpense = await createExpense(db, {
      tripId: softOld.trip.id,
      payerMembershipId: softOld.memberships[0].id,
      status: 'SHARED',
      krw: 10_000,
      shareMembershipIds: [softOld.memberships[0].id],
      transactionId: softOldTx.id,
    });
    await db.settlement.create({
      data: {
        tripId: softOld.trip.id,
        totalSharedKrw: 10_000,
        sharedCount: 1,
        memberCount: 1,
        perCapitaKrw: 10_000,
        fxPolicy: 'SPOT_AT_PAYMENT',
        members: {
          create: [
            {
              membershipId: softOld.memberships[0].id,
              paidKrw: 10_000,
              paidCount: 1,
              burdenKrw: 10_000,
              netKrw: 0,
              personalCount: 0,
              isLeft: false,
            },
          ],
        },
      },
    });
    await db.tripEvent.create({
      data: {
        tripId: softOld.trip.id,
        type: 'FX_POLICY_CHANGED',
        payload: { policy: 'FIXED' },
      },
    });
    const softRecent = await createGroupWithTrip(db, {
      status: 'UPCOMING',
      members: [{ userId: owner.id }],
      deletedAt: daysAgo(28),
    });

    // 2단계: 여정 종료 + 3년 지남(파기) / 아직(유지)
    const endedOld = await createGroupWithTrip(db, {
      status: 'ENDED',
      members: [{ userId: owner.id }],
      autoEndAt: yearsAgo(3, 3),
      endedAt: yearsAgo(3, 2),
    });
    const endedRecent = await createGroupWithTrip(db, {
      status: 'ENDED',
      members: [{ userId: owner.id }],
      autoEndAt: yearsAgo(3, -1),
      endedAt: yearsAgo(3, -2),
    });
    groupIds.push(
      softOld.group.id,
      softRecent.group.id,
      endedOld.group.id,
      endedRecent.group.id,
    );

    // 3단계: 거래 원문 91일(NULL) / 89일(유지)
    const rawOld = await createTransaction(db, owner.id, pay.method.id, {
      importedAt: daysAgo(91),
    });
    const rawRecent = await createTransaction(db, owner.id, pay.method.id, {
      importedAt: daysAgo(89),
    });

    // 4단계: 연결 시도 만료(삭제) / 유효(유지)
    const attemptOld = await db.connectionAttempt.create({
      data: {
        userId: owner.id,
        purpose: 'WALLET_ADD',
        stateHash: hex64(),
        expiresAt: daysAgo(0.001),
      },
    });

    // 5단계: 가입 대기·세션
    const ticketOld = await db.signupTicket.create({
      data: { kakaoId: randomUUID().slice(0, 30), expiresAt: daysAgo(0.001) },
    });
    const ticketValid = await db.signupTicket.create({
      data: {
        kakaoId: randomUUID().slice(0, 30),
        expiresAt: new Date(Date.now() + 1_800_000),
      },
    });
    const sessionExpired = await createSession(db, owner.id, {
      expiresAt: daysAgo(0.001),
    });
    const sessionRevoked = await createSession(db, owner.id, {
      revokedAt: daysAgo(0.5),
    });
    const sessionValid = await createSession(db, owner.id);

    // 6단계: 해제한 결제수단 30일·거래 없음(삭제) / 30일·거래 있음(유지) / 28일(유지)
    const removed = async (removedAt: Date, withTx: boolean) => {
      const m = await db.paymentMethod.create({
        data: {
          userId: owner.id,
          connectionId: pay.connection.id,
          type: 'ACCOUNT',
          institutionName: '토스뱅크',
          productName: '토스뱅크 통장',
          shortLabel: '토스뱅크',
          maskedNumber: '1000-12**-**21',
          last4: '21',
          externalRef: randomUUID(),
          status: 'REMOVED',
          removedAt,
        },
      });
      if (withTx) await createTransaction(db, owner.id, m.id);
      return m;
    };
    const methodOld = await removed(daysAgo(30), false);
    const methodWithTx = await removed(daysAgo(30), true);
    const methodRecent = await removed(daysAgo(28), false);

    // 6단계 보조: 해제(REVOKED)·결제수단 없는 연결 30일(삭제) / 28일(유지)
    const revoked = async (days: number) => {
      const c = await db.paymentConnection.create({
        data: {
          userId: owner.id,
          provider: 'DEMO',
          status: 'REVOKED',
          connectedAt: daysAgo(days + 10),
        },
      });
      await db.$executeRaw`UPDATE payment_connections SET updated_at = ${daysAgo(days)} WHERE id = ${c.id}::uuid`;
      return c;
    };
    const connectionOld = await revoked(30);
    const connectionRecent = await revoked(28);

    // 7단계: 마지막 로그인 3년 + 2일(탈퇴 처리) / 3년 - 2일(유지)
    const inactive = await user({
      nickname: '휴면',
      lastLoginAt: yearsAgo(3, 2),
    });
    const inactiveGroup = await createGroupWithTrip(db, {
      status: 'UPCOMING',
      members: [{ userId: inactive.id }],
    });
    groupIds.push(inactiveGroup.group.id);
    const almostInactive = await user({
      nickname: '휴면직전',
      lastLoginAt: yearsAgo(3, -2),
    });

    // 8단계: 동의 철회 3년 지남(삭제) / 아직(유지)
    const consent = (withdrawnAt: Date) =>
      db.userConsent.create({
        data: {
          userId: null,
          userRefHash: hex64(),
          consentId: 'TOS',
          version: '0.1-draft',
          agreed: true,
          ua: 'e2e',
          screen: 'WF-04',
          method: 'ALL',
          docHash: hex64(),
          agreedAt: yearsAgo(4),
          withdrawnAt,
          withdrawChannel: 'ACCOUNT_DELETED',
        },
      });
    const consentOld = await consent(yearsAgo(3, 2));
    const consentRecent = await consent(yearsAgo(3, -2));

    // 9단계: 접근 기록 1년 지남(삭제) / 아직(유지)
    const accessOld = await db.accessLog.create({
      data: {
        userId: owner.id,
        action: 'LIST_EXPENSES',
        resourceType: 'TRIP',
        at: yearsAgo(1, 2),
      },
    });
    const accessRecent = await db.accessLog.create({
      data: {
        userId: owner.id,
        action: 'LIST_EXPENSES',
        resourceType: 'TRIP',
        at: yearsAgo(1, -2),
      },
    });

    // 10단계: 처리 완료 3년 지남(삭제) / 아직(유지) / 처리 안 된 요청 3년 지남(삭제)
    const deletion = (data: { completedAt: Date | null; requestedAt: Date }) =>
      db.accountDeletion.create({
        data: { userRefHash: hex64(), channel: 'SUPPORT', ...data },
      });
    const deletionOld = await deletion({
      requestedAt: yearsAgo(3, 3),
      completedAt: yearsAgo(3, 2),
    });
    const deletionRecent = await deletion({
      requestedAt: yearsAgo(3, -1),
      completedAt: yearsAgo(3, -2),
    });
    const deletionStale = await deletion({
      requestedAt: yearsAgo(3, 2),
      completedAt: null,
    });

    return {
      owner,
      pay,
      softOld,
      softOldTx,
      softOldDup,
      softOldExpense,
      softRecent,
      endedOld,
      endedRecent,
      rawOld,
      rawRecent,
      attemptOld,
      ticketOld,
      ticketValid,
      sessionExpired,
      sessionRevoked,
      sessionValid,
      methodOld,
      methodWithTx,
      methodRecent,
      connectionOld,
      connectionRecent,
      inactive,
      inactiveGroup,
      almostInactive,
      consentOld,
      consentRecent,
      accessOld,
      accessRecent,
      deletionOld,
      deletionRecent,
      deletionStale,
    };
  }

  const countOf = (result: PurgeJobResult, step: PurgeStep) =>
    result.steps.find((s) => s.step === step)?.count ?? -1;

  it('counts targets on a dry run without deleting, then purges only rows past retention', async () => {
    const s = await seed();

    const dry = (await purge({ dryRun: true }).expect(200))
      .body as PurgeJobResult;
    expect(dry.dryRun).toBe(true);
    expect(dry.steps.map((step) => step.step)).toEqual([
      'SOFT_DELETED_GROUPS',
      'EXPIRED_GROUP_RECORDS',
      'RAW_PAYLOADS',
      'CONNECTION_ATTEMPTS',
      'SIGNUP_TICKETS',
      'SESSIONS',
      'REMOVED_PAYMENT_METHODS',
      'REVOKED_CONNECTIONS',
      'INACTIVE_USERS',
      'USER_CONSENTS',
      'ACCESS_LOGS',
      'ACCOUNT_DELETIONS',
      'CARD_IMPORT_COUNTERS',
      'CODEF_PENDING_DELETIONS',
      'ADMIN_SESSIONS',
    ]);
    expect(countOf(dry, 'SOFT_DELETED_GROUPS')).toBeGreaterThanOrEqual(1);
    expect(countOf(dry, 'SESSIONS')).toBeGreaterThanOrEqual(2);
    expect(countOf(dry, 'INACTIVE_USERS')).toBeGreaterThanOrEqual(1);
    expect(countOf(dry, 'ACCOUNT_DELETIONS')).toBeGreaterThanOrEqual(2);
    // 드라이런은 아무것도 지우지 않는다
    expect(await db.group.count({ where: { id: s.softOld.group.id } })).toBe(1);
    expect(await db.user.count({ where: { id: s.inactive.id } })).toBe(1);
    expect(
      await db.session.count({ where: { id: s.sessionRevoked.session.id } }),
    ).toBe(1);

    const run = (await purge({}).expect(200)).body as PurgeJobResult;
    expect(run.dryRun).toBe(false);
    expect(run.steps.every((step) => step.skipped === undefined)).toBe(true);

    // 1단계: 소프트 삭제 29일 지난 그룹과 하위 기록 일체 + 그 여정에만 쓰인 거래(중복 표시 행 포함)
    expect(await db.group.count({ where: { id: s.softOld.group.id } })).toBe(0);
    expect(await db.trip.count({ where: { id: s.softOld.trip.id } })).toBe(0);
    expect(
      await db.membership.count({ where: { groupId: s.softOld.group.id } }),
    ).toBe(0);
    expect(await db.expense.count({ where: { id: s.softOldExpense.id } })).toBe(
      0,
    );
    expect(
      await db.settlement.count({ where: { tripId: s.softOld.trip.id } }),
    ).toBe(0);
    expect(
      await db.tripEvent.count({ where: { tripId: s.softOld.trip.id } }),
    ).toBe(0);
    expect(
      await db.transaction.count({
        where: { id: { in: [s.softOldTx.id, s.softOldDup.id] } },
      }),
    ).toBe(0);
    expect(await db.group.count({ where: { id: s.softRecent.group.id } })).toBe(
      1,
    );
    // 2단계
    expect(await db.group.count({ where: { id: s.endedOld.group.id } })).toBe(
      0,
    );
    expect(
      await db.group.count({ where: { id: s.endedRecent.group.id } }),
    ).toBe(1);
    // 3단계
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: s.rawOld.id } }))
        .rawPayloadEnc,
    ).toBeNull();
    expect(
      (
        await db.transaction.findUniqueOrThrow({
          where: { id: s.rawRecent.id },
        })
      ).rawPayloadEnc,
    ).not.toBeNull();
    // 4단계
    expect(
      await db.connectionAttempt.count({ where: { id: s.attemptOld.id } }),
    ).toBe(0);
    expect(
      await db.connectionAttempt.count({ where: { id: s.pay.attempt.id } }),
    ).toBe(1);
    // 5단계
    expect(await db.signupTicket.count({ where: { id: s.ticketOld.id } })).toBe(
      0,
    );
    expect(
      await db.signupTicket.count({ where: { id: s.ticketValid.id } }),
    ).toBe(1);
    expect(
      await db.session.count({
        where: {
          id: {
            in: [s.sessionExpired.session.id, s.sessionRevoked.session.id],
          },
        },
      }),
    ).toBe(0);
    expect(
      await db.session.count({ where: { id: s.sessionValid.session.id } }),
    ).toBe(1);
    // 6단계
    expect(
      await db.paymentMethod.count({ where: { id: s.methodOld.id } }),
    ).toBe(0);
    expect(
      await db.paymentMethod.count({
        where: { id: { in: [s.methodWithTx.id, s.methodRecent.id] } },
      }),
    ).toBe(2);
    expect(
      await db.paymentConnection.count({ where: { id: s.connectionOld.id } }),
    ).toBe(0);
    expect(
      await db.paymentConnection.count({
        where: { id: s.connectionRecent.id },
      }),
    ).toBe(1);
    // 7단계: 장기 미이용은 FR-109 파이프라인(INACTIVE)으로 탈퇴, 혼자인 그룹은 소프트 삭제
    expect(await db.user.count({ where: { id: s.inactive.id } })).toBe(0);
    expect(await db.user.count({ where: { id: s.almostInactive.id } })).toBe(1);
    expect(
      (
        await db.group.findUniqueOrThrow({
          where: { id: s.inactiveGroup.group.id },
        })
      ).deletedAt,
    ).toBeInstanceOf(Date);
    expect(
      await db.accountDeletion.count({
        where: {
          channel: 'INACTIVE',
          completedAt: { not: null },
          createdAt: { gte: daysAgo(0.01) },
        },
      }),
    ).toBeGreaterThanOrEqual(1);
    // 8~10단계
    expect(await db.userConsent.count({ where: { id: s.consentOld.id } })).toBe(
      0,
    );
    expect(
      await db.userConsent.count({ where: { id: s.consentRecent.id } }),
    ).toBe(1);
    expect(await db.accessLog.count({ where: { id: s.accessOld.id } })).toBe(0);
    expect(await db.accessLog.count({ where: { id: s.accessRecent.id } })).toBe(
      1,
    );
    expect(
      await db.accountDeletion.count({
        where: { id: { in: [s.deletionOld.id, s.deletionStale.id] } },
      }),
    ).toBe(0);
    expect(
      await db.accountDeletion.count({ where: { id: s.deletionRecent.id } }),
    ).toBe(1);

    // 다시 돌려도 남길 행은 남는다(멱등)
    await purge({}).expect(200);
    expect(await db.group.count({ where: { id: s.softRecent.group.id } })).toBe(
      1,
    );
    expect(
      await db.session.count({ where: { id: s.sessionValid.session.id } }),
    ).toBe(1);
  });

  it('skips steps while another run holds the job lock', async () => {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('yeojeong:jobs:purge'))`;
        const res = (await purge({}).expect(200)).body as PurgeJobResult;
        expect(
          res.steps.every(
            (step) => step.skipped === 'LOCKED' && step.count === 0,
          ),
        ).toBe(true);
      },
      { timeout: 15_000 },
    );
  });

  it('rejects a non-boolean dryRun', async () => {
    const res = await purge({ dryRun: 'yes' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
